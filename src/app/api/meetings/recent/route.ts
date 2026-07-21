import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Resolve business for this user
    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single()
    if (bizErr || !business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(parseInt(searchParams.get('limit') || '30', 10), 100)

    const { data: records, error } = await supabase
      .from('meeting_records')
      .select('google_calendar_event_id, status, completed_at, lead_id, job_id, notes, updated_at')
      .eq('business_id', business.id)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) return NextResponse.json({ error: 'Failed to fetch meetings' }, { status: 500 })

    return NextResponse.json({ records: records || [] })
  } catch (e) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
