import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { MeetArtifactProcessor } from '@/lib/meet-artifacts'
import { GoogleMeetClientImpl } from '@/lib/google/meet-client'
import { getEventTimes } from '@/lib/google/calendar'
import { summarizeMeetingTranscript } from '@/lib/openai-summary'

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (bizErr || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    // Verify meeting belongs to business and check cooldown
    const { data: rec } = await supabase
      .from('meeting_records')
      .select('id, business_id, google_calendar_event_id, transcript_status, next_processing_attempt_at, processing_attempts, status, google_meet_space_name, google_meet_code, actual_start, actual_end, ai_summary, ai_summary_structured')
      .eq('business_id', business.id)
      .eq('google_calendar_event_id', eventId)
      .maybeSingle()

    if (!rec) return NextResponse.json({ error: 'Meeting not found' }, { status: 404 })

    // Manual retry intentionally bypasses next_processing_attempt_at to allow explicit user-initiated processing
    // Cron processing will continue to respect cooldowns; idempotency is enforced within the processor.

    // Calendar times
    const times = await getEventTimes(business.id, eventId)

    const processor = new MeetArtifactProcessor({
      google: new GoogleMeetClientImpl(business.id),
      openai: { summarize: summarizeMeetingTranscript },
      repo: {
        async getBusinessByUser() { return business as any },
        async getMeetingRecord(businessId, eventId) {
          if (businessId !== business.id || eventId !== eventId) return null
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
      },
      timeline: {
        async meetingCompletedOnce(businessId, eventId, payload) {
          // Lightweight; durable idempotency via meeting_records
          console.log('[retry-artifacts] meeting_completed', { businessId, eventId })
        }
      },
      now: () => new Date(),
      windowEarlyMinutes: 90,
      windowLateMinutes: 90,
    })

    await supabase.from('meeting_records').update({ processing_attempts: (rec.processing_attempts || 0) + 1 }).eq('id', rec.id)
    const result = await processor.processOne({ id: business.id }, eventId, { start: times.start, end: times.end })
    return NextResponse.json({ success: true, status: result.status })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
