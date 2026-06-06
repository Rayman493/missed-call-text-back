import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'

export async function POST(request: NextRequest) {
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

    // Get lead ID from request body
    const body = await request.json()
    const { leadId } = body

    if (!leadId) {
      return NextResponse.json({ error: 'leadId is required' }, { status: 400 })
    }

    // Get lead and verify business ownership
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, business_id, caller_phone')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Verify business belongs to user
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, user_id')
      .eq('id', lead.business_id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden - Lead access denied' }, { status: 403 })
    }

    // Get last outbound message for this lead
    const { data: lastMessage, error: messageError } = await supabase
      .from('messages')
      .select('*')
      .eq('lead_id', leadId)
      .eq('direction', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (messageError || !lastMessage) {
      return NextResponse.json({ error: 'No outbound message found for this lead' }, { status: 404 })
    }

    // Resend the SMS using the same logic as the normal send-sms endpoint
    const sendResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/send-sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        leadId: leadId,
        message: lastMessage.body,
      }),
    })

    if (!sendResponse.ok) {
      const errorData = await sendResponse.json()
      console.error('[Admin Resend Last SMS] Error resending message:', errorData)
      return NextResponse.json({ error: 'Failed to resend message' }, { status: 500 })
    }

    console.log('[Admin Resend Last SMS] Message resent successfully:', leadId)

    return NextResponse.json({
      success: true,
      message: 'Message resent successfully'
    })
  } catch (error) {
    console.error('[Admin Resend Last SMS] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
