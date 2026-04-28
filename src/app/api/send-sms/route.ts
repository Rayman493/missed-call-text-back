import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    console.log('[Manual SMS] Send request received')

    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      console.error('[Manual SMS] Unauthorized - missing auth header')
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
      console.error('[Manual SMS] Unauthorized - invalid token')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { leadId, message } = body

    if (!leadId || !message) {
      console.error('[Manual SMS] Missing required fields:', { leadId, hasMessage: !!message })
      return NextResponse.json(
        { error: 'leadId and message are required' },
        { status: 400 }
      )
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      console.error('[Manual SMS] Empty message provided')
      return NextResponse.json(
        { error: 'Message cannot be empty' },
        { status: 400 }
      )
    }

    console.log('[Manual SMS] Fetching lead:', leadId)

    // Fetch lead with business ownership check
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('*, business!inner(user_id)')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[Manual SMS] Lead not found:', { leadId, error: leadError })
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    console.log('[Manual SMS] Lead found:', { leadId, phone: lead.caller_phone })

    // Verify user owns the business
    if (lead.business?.user_id !== user.id) {
      console.error('[Manual SMS] Forbidden - user does not own business')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('*')
      .eq('id', lead.business_id)
      .single()

    if (businessError || !business) {
      console.error('[Manual SMS] Business not found:', { businessId: lead.business_id, error: businessError })
      return NextResponse.json(
        { error: 'Business not found' },
        { status: 404 }
      )
    }

    console.log('[Manual SMS] Business found:', { businessId: business.id })

    // Fetch or create conversation
    let conversation
    const { data: existingConversation } = await supabaseAdmin
      .from('conversations')
      .select('*')
      .eq('lead_id', leadId)
      .maybeSingle()

    if (existingConversation) {
      conversation = existingConversation
      console.log('[Manual SMS] Conversation found:', conversation.id)
    } else {
      const { data: newConversation, error: createError } = await supabaseAdmin
        .from('conversations')
        .insert({
          lead_id: leadId,
          business_id: lead.business_id,
          status: 'open',
          started_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError || !newConversation) {
        console.error('[Manual SMS] Failed to create conversation:', createError)
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        )
      }
      conversation = newConversation
      console.log('[Manual SMS] Conversation created:', conversation.id)
    }

    // Insert message with pending status
    const { data: messageRecord, error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        lead_id: leadId,
        business_id: lead.business_id,
        direction: 'outbound',
        body: message.trim(),
        from_phone: business.twilio_phone_number,
        to_phone: lead.caller_phone,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (messageError || !messageRecord) {
      console.error('[Manual SMS] Failed to insert message:', messageError)
      return NextResponse.json(
        { error: 'Failed to create message record' },
        { status: 500 }
      )
    }

    console.log('[Manual SMS] Message record created:', messageRecord.id)

    // Send SMS
    const messageSid = await sendSms(business, lead.caller_phone, message.trim(), {
      lead_id: leadId,
      conversation_id: conversation.id
    })

    if (!messageSid) {
      console.error('[Manual SMS] Twilio send failed')
      
      // Update message status to failed
      await supabaseAdmin
        .from('messages')
        .update({
          status: 'failed',
          error_message: 'Failed to send SMS. Your Twilio number may still be pending verification.'
        })
        .eq('id', messageRecord.id)

      return NextResponse.json(
        { error: 'Message could not be sent. Your Twilio number may still be pending verification.' },
        { status: 500 }
      )
    }

    console.log('[Manual SMS] Twilio send success:', { messageSid })

    // Update message status to sent
    await supabaseAdmin
      .from('messages')
      .update({
        status: 'sent',
        twilio_message_sid: messageSid,
        status_updated_at: new Date().toISOString()
      })
      .eq('id', messageRecord.id)

    // Update conversation activity
    await supabaseAdmin
      .from('conversations')
      .update({
        last_activity_at: new Date().toISOString()
      })
      .eq('id', conversation.id)

    // Update lead last_message_at
    await supabaseAdmin
      .from('leads')
      .update({
        last_message_at: new Date().toISOString()
      })
      .eq('id', leadId)

    console.log('[Manual SMS] Send completed successfully')
    return NextResponse.json({ success: true, messageSid, messageId: messageRecord.id })
  } catch (error) {
    console.error('[Manual SMS] Error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
