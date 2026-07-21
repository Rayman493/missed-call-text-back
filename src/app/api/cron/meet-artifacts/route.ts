import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { MeetArtifactProcessor, type Repository, type Timeline } from '@/lib/meet-artifacts'
import { GoogleMeetClientImpl } from '@/lib/google/meet-client'
import { getEventTimes } from '@/lib/google/calendar'
import { summarizeMeetingTranscript } from '@/lib/openai-summary'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const auth = verifyCronRequest(request)
  if (!auth.authorized) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Bounded selection: recent Google Meet candidates where processing is due
  const now = new Date()
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: candidates } = await supabase
    .from('meeting_records')
    .select('id, business_id, google_calendar_event_id, status, transcript_status, next_processing_attempt_at, processing_attempts, google_meet_space_name, google_meet_code, actual_start, actual_end, ai_summary, ai_summary_structured')
    .or('transcript_status.is.null,not.transcript_status.eq.processed')
    .lte('updated_at', new Date().toISOString())
    .order('updated_at', { ascending: false })
    .limit(10)

  let checked = 0, processed = 0, pending = 0, permissionRequired = 0, failed = 0

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ success: true, checked, processed, pending, permissionRequired, failed })
  }

  for (const rec of candidates) {
    checked++

    // Honor next_processing_attempt_at
    if (rec.next_processing_attempt_at && new Date(rec.next_processing_attempt_at) > now) {
      continue
    }

    try {
      // Minimal repo and timeline adapters
      const repo: Repository = {
        async getBusinessByUser() { return null },
        async getMeetingRecord(businessId, eventId) {
          if (businessId !== rec.business_id || eventId !== rec.google_calendar_event_id) return null
          return rec as any
        },
        async updateMeetingRecord(id, patch) {
          await supabase.from('meeting_records').update(patch).eq('id', id)
        },
        async markCompletedIfUpcoming(id, completedAt) {
          if (rec.status === 'completed') return false
          await supabase.from('meeting_records').update({ status: 'completed', completed_at: completedAt, updated_at: new Date().toISOString() }).eq('id', id)
          return true
        }
      }

      const timeline: Timeline = {
        async meetingCompletedOnce(businessId, eventId, payload) {
          // Intentionally lightweight: rely on meeting_records as durable idempotency guard
          console.log('[meet-artifacts] meeting_completed', { businessId, eventId, payload })
        }
      }

      // Fetch scheduled times from Calendar
      const times = await getEventTimes(rec.business_id, rec.google_calendar_event_id)

      // Instantiate real Google client bound to business
      const google = new GoogleMeetClientImpl(rec.business_id)

      const processor = new MeetArtifactProcessor({
        google,
        openai: { summarize: summarizeMeetingTranscript },
        repo,
        timeline,
        now: () => new Date(),
        windowEarlyMinutes: 90,
        windowLateMinutes: 90,
      })

      // Increment attempts before processing
      await supabase.from('meeting_records').update({ processing_attempts: (rec.processing_attempts || 0) + 1 }).eq('id', rec.id)
      const result = await processor.processOne({ id: rec.business_id }, rec.google_calendar_event_id, { start: times.start, end: times.end })
      if (result.status === 'processed') processed++
      else if (result.status === 'pending') pending++
      else if (result.status === 'permission_required') permissionRequired++
    } catch (e) {
      failed++
      console.error('[meet-artifacts] record failed', { id: rec.id, error: String(e) })
    }
  }

  return NextResponse.json({ success: true, checked, processed, pending, permissionRequired, failed })
}
