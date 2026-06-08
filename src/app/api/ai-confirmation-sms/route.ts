import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizePunctuation } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface ConfirmationSMSRequest {
  businessId: string
  leadId: string
  conversationId: string
  callSid: string
  callerPhone: string
  businessName: string
  extractedInfo?: {
    caller_name?: string
    service_requested?: string
    reason?: string
    reason_for_call?: string
    summary?: string
    details?: string
    important_details?: string
    issue?: string
    urgency?: string
    urgency_level?: string
    location?: string
    address?: string
    addressOrLocation?: string
    preferred_callback_time?: string
    callback_number?: string
  }
}

export async function POST(request: NextRequest) {
  console.log('[AI POST CALL SMS START] Request received')

  try {
    // Verify INTERNAL_API_SECRET for server-to-server authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AI CONFIRMATION SMS ERROR] Missing or invalid authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providedSecret = authHeader.replace('Bearer ', '')
    const expectedSecret = process.env.INTERNAL_API_SECRET

    if (!expectedSecret) {
      console.error('[AI CONFIRMATION SMS ERROR] INTERNAL_API_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    if (providedSecret !== expectedSecret) {
      console.error('[AI CONFIRMATION SMS ERROR] Invalid INTERNAL_API_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Verify lead belongs to business (ownership validation)
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, business_id')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      console.error('[AI CONFIRMATION SMS ERROR] Lead not found', { leadId, error: leadError })
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (lead.business_id !== businessId) {
      console.error('[AI CONFIRMATION SMS ERROR] Lead does not belong to business', { 
        leadId, 
        leadBusinessId: lead.business_id, 
        requestBusinessId: businessId 
      })
      return NextResponse.json({ error: 'Lead does not belong to specified business' }, { status: 403 })
    }

    // Verify conversation belongs to lead (ownership validation)
    const { data: conversation, error: conversationError } = await supabaseAdmin
      .from('conversations')
      .select('id, lead_id, business_id')
      .eq('id', conversationId)
      .single()

    if (conversationError || !conversation) {
      console.error('[AI CONFIRMATION SMS ERROR] Conversation not found', { conversationId, error: conversationError })
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    if (conversation.lead_id !== leadId || conversation.business_id !== businessId) {
      console.error('[AI CONFIRMATION SMS ERROR] Conversation does not belong to lead/business', { 
        conversationId, 
        conversationLeadId: conversation.lead_id, 
        conversationBusinessId: conversation.business_id,
        requestLeadId: leadId,
        requestBusinessId: businessId
      })
      return NextResponse.json({ error: 'Conversation does not belong to specified lead/business' }, { status: 403 })
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

    // Build confirmation message with all extracted fields
    console.log('[AI SMS SOURCE RECORD]', {
      route: '/api/ai-confirmation-sms',
      businessId,
      leadId,
      conversationId,
      callSid,
      extractedInfo,
      source: 'external_ai_voice_service'
    })

    const callerName = normalizePunctuation(
      extractedInfo?.caller_name ||
      extractedInfo?.caller_name ||
      'Not provided'
    )

    const reason = normalizePunctuation(
      extractedInfo?.service_requested ||
      extractedInfo?.reason ||
      extractedInfo?.reason_for_call ||
      extractedInfo?.summary ||
      'Not provided'
    )

    const details = normalizePunctuation(
      extractedInfo?.details ||
      extractedInfo?.important_details ||
      extractedInfo?.issue ||
      ''
    )

    const urgency = normalizePunctuation(
      extractedInfo?.urgency ||
      extractedInfo?.urgency_level ||
      'Not specified'
    )

    const location = normalizePunctuation(
      extractedInfo?.location ||
      extractedInfo?.address ||
      extractedInfo?.addressOrLocation ||
      'Not provided'
    )

    const callbackTime = normalizePunctuation(
      extractedInfo?.preferred_callback_time ||
      'Not provided'
    )

    const callbackNumber = normalizePunctuation(
      extractedInfo?.callback_number ||
      callerPhone ||
      "We'll use the number you called from"
    )

    console.log('[AI SMS FIELD VALUES]', {
      route: '/api/ai-confirmation-sms',
      callerName,
      reason,
      urgency,
      location,
      callbackTime,
      callbackNumber,
      hasDetails: !!details
    })

    // Build comprehensive confirmation message
    let messageBody = `Hi, this is ${businessName}. Thanks for calling — we received your request.\n\n`
    
    // Add summary section if details exist
    if (details) {
      messageBody += `Summary:\n${details}\n\n`
    }
    
    // Add details section
    messageBody += `Details:\n`
    messageBody += `• Name: ${callerName}\n`
    messageBody += `• Reason: ${reason}\n`
    messageBody += `• Urgency: ${urgency}\n`
    messageBody += `• Location: ${location}\n`
    messageBody += `• Callback time: ${callbackTime}\n`
    messageBody += `• Callback number: ${callbackNumber}\n\n`
    
    // Add next step and reply instruction
    messageBody += `We'll follow up as soon as possible. If anything above is wrong or you want to add more, just reply to this text.`

    console.log('[AI CONFIRMATION SMS BODY]', {
      businessName,
      callerName,
      reason,
      urgency,
      location,
      callbackTime,
      callbackNumber,
      hasDetails: !!details,
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

