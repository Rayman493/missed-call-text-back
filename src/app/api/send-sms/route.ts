import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'

export async function POST(request: NextRequest) {
  try {
    console.log('[SYSTEM] [SMS] Send SMS request received');
    
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

    // Fetch lead
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[SYSTEM] [SMS] Lead not found:', { leadId, error: leadError });
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
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
