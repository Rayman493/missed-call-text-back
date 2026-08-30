import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCronRequest } from "@/lib/cron-auth";
import { sendPushForNotification } from "@/lib/push-delivery";
import { processReminderNotifications } from "@/lib/reminder-worker";

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

export async function POST(request: Request) {
  try {
    // Verify cron secret using shared helper
    const authResult = verifyCronRequest(request as any)
    if (!authResult.authorized) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    console.log('[Cron] Authorized cron request to /api/cron/process-reminder-notifications');
    console.log('[REMINDER NOTIFICATIONS] Processing started');

    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Use extracted worker function with real dependencies
    const result = await processReminderNotifications({
      fetchEligibleTasks: async () => {
        const { data, error } = await supabase
          .from('tasks')
          .select('id, title, business_id, completed, reminder_notify_at')
          .eq('completed', false)
          .not('reminder_notify_at', 'is', null)
          .lte('reminder_notify_at', now)
          .gte('reminder_notify_at', oneHourAgo)
          .limit(10)
          .order('reminder_notify_at', { ascending: true });

        if (error) {
          console.error('[REMINDER NOTIFICATIONS] Error fetching tasks:', error);
          throw error;
        }

        return data || [];
      },

      clearStaleSchedules: async () => {
        const { data: staleRows, error } = await supabase
          .from('tasks')
          .update({ reminder_notify_at: null })
          .eq('completed', false)
          .not('reminder_notify_at', 'is', null)
          .lt('reminder_notify_at', oneHourAgo)
          .select('id');

        if (error) {
          console.error('[REMINDER NOTIFICATIONS] Error clearing stale schedules:', error);
          return 0;
        }

        const staleCount = staleRows?.length || 0;
        console.log(`[REMINDER NOTIFICATIONS] Cleared ${staleCount} stale schedules`);
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
          console.error(`[REMINDER NOTIFICATIONS] Failed to clear schedule for task ${taskId}:`, error);
        }
      }
    });

    console.log(`[REMINDER NOTIFICATIONS] Complete - Processed: ${result.processed}, Sent: ${result.sent}, Failed: ${result.failed}, Stale Cleared: ${result.stale_cleared}`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('[REMINDER NOTIFICATIONS] Unexpected error:', error);
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