import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronRequest } from "@/lib/cron-auth";
import { sendPushForNotification } from "@/lib/push-delivery";
import { processReminderNotifications } from "@/lib/reminder-worker";
import { getSeriesForTemplate, nextPendingNotifyAt } from "@/lib/recurrence/service";
import { calculateReminderNotifyAt } from "@/lib/reminder-notification-utils";

// Helper function to validate environment variables
function getRequiredEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// Initialize Supabase client with service role key (server-side only)
const supabase = createClient(
  getRequiredEnvVar('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredEnvVar('SUPABASE_SERVICE_ROLE_KEY')
);

// Stale schedule cleanup threshold. Reminders older than this are considered
// permanently missed and their schedule is cleared to prevent unbounded
// growth. This must be significantly wider than the cron cadence (5 minutes)
// and any reasonable deploy/restart gap. 7 days ensures that even a multi-day
// platform outage does not permanently skip a reminder — the idempotency key
// prevents duplicate notifications if the cron catches up later.
const STALE_SCHEDULE_THRESHOLD_DAYS = 7;
const STALE_SCHEDULE_THRESHOLD_MS = STALE_SCHEDULE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    // Verify cron secret using shared helper
    const authResult = verifyCronRequest(request as any)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - STALE_SCHEDULE_THRESHOLD_MS).toISOString();

    console.log('[REMINDER_SCAN_START]', {
      now,
      staleThreshold,
      staleThresholdDays: STALE_SCHEDULE_THRESHOLD_DAYS
    });

    // Use extracted worker function with real dependencies
    const result = await processReminderNotifications({
      fetchEligibleTasks: async () => {
        // Select ALL due reminders regardless of age — no lower-bound lookback.
        // The previous 1-hour lookback window (gte oneHourAgo) caused
        // reminders to be permanently skipped if the cron did not run within
        // 1 hour of the scheduled time (deploy, restart, Vercel cron gap).
        // The idempotency key on notification insert prevents duplicates, and
        // clearSchedule after successful processing prevents re-processing.
        // Stale schedules older than STALE_SCHEDULE_THRESHOLD_DAYS are cleaned
        // up by clearStaleSchedules below.
        const { data, error } = await supabase
          .from('tasks')
          .select('id, title, business_id, completed, reminder_notify_at')
          .eq('completed', false)
          .not('reminder_notify_at', 'is', null)
          .lte('reminder_notify_at', now)
          .limit(50)
          .order('reminder_notify_at', { ascending: true });

        if (error) {
          console.error('[REMINDER_SCAN] Error fetching tasks:', error);
          throw error;
        }

        console.log('[REMINDER_SCAN] Eligible tasks:', (data || []).length);
        return data || [];
      },

      clearStaleSchedules: async () => {
        // Only clear schedules older than STALE_SCHEDULE_THRESHOLD_DAYS.
        // The previous 1-hour threshold was too aggressive — it wiped
        // reminder_notify_at without creating a notification, permanently
        // skipping any reminder the cron didn't process within 1 hour.
        // With a 7-day threshold, reminders survive deploy/restart gaps and
        // are still picked up when the cron resumes.
        const { data: staleRows, error } = await supabase
          .from('tasks')
          .update({ reminder_notify_at: null })
          .eq('completed', false)
          .not('reminder_notify_at', 'is', null)
          .lt('reminder_notify_at', staleThreshold)
          .select('id');

        if (error) {
          console.error('[REMINDER_SCAN] Error clearing stale schedules:', error);
          return 0;
        }

        const staleCount = staleRows?.length || 0;
        if (staleCount > 0) {
          console.log('[REMINDER_SCAN] Cleared stale schedules (older than ' +
            STALE_SCHEDULE_THRESHOLD_DAYS + ' days):', staleCount);
        }
        return staleCount;
      },

      reReadTask: async (taskId: string) => {
        const { data, error } = await supabase
          .from('tasks')
          .select('id, title, completed, reminder_notify_at, business_id')
          .eq('id', taskId)
          .maybeSingle();

        if (error || !data) {
          return null;
        }

        return data;
      },

      insertNotification: async (notification) => {
        const { data, error } = await supabase
          .from('notifications')
          .insert(notification)
          .select()
          .single();

        if (error) {
          return { error };
        }

        return data;
      },

      sendPush: async (notification) => {
        await sendPushForNotification(notification);
      },

      clearSchedule: async (taskId: string, originalNotifyAt: string) => {
        const { error } = await supabase
          .from('tasks')
          .update({ reminder_notify_at: null })
          .eq('id', taskId)
          .eq('reminder_notify_at', originalNotifyAt);

        if (error) {
          console.error(`[REMINDER_SCAN] Failed to clear schedule for task ${taskId}:`, error);
          return;
        }

        // Recurrence re-arm: if this task is a recurring series template,
        // schedule the notification for the next pending occurrence.
        try {
          const { data: task } = await supabase
            .from('tasks')
            .select('business_id, due_time, reminder_offset_minutes')
            .eq('id', taskId)
            .single();
          const series = task?.business_id
            ? await getSeriesForTemplate(supabase as any, task.business_id, 'task', taskId)
            : null;
          if (series && task) {
            const { data: business } = await supabase
              .from('businesses')
              .select('timezone')
              .eq('id', task.business_id)
              .single();
            const timezone = business?.timezone || 'America/New_York';
            const offset = task?.reminder_offset_minutes ?? 30;
            const nextNotify = await nextPendingNotifyAt(
              supabase as any,
              series,
              (dueDate) => calculateReminderNotifyAt({ dueDate, dueTime: task?.due_time || null, offsetMinutes: offset, timezone }),
              new Date().toISOString(),
            );
            if (nextNotify) {
              await supabase.from('tasks').update({ reminder_notify_at: nextNotify }).eq('id', taskId);
            }
          }
        } catch (rearmError) {
          console.error(`[REMINDER_SCAN] Failed to re-arm recurring task ${taskId}:`, rearmError);
        }
      }
    });

    console.log('[REMINDER_SCAN_COMPLETE]', result);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[REMINDER_SCAN] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Also support GET for testing
export async function GET(request: Request) {
  return POST(request);
}
