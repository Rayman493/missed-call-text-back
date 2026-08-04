import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timelineEvents } from '@/lib/event-timeline'
import { MeetArtifactProcessor, type Repository, type Timeline } from '@/lib/meet-artifacts'
import { GoogleMeetClientImpl } from '@/lib/google/meet-client'
import { getEventTimes } from '@/lib/google/calendar'
import { summarizeMeetingTranscript } from '@/lib/openai-summary'
import { createClient } from '@supabase/supabase-js'
import { claimMeetingProcessingLease, releaseMeetingProcessingLease } from '@/lib/meet-lease'

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const lead_id: string | undefined = body?.lead_id
    const job_id: string | undefined = body?.job_id
    const meeting_title: string | undefined = body?.title
    const scheduled_start: string | undefined = body?.scheduled_start
    const scheduled_end: string | undefined = body?.scheduled_end

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (bizErr || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    // Idempotent completion: if already completed, return existing
    const { data: existing, error: fetchErr } = await supabase
      .from('meeting_records')
      .select('id, status, completed_at, notes, lead_id, job_id')
      .eq('business_id', business.id)
      .eq('google_calendar_event_id', eventId)
      .maybeSingle()

    const completedAt = new Date().toISOString()

    if (fetchErr) return NextResponse.json({ error: 'Failed to fetch meeting record' }, { status: 500 })

    if (existing && existing.status === 'completed' && existing.completed_at) {
      // Already completed - return as idempotent success
      return NextResponse.json({
        record: { ...existing, completed_at: existing.completed_at, status: 'completed' },
        idempotent: true,
      })
    }

    // Upsert to completed
    const payload: any = {
      business_id: business.id,
      google_calendar_event_id: eventId,
      status: 'completed',
      completed_at: completedAt,
      updated_at: completedAt,
    }
    if (lead_id) payload.lead_id = lead_id
    if (job_id) payload.job_id = job_id

    const { data: upserted, error } = await supabase
      .from('meeting_records')
      .upsert(payload, { onConflict: 'business_id,google_calendar_event_id' })
      .select('id, business_id, google_calendar_event_id, lead_id, job_id, status, completed_at, notes, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: 'Failed to mark meeting complete' }, { status: 500 })

    // Timeline event: meeting_completed (idempotent at consumer by event id)
    try {
      await timelineEvents.meetingCompleted(
        business.id,
        eventId,
        meeting_title || 'Appointment',
        scheduled_start || '',
        scheduled_end || '',
        completedAt,
        lead_id,
        job_id
      )
    } catch {}

    // Update lead status for workflow completion if lead_id is provided
    if (lead_id) {
      try {
        const { data: lead } = await supabase
          .from('leads')
          .select('id, status')
          .eq('id', lead_id)
          .single()

        if (lead) {
          const { applyCustomerStatusEvent } = await import('@/lib/customer-status-transitions')
          const nextStatus = applyCustomerStatusEvent(lead.status, 'workflow_completed')

          if (nextStatus) {
            const { error: statusUpdateError } = await supabase
              .from('leads')
              .update({ status: nextStatus })
              .eq('id', lead_id)

            if (statusUpdateError) {
              console.error('[Meeting Complete] Error updating lead status:', statusUpdateError)
            } else {
              console.log('[Meeting Complete] Lead status updated via transition helper:', {
                leadId: lead.id,
                previousStatus: lead.status,
                newStatus: nextStatus
              })
            }
          } else {
            console.log('[Meeting Complete] Status transition not allowed:', {
              leadId: lead.id,
              currentStatus: lead.status
            })
          }
        }
      } catch (statusError) {
        console.error('[Meeting Complete] Exception during status update (non-critical):', statusError)
        // Don't fail the request for status update errors
      }
    }

    // Trigger immediate transcript processing asynchronously (non-blocking)
    // This ensures early-completed meetings get processed without waiting for cron
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Fire and forget - don't await to avoid blocking response
    processTranscriptAsync(serviceSupabase, business.id, eventId, scheduled_start, scheduled_end).catch((err: unknown) => {
      console.error('[complete] transcript processing failed:', err)
    })

    return NextResponse.json({ record: upserted, idempotent: false })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Async helper function to process transcript without blocking the response
async function processTranscriptAsync(
  supabase: any,
  businessId: string,
  eventId: string,
  scheduledStart: string | undefined,
  scheduledEnd: string | undefined
): Promise<void> {
  try {
    // Fetch the meeting record to get current state
    const { data: record } = await supabase
      .from('meeting_records')
      .select('*')
      .eq('business_id', businessId)
      .eq('google_calendar_event_id', eventId)
      .single()
    
    if (!record) {
      return
    }
    
    // Idempotency check: skip if already processed
    if (record.transcript_status === 'processed' && record.ai_summary && record.ai_summary_structured) {
      return
    }
    
    // If status is unavailable, reset for manual retry attempt
    if (record.transcript_status === 'unavailable') {
      await supabase
        .from('meeting_records')
        .update({ 
          transcript_status: 'pending',
          processing_attempts: 0, // Reset attempt counter
          next_processing_attempt_at: new Date().toISOString(), // Process immediately
          processing_error: null
        })
        .eq('id', record.id)
      // Update local record for subsequent processing
      record.transcript_status = 'pending'
      record.processing_attempts = 0
      record.next_processing_attempt_at = new Date().toISOString()
    }
    
    // Claim lease for processing
    const leaseResult = await claimMeetingProcessingLease(record.id)
    if (!leaseResult.success) {
      // Another process is already handling this meeting
      return
    }
    
    // Increment retry attempts only after successful lease claim
    const nextAttempt = (record.processing_attempts || 0) + 1
    await supabase.from('meeting_records').update({ processing_attempts: nextAttempt }).eq('id', record.id)
    
    // Set up repository adapter
    const repo: Repository = {
      async getBusinessByUser() { return null },
      async getMeetingRecord(bid: string, eid: string) {
        if (bid !== businessId || eid !== eventId) return null
        return record as any
      },
      async updateMeetingRecord(id: string, patch: any) {
        await supabase.from('meeting_records').update(patch).eq('id', id)
      },
      async markCompletedIfUpcoming(id: string, completedAt: string) {
        if (record.status === 'completed') return false
        await supabase.from('meeting_records').update({ 
          status: 'completed', 
          completed_at: completedAt, 
          updated_at: new Date().toISOString() 
        }).eq('id', id)
        return true
      }
    }
    
    // Set up timeline adapter
    const timeline: Timeline = {
      async meetingCompletedOnce(bid: string, eid: string, payload: any) {
        // Intentionally lightweight: rely on meeting_records as durable idempotency guard
      }
    }
    
    // Fetch scheduled times from Calendar
    const times = await getEventTimes(businessId, eventId)
    
    // Instantiate Google client
    const google = new GoogleMeetClientImpl(businessId)
    
    // Create processor
    const processor = new MeetArtifactProcessor({
      google,
      openai: { summarize: summarizeMeetingTranscript },
      repo,
      timeline,
      now: () => new Date(),
      windowEarlyMinutes: 90,
      windowLateMinutes: 90,
    })
    
    let result
    try {
      // Process the meeting
      result = await processor.processOne(
        { id: businessId },
        eventId,
        { start: times.start || scheduledStart, end: times.end || scheduledEnd }
      )
    } finally {
      // Release lease after processing (success or failure)
      if (leaseResult.claim) {
        await releaseMeetingProcessingLease(record.id, leaseResult.claim.claimedAt)
      }
    }
  } catch (error) {
    console.error('[complete] Transcript processing error:', error)
    // Don't throw - this is a fire-and-forget operation
  }
}
