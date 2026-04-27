import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    console.log('[SYSTEM] [SMS] Send SMS request received');

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Security] Unauthorized request to /api/send-sms - missing auth header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user from auth header
    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      console.error('[Security] Unauthorized request to /api/send-sms - invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { leadId, message } = body

    if (!leadId || !message) {
      console.error('[SYSTEM] [SMS] Missing required fields:', { leadId, hasMessage: !!message });
      return NextResponse.json(
        { error: 'leadId and message are required' },
        { status: 400 }
      )
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      console.error('[SYSTEM] [SMS] Empty message provided');
      return NextResponse.json(
        { error: 'Message cannot be empty' },
        { status: 400 }
      )
    }

    // Fetch lead with business ownership check
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*, business!inner(user_id)')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[SYSTEM] [SMS] Lead not found:', { leadId, error: leadError });
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Verify user owns the business
    if (lead.business?.user_id !== user.id) {
      console.error('[Security] Forbidden business access - user', user.id, 'attempted to send SMS for lead', leadId, 'belonging to business', lead.business_id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    console.log('[SYSTEM] [SMS] Lead found:', { leadId, phone: lead.caller_phone });

    // Fetch business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', lead.business_id)
      .single()

    if (businessError || !business) {
      console.error('[SYSTEM] [SMS] Business not found:', { businessId: lead.business_id, error: businessError });
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[SYSTEM] [SMS] Business found:', { businessId: business.id });

    // Send SMS
    const messageSid = await sendSms(business, lead.caller_phone, message.trim(), {
      lead_id: leadId
    })

    if (!messageSid) {
      console.error('[SYSTEM] [SMS] Failed to send SMS:', { leadId, phone: lead.caller_phone });
      return NextResponse.json(
        { error: 'Failed to send SMS' },
        { status: 500 }
      )
    }

    console.log('[SYSTEM] [SMS] SMS sent successfully:', { leadId, phone: lead.caller_phone, messageSid });
    return NextResponse.json({ success: true, messageSid })
  } catch (error) {
    console.error('[SYSTEM] [SMS] Error in send-sms API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
