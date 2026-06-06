import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    // Get business ID from query params
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('businessId')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (!businessId) {
      return NextResponse.json({ error: 'businessId is required' }, { status: 400 })
    }

    // Verify business exists and belongs to user
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden - Business access denied' }, { status: 403 })
    }

    // Get recent activity - leads, messages, call events, follow-up jobs
    const { data: leads } = await supabase
      .from('leads')
      .select('id, caller_phone, contact_name, status, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: messages } = await supabase
      .from('messages')
      .select('id, lead_id, direction, body, status, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: callEvents } = await supabase
      .from('call_events')
      .select('id, lead_id, call_status, call_duration, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    const { data: followUpJobs } = await supabase
      .from('follow_up_jobs')
      .select('id, lead_id, status, scheduled_at, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    // Combine and sort by timestamp
    const activities = [
      ...(leads || []).map(l => ({
        type: 'lead_created',
        leadId: l.id,
        phone: l.caller_phone,
        name: l.contact_name,
        status: l.status,
        timestamp: l.created_at,
      })),
      ...(messages || []).map(m => ({
        type: 'message_sent',
        leadId: m.lead_id,
        direction: m.direction,
        status: m.status,
        timestamp: m.created_at,
      })),
      ...(callEvents || []).map(c => ({
        type: 'call_received',
        leadId: c.lead_id,
        status: c.call_status,
        duration: c.call_duration,
        timestamp: c.created_at,
      })),
      ...(followUpJobs || []).map(f => ({
        type: 'followup_sent',
        leadId: f.lead_id,
        status: f.status,
        scheduledAt: f.scheduled_at,
        timestamp: f.created_at,
      })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      activities,
    })
  } catch (error) {
    console.error('[Admin Activity Logs] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
