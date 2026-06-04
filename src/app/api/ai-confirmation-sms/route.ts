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

    console.log('[AI CONFIRMATION SMS INPUT]', {
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
      console.log('[AI CONFIRMATION SMS ERROR] Missing required fields', {
        hasBusinessId: !!businessId,
        hasLeadId: !!leadId,
        hasConversationId: !!conversationId,
        hasCallSid: !!callSid,
        hasCallerPhone: !!callerPhone,
        hasBusinessName: !!businessName
      })
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Idempotency check - check if confirmation SMS already sent for this call
    console.log('[AI CONFIRMATION SMS DUPLICATE CHECK]', {
      conversationId,
      direction: 'outbound',
      message_type: 'ai_confirmation'
    })

    const { data: existingMessage, error: checkError } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .eq('message_type', 'ai_confirmation')
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('[AI CONFIRMATION SMS DB ERROR]', {
        operation: 'duplicate check select',
        code: checkError.code,
        message: checkError.message,
        details: checkError.details,
        hint: checkError.hint
      })
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

    if (businessError) {
      console.error('[AI CONFIRMATION SMS DB ERROR]', {
        operation: 'business lookup select',
        code: businessError.code,
        message: businessError.message,
        details: businessError.details,
        hint: businessError.hint
      })
      return NextResponse.json({ error: 'Failed to fetch business' }, { status: 500 })
    }

    if (!business) {
      console.error('[AI CONFIRMATION SMS ERROR] Business not found', { businessId })
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    console.log('[AI CONFIRMATION SMS BUSINESS LOOKUP RESULT]', {
      hasTwilioPhoneNumber: !!business.twilio_phone_number,
      hasMessagingServiceSid: !!business.twilio_messaging_service_sid
    })

    // Build confirmation message
    const serviceRequested = extractedInfo?.service_requested || extractedInfo?.reason || extractedInfo?.summary || 'your request'
    const locationText = extractedInfo?.location ? ` at ${extractedInfo.location}` : ''

    const messageBody = `Hi, this is ${businessName}. Thanks for calling — we got your request about ${serviceRequested}${locationText}. We'll follow up as soon as possible. If there's anything else we should know, just reply to this text.`

    console.log('[AI CONFIRMATION SMS BODY]', {
      businessName,
      serviceRequested,
      locationText,
      messageBodyLength: messageBody.length
    })

    // Send SMS
    console.log('[AI CONFIRMATION SMS TWILIO SEND START]', {
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

      console.log('[AI CONFIRMATION SMS TWILIO SEND RESULT]', {
        success: !!twilioMessageSid,
        twilioMessageSid
      })
    } catch (error) {
      smsError = error as Error
      console.error('[AI CONFIRMATION SMS TWILIO SEND ERROR]', {
        message: smsError.message,
        stack: smsError.stack
      })
    }

    // Insert message into messages table regardless of SMS send success
    const insertPayload = {
      lead_id: leadId,
      conversation_id: conversationId,
      direction: 'outbound' as const,
      body: messageBody,
      from_phone: business.twilio_phone_number,
      to_phone: callerPhone,
      twilio_message_sid: twilioMessageSid,
      status: smsError ? 'failed' : 'sent',
      error_message: smsError ? smsError.message : null,
      created_at: new Date().toISOString()
    }

    console.log('[AI CONFIRMATION SMS MESSAGE INSERT START]', {
      lead_id: insertPayload.lead_id,
      conversation_id: insertPayload.conversation_id,
      direction: insertPayload.direction,
      status: insertPayload.status,
      body_length: insertPayload.body.length,
      from_phone: insertPayload.from_phone,
      to_phone: insertPayload.to_phone,
      has_twilio_message_sid: !!insertPayload.twilio_message_sid
    })

    const { data: message, error: messageError } = await supabaseAdmin
      .from('messages')
      .insert(insertPayload)
      .select()
      .single()

    if (messageError) {
      console.error('[AI CONFIRMATION SMS DB ERROR]', {
        operation: 'message insert',
        code: messageError.code,
        message: messageError.message,
        details: messageError.details,
        hint: messageError.hint,
        payload: {
          lead_id: insertPayload.lead_id,
          conversation_id: insertPayload.conversation_id,
          direction: insertPayload.direction,
          status: insertPayload.status,
          from_phone: insertPayload.from_phone,
          to_phone: insertPayload.to_phone
        }
      })
      return NextResponse.json({
        error: 'Failed to save message',
        dbError: {
          code: messageError.code,
          message: messageError.message,
          details: messageError.details
        }
      }, { status: 500 })
    }

    console.log('[AI CONFIRMATION SMS MESSAGE INSERT RESULT]', {
      messageId: message.id,
      conversationId,
      status: message.status
    })

    // Update conversation last_activity_at
    console.log('[AI CONFIRMATION SMS CONVERSATION UPDATE START]', { conversationId })
    const { error: updateError } = await supabaseAdmin
      .from('conversations')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', conversationId)

    if (updateError) {
      console.error('[AI CONFIRMATION SMS DB ERROR]', {
        operation: 'conversation update',
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint
      })
      // Don't fail the request if conversation update fails
    } else {
      console.log('[AI CONFIRMATION SMS CONVERSATION UPDATE SUCCESS]')
    }

    console.log('[AI CONFIRMATION SMS SUCCESS]', {
      messageId: message.id,
      conversationId,
      status: message.status,
      twilioMessageSid
    })

    return NextResponse.json({
      success: true,
      messageId: message.id,
      twilioMessageSid,
      status: message.status,
      skipped: false
    })

  } catch (error) {
    console.error('[AI CONFIRMATION SMS ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

async function checkOptOut(businessId: string, phoneNumber: string): Promise<boolean> {
  try {
    console.log('[AI CONFIRMATION SMS LEAD LOOKUP]', { businessId, phoneNumber })

    // Check if lead is opted out
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('raw_metadata')
      .eq('business_id', businessId)
      .eq('phone', phoneNumber)
      .single()

    if (leadError && leadError.code !== 'PGRST116') {
      console.error('[AI CONFIRMATION SMS DB ERROR]', {
        operation: 'lead lookup select',
        code: leadError.code,
        message: leadError.message,
        details: leadError.details,
        hint: leadError.hint
      })
    }

    if (lead?.raw_metadata?.opted_out) {
      console.log('[AI CONFIRMATION SMS LEAD OPTED OUT]', { phoneNumber })
      return true
    }

    // Check if number is ignored
    console.log('[AI CONFIRMATION SMS IGNORED CONTACT CHECK]', { businessId, phoneNumber })
    const ignored = await isIgnoredContact(businessId, phoneNumber)
    return ignored
  } catch (error) {
    console.error('[AI CONFIRMATION SMS OPT-OUT CHECK ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return false
  }
}
