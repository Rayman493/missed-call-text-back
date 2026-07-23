import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timelineEvents } from '@/lib/event-timeline'

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

    return NextResponse.json({ record: upserted, idempotent: false })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
