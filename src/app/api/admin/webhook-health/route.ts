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

    // Get recent webhook activity from call_events and messages
    const { data: recentCalls } = await supabase
      .from('call_events')
      .select('id, call_status, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: recentMessages } = await supabase
      .from('messages')
      .select('id, direction, status, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: recentFollowUps } = await supabase
      .from('follow_up_jobs')
      .select('id, status, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)

    // Calculate health metrics
    const lastVoiceWebhook = recentCalls?.[0]?.created_at || null
    const lastVoiceStatusWebhook = recentCalls?.[0]?.created_at || null
    const lastSMSWebhook = recentMessages?.[0]?.created_at || null
    const lastFollowUpCron = recentFollowUps?.[0]?.created_at || null

    // Check for recent failures
    const failedCalls = recentCalls?.filter(c => c.call_status === 'failed') || []
    const failedMessages = recentMessages?.filter(m => m.status === 'failed') || []
    const failedFollowUps = recentFollowUps?.filter(f => f.status === 'failed') || []

    const health = {
      lastVoiceWebhook,
      lastVoiceStatusWebhook,
      lastSMSWebhook,
      lastFollowUpCron,
      recentFailures: {
        calls: failedCalls.length,
        messages: failedMessages.length,
        followUps: failedFollowUps.length,
      },
      status: (failedCalls.length > 0 || failedMessages.length > 0 || failedFollowUps.length > 0)
        ? 'degraded'
        : 'healthy',
    }

    return NextResponse.json({
      success: true,
      health,
    })
  } catch (error) {
    console.error('[Admin Webhook Health] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
