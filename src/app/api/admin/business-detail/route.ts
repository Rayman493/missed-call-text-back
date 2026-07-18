import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const businessId = searchParams.get('businessId')

    if (!businessId) {
      return NextResponse.json({ success: false, error: 'businessId required' }, { status: 400 })
    }

    const cookieStore = cookies()
    console.log('[SUPABASE SSR SOURCE] admin-business-detail')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN BUSINESS DETAIL] Fetching detail for business:', businessId)

    // Fetch business with full details
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[ADMIN BUSINESS DETAIL] Business not found:', businessError)
      return NextResponse.json({ success: false, error: 'Business not found' }, { status: 404 })
    }

    // Fetch owner email from auth.users
    let ownerEmail = null
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(business.user_id)
      ownerEmail = userData.user?.email || null
    } catch (error) {
      console.error('[ADMIN BUSINESS DETAIL] Failed to fetch owner email:', error)
    }

    // Fetch latest AI call (bounded to 1)
    const { data: latestAICall } = await supabaseAdmin
      .from('leads')
      .select('id, phone_number, ai_call_status, ai_call_sid, ai_call_duration, ai_call_completed_at, ai_call_error, created_at')
      .eq('business_id', businessId)
      .not('ai_call_status', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Count recent AI call failures (24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: aiFailureCount } = await supabaseAdmin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('ai_call_status', 'in', '(completed,pending)')
      .gte('created_at', twentyFourHoursAgo)

    // Fetch latest outbound SMS
    const { data: latestOutboundSMS } = await supabaseAdmin
      .from('messages')
      .select('id, direction, status, twilio_message_sid, created_at')
      .eq('business_id', businessId)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Count recent SMS failures (24 hours)
    const { count: smsFailureCount } = await supabaseAdmin
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .in('status', ['failed', 'undelivered'])
      .gte('created_at', twentyFourHoursAgo)

    // Fetch latest personal voicemail
    const { data: latestVoicemail } = await supabaseAdmin
      .from('personal_voicemails')
      .select('id, recording_sid, transcription_status, recording_status, processing_error, duration_seconds, created_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Count voicemail failures
    const { count: voicemailFailureCount } = await supabaseAdmin
      .from('personal_voicemails')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .is('transcription_text', null)
      .is('processing_error', null)
      .lt('created_at', twentyFourHoursAgo)

    // Fetch recent events (last 10) - note: business_events may not have deleted_at
    let recentEvents = []
    try {
      const { data: events } = await supabaseAdmin
        .from('business_events')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(10)
      recentEvents = events || []
    } catch (error) {
      console.log('[ADMIN BUSINESS DETAIL] business_events table may not exist')
      recentEvents = []
    }

    // Operational verification: Check if forwarding is actually working
    let forwardingOperational = false
    if (business.forwarding_verified) {
      // Check for recent successful AI calls (indicates forwarding is working)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: successfulAICalls } = await supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('ai_call_status', 'completed')
        .gte('created_at', sevenDaysAgo)

      forwardingOperational = (successfulAICalls || 0) > 0
    }

    // Operational verification: Check if Twilio number is actually provisioned
    let twilioOperational = false
    if (business.twilio_phone_number && business.provisioning_status === 'completed') {
      // Check for recent successful SMS (indicates Twilio is working)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { count: successfulSMS } = await supabaseAdmin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('direction', 'outbound')
        .in('status', ['sent', 'delivered'])
        .gte('created_at', sevenDaysAgo)

      twilioOperational = (successfulSMS || 0) > 0
    }

    const detailData = {
      business: {
        ...business,
        owner_email: ownerEmail
      },
      aiCall: latestAICall,
      aiFailureCount: aiFailureCount || 0,
      sms: latestOutboundSMS,
      smsFailureCount: smsFailureCount || 0,
      voicemail: latestVoicemail,
      voicemailFailureCount: voicemailFailureCount || 0,
      recentEvents: recentEvents || [],
      operational: {
        forwardingOperational,
        twilioOperational
      }
    }

    console.log('[ADMIN BUSINESS DETAIL] Detail fetched successfully')

    return NextResponse.json({
      success: true,
      detail: detailData
    })
  } catch (error: any) {
    console.error('[ADMIN BUSINESS DETAIL] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
