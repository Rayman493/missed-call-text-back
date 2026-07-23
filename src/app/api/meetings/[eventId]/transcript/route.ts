import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
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

    const { data: rec, error: recErr } = await supabase
      .from('meeting_records')
      .select('id, business_id, google_calendar_event_id, transcript_text, transcript_source, transcript_fetched_at, transcript_status')
      .eq('business_id', business.id)
      .eq('google_calendar_event_id', eventId)
      .maybeSingle()

    if (recErr) return NextResponse.json({ error: 'Failed to load transcript' }, { status: 500 })
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!rec.transcript_text) {
      return NextResponse.json({ success: false, status: rec.transcript_status || null }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      transcript: rec.transcript_text,
      source: rec.transcript_source || null,
      fetchedAt: rec.transcript_fetched_at || null,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
