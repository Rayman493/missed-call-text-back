import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getMeetCapability } from '@/lib/google/capability'

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve business for this user
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (bizErr || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const { data: record, error } = await supabase
      .from('meeting_records')
      .select('id, business_id, google_calendar_event_id, lead_id, job_id, status, completed_at, notes, created_at, updated_at, google_meet_space_name, google_meet_code, google_conference_record_name, actual_start, actual_end, transcript_status, ai_summary, ai_summary_structured, summarized_at, processing_error')
      .eq('business_id', business.id)
      .eq('google_calendar_event_id', eventId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'Failed to fetch meeting' }, { status: 500 })
    const capability = await getMeetCapability(business.id)
    return NextResponse.json({ record: record || null, meetCapability: capability })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const notes: string | null | undefined = body?.notes
    const lead_id: string | undefined = body?.lead_id
    const job_id: string | undefined = body?.job_id

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (bizErr || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    // Upsert meeting record
    const payload: any = {
      business_id: business.id,
      google_calendar_event_id: eventId,
      status: 'upcoming',
      updated_at: new Date().toISOString(),
    }
    if (typeof notes !== 'undefined') payload.notes = notes
    if (lead_id) payload.lead_id = lead_id
    if (job_id) payload.job_id = job_id

    const { data: upserted, error } = await supabase
      .from('meeting_records')
      .upsert(payload, { onConflict: 'business_id,google_calendar_event_id' })
      .select('id, business_id, google_calendar_event_id, lead_id, job_id, status, completed_at, notes, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: 'Failed to save meeting notes' }, { status: 500 })

    return NextResponse.json({ record: upserted })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
