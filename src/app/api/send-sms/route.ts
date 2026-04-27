import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { leadId, message } = body

    if (!leadId || !message) {
      return NextResponse.json(
        { error: 'leadId and message are required' },
        { status: 400 }
      )
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
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
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Fetch business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', lead.business_id)
      .single()

    if (businessError || !business) {
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    // Send SMS
    const messageSid = await sendSms(business, lead.caller_phone, message.trim(), {
      lead_id: leadId
    })

    if (!messageSid) {
      return NextResponse.json(
        { error: 'Failed to send SMS' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, messageSid })
  } catch (error) {
    console.error('Error in send-sms API:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
