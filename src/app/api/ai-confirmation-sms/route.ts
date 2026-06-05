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
  console.log('[AI POST CALL SMS START] Request received')

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

    console.log('[AI POST CALL SMS LEAD ID]', { leadId })
    console.log('[AI POST CALL SMS CONVERSATION ID]', { conversationId })
    console.log('[AI POST CALL SMS TO/FROM]', {
      to: callerPhone,
      fromBusinessId: businessId
    })
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

    // Idempotency check - check if confirmation SMS already sent for this conversation
    // Use metadata-free logic: check for outbound message starting with "Hi, this is" within last 5 minutes
    console.log('[AI CONFIRMATION SMS DUPLICATE CHECK]', {
      conversationId,
      direction: 'outbound',
      body_pattern: 'Hi, this is'
    })

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: existingMessage, error: checkError } = await supabaseAdmin
      .from('messages')
      .select('id, created_at')
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .like('body', 'Hi, this is%')
      .gte('created_at', fiveMinutesAgo)
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
        conversationId,
        created_at: existingMessage.created_at
      })
      return NextResponse.json({ success: true, skipped: true, reason: 'duplicate' })
    }

    // Check ignored contacts (no raw_metadata check as it doesn't exist in schema)
    console.log('[AI CONFIRMATION SMS IGNORED CONTACT CHECK]', { businessId, callerPhone })
    const isIgnored = await isIgnoredContact(businessId, callerPhone)
    if (isIgnored) {
      console.log('[AI CONFIRMATION SMS SKIPPED IGNORED] Caller is in ignored contacts', {
        callerPhone,
        businessId
      })
      return NextResponse.json({ success: true, skipped: true, reason: 'ignored' })
    }

    // Get business with all required fields for sendSms
    console.log('[AI CONFIRMATION SMS BUSINESS LOOKUP]', { businessId })
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, name, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status')
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

    console.log('[AI CONFIRMATION SMS SENDSMS BUSINESS OBJECT]', {
      id: business.id,
      name: business.name,
      hasTwilioPhoneNumber: !!business.twilio_phone_number,
      hasTwilioPhoneNumberSid: !!business.twilio_phone_number_sid,
      hasMessagingServiceSid: !!business.twilio_messaging_service_sid,
      provisioningStatus: business.provisioning_status
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

    // Send SMS using sendSms (which handles message insertion and idempotency)
    console.log('[AI CONFIRMATION SMS TWILIO SEND START]', {
      to: callerPhone,
      from: business.twilio_phone_number,
      messagingServiceSid: business.twilio_messaging_service_sid
    })

    try {
      const twilioMessageSid = await sendSms(
        business,
        callerPhone,
        messageBody,
        {
          lead_id: leadId,
          conversation_id: conversationId
        }
      )

      console.log('[AI COPOST CALL SMS SENT]', {
          twilioMessageSid,
          leadId,
          conversationId,
          callerPhone
        })
        console.log('[AI NFIRMATION SMS TWILIO SEND RESULT]', {
        success: !!twilioMessageSid,
        twilioMessageSid
      })

      if (twilioMessageSid) {
        console.log('[AI CONFIRMATION SMS SUCCESS]', {
          twilioMessageSid,
          conversationId
        })
        return NextResponse.json({
          success: true,
          twilioMessageSid,
          skipped: false
        })
      } else {
        console.log('[AI CONFIRMATION SMS SEND FAILED]', {
          reason: 'sendSms returned null',
          conversationId
        })
        return NextResponse.json({
          error: 'Failed to send SMS',
          reason: 'sendSms returned null'
        }, { status: 500 })
      }
    } catch (error) {
      const smsError = error as Error
      console.log('[AI CONFIRMATION SMS SEND FAILED]', {
        reason: smsError.message,
        stack: smsError.stack,
        conversationId
      })
      return NextResponse.json({
        error: 'Failed to send SMS',
        reason: smsError.message
      }, { status: 500 })
    }

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

