import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { isIgnoredContact } from '@/lib/ignored-contacts'

export const dynamic = 'force-dynamic'

interface ConfirmationSMSRequest {
  businessId: string
  leadId: string
  conversationId: string
  callSid: string
  callerPhone: string
  businessName: string
  extractedInfo?: {
    service_requested?: string
    reason?: string
    summary?: string
    location?: string
  }
}

export async function POST(request: NextRequest) {
  console.log('[AI CONFIRMATION SMS START] Request received')

  try {
    const body: ConfirmationSMSRequest = await request.json()

    const {
      businessId,
      leadId,
      conversationId,
      callSid,
      callerPhone,
      businessName,
      extractedInfo
    } = body

    console.log('[AI CONFIRMATION SMS START]', {
      businessId,
      leadId,
      conversationId,
      callSid,
      callerPhone,
      businessName,
      extractedInfo
    })

    // Validate required fields
    if (!businessId || !leadId || !conversationId || !callSid || !callerPhone || !businessName) {
      console.log('[AI CONFIRMATION SMS ERROR] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Idempotency check - check if confirmation SMS already sent for this call
    console.log('[AI CONFIRMATION SMS IDEMPOTENCY CHECK]', { callSid, leadId, conversationId })

    const { data: existingMessage, error: checkError } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .eq('message_type', 'ai_confirmation')
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[AI CONFIRMATION SMS ERROR] Idempotency check failed:', checkError)
    }

    if (existingMessage) {
      console.log('[AI CONFIRMATION SMS SKIPPED DUPLICATE] Confirmation SMS already sent for this conversation', {
        messageId: existingMessage.id,
        conversationId
      })
      return NextResponse.json({ success: true, skipped: true, reason: 'duplicate' })
    }

    // Check opt-out/ignored contacts
    const isOptedOut = await checkOptOut(businessId, callerPhone)
    if (isOptedOut) {
      console.log('[AI CONFIRMATION SMS SKIPPED OPT-OUT] Caller has opted out', {
        callerPhone,
        businessId
      })
      return NextResponse.json({ success: true, skipped: true, reason: 'opt_out' })
    }

    // Get business to find Twilio phone number
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('twilio_phone_number, twilio_messaging_service_sid, auto_reply_message')
      .eq('id', businessId)
      .single()

    if (businessError || !business) {
      console.error('[AI CONFIRMATION SMS ERROR] Failed to fetch business:', businessError)
      return NextResponse.json({ error: 'Failed to fetch business' }, { status: 500 })
    }

    // Build confirmation message
    const serviceRequested = extractedInfo?.service_requested || extractedInfo?.reason || extractedInfo?.summary || 'your request'
    const locationText = extractedInfo?.location ? ` at ${extractedInfo.location}` : ''

    const messageBody = `Hi, this is ${businessName}. Thanks for calling — we got your request about ${serviceRequested}${locationText}. We'll follow up as soon as possible. If there's anything else we should know, just reply to this text.`

    console.log('[AI CONFIRMATION SMS BODY]', {
      businessName,
      serviceRequested,
      locationText,
      messageBody
    })

    // Send SMS
    console.log('[AI CONFIRMATION SMS SENDING]', {
      to: callerPhone,
      from: business.twilio_phone_number,
      messagingServiceSid: business.twilio_messaging_service_sid
    })

    let twilioMessageSid: string | null = null
    let smsError: Error | null = null

    try {
      twilioMessageSid = await sendSms(
        business,
        callerPhone,
        messageBody,
        {
          lead_id: leadId,
          conversation_id: conversationId
        }
      )

      if (twilioMessageSid) {
        console.log('[AI CONFIRMATION SMS SENT]', { twilioMessageSid })
      }
    } catch (error) {
      smsError = error as Error
      console.error('[AI CONFIRMATION SMS ERROR]', error)
    }

    // Insert message into messages table regardless of SMS send success
    console.log('[AI CONFIRMATION SMS MESSAGE SAVING]', {
      businessId,
      leadId,
      conversationId,
      direction: 'outbound',
      twilioMessageSid
    })

    const { data: message, error: messageError } = await supabaseAdmin
      .from('messages')
      .insert({
        business_id: businessId,
        lead_id: leadId,
        conversation_id: conversationId,
        direction: 'outbound',
        body: messageBody,
        status: smsError ? 'failed' : 'sent',
        twilio_message_sid: twilioMessageSid,
        message_type: 'ai_confirmation',
        error_message: smsError ? smsError.message : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (messageError) {
      console.error('[AI CONFIRMATION SMS ERROR] Failed to save message:', messageError)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    console.log('[AI CONFIRMATION SMS MESSAGE SAVED]', {
      messageId: message.id,
      conversationId,
      status: message.status
    })

    // Update conversation last_activity_at
    await supabaseAdmin
      .from('conversations')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', conversationId)

    return NextResponse.json({
      success: true,
      messageId: message.id,
      twilioMessageSid,
      status: message.status,
      skipped: false
    })

  } catch (error) {
    console.error('[AI CONFIRMATION SMS ERROR]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function checkOptOut(businessId: string, phoneNumber: string): Promise<boolean> {
  try {
    // Check if lead is opted out
    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('raw_metadata')
      .eq('business_id', businessId)
      .eq('phone', phoneNumber)
      .single()

    if (lead?.raw_metadata?.opted_out) {
      return true
    }

    // Check if number is ignored
    const ignored = await isIgnoredContact(businessId, phoneNumber)
    return ignored
  } catch (error) {
    console.error('[AI CONFIRMATION SMS OPT-OUT CHECK ERROR]', error)
    return false
  }
}
