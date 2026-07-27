import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { createClient } from '@supabase/supabase-js'
import { MeetArtifactProcessor, type Repository, type Timeline } from '@/lib/meet-artifacts'
import { GoogleMeetClientImpl } from '@/lib/google/meet-client'
import { getEventTimes } from '@/lib/google/calendar'
import { summarizeMeetingTranscript } from '@/lib/openai-summary'
import { claimMeetingProcessingLease, releaseMeetingProcessingLease } from '@/lib/meet-lease'

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

  // Select only due Google Meet candidates where processing is eligible now
  const now = new Date()
  const nowIso = now.toISOString()
  const { data: candidates, error: qerr } = await supabase
    .from('meeting_records')
    .select('id, business_id, google_calendar_event_id, status, transcript_status, next_processing_attempt_at, processing_attempts, google_meet_space_name, google_meet_code, actual_start, actual_end, ai_summary, ai_summary_structured')
    // Exclude terminal states while explicitly preserving NULL
    .or('transcript_status.is.null,and(transcript_status.neq.processed,transcript_status.neq.unavailable)')
    // Due-ness: allow NULL next_processing_attempt_at or <= now
    .or(`next_processing_attempt_at.is.null,next_processing_attempt_at.lte.${nowIso}`)
    // Deterministic ordering: due soonest first (NULLs treated as due), then updated_at, then id
    .order('next_processing_attempt_at', { ascending: true, nullsFirst: true })
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    // Bounded batch size to avoid timeouts/starvation
    .limit(25)

  if (qerr) {
    return NextResponse.json({ success: false, error: 'candidate_query_failed' }, { status: 500 })
  }

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

    // Claim lease for processing using shared helper
    const leaseResult = await claimMeetingProcessingLease(rec.id)
    if (!leaseResult.success) {
      // Another worker claimed this record, skip it
      continue
    }

    try {
      // Minimal repo and timeline adapters
      const repo: Repository = {
        async getBusinessByUser() { return null },
        async getMeetingRecord(businessId, eventId) {
          if (businessId !== rec.business_id || eventId !== rec.google_calendar_event_id) return null
          const { data } = await supabase
            .from('meeting_records')
            .select('*')
            .eq('id', rec.id)
            .single()
          return (data as any) || null
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

      // Increment attempts only after successful lease claim
      const nextAttempt = (rec.processing_attempts || 0) + 1
      await supabase.from('meeting_records').update({ processing_attempts: nextAttempt }).eq('id', rec.id)
      const result = await processor.processOne({ id: rec.business_id }, rec.google_calendar_event_id, { start: times.start, end: times.end })
      if (result.status === 'processed') processed++
      else if (result.status === 'pending') pending++
      else if (result.status === 'permission_required') permissionRequired++
    } catch (e) {
      failed++
      console.error('[meet-artifacts] record failed', { id: rec.id, error: String(e) })
    } finally {
      // Release lease after processing (success or failure)
      if (leaseResult.claim) {
        await releaseMeetingProcessingLease(rec.id, leaseResult.claim.claimedAt)
      }
    }
  }

  return NextResponse.json({ success: true, checked, processed, pending, permissionRequired, failed })
}
