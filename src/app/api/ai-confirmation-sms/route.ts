import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizePunctuation } from '@/lib/utils'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'

export const dynamic = 'force-dynamic'

/**
 * Safely convert any value to a string for SMS output
 * Prevents [object Object] from appearing in messages
 */
function safeFieldToString(value: any): string {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(safeFieldToString).filter(Boolean).join(", ")
  if (typeof value === "object") {
    return (
      value.value ||
      value.text ||
      value.details ||
      value.summary ||
      value.description ||
      value.reason ||
      JSON.stringify(value)
    ).toString().trim()
  }
  return String(value).trim()
}

interface ConfirmationSMSRequest {
  businessId: string
  leadId: string
  conversationId: string
  callSid: string
  callerPhone: string
  businessName: string
  extractedInfo?: {
    callerName?: string
    caller_name?: string
    name?: string
    contact_name?: string
    customer_name?: string
    service_requested?: string
    reason?: string
    reasonForCalling?: string
    reason_for_call?: string
    summary?: string
    details?: string
    importantDetails?: string
    important_details?: string
    issue?: string
    urgency?: string
    urgencyLevel?: string
    urgency_level?: string
    location?: string
    address?: string
    addressOrLocation?: string
    address_or_location?: string
    preferred_callback_time?: string
    preferredCallbackTime?: string
    callback_number?: string
    callbackNumber?: string
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
      .select('id, business_id, raw_metadata')
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

    // Persist AI extracted caller name to leads.raw_metadata
    const extractedName =
      extractedInfo?.callerName ||
      extractedInfo?.caller_name ||
      extractedInfo?.name ||
      extractedInfo?.contact_name ||
      extractedInfo?.customer_name

    // Debug logging for extractedInfo keys
    console.log('[AI CONTACT NAME DEBUG]', {
      leadId,
      extractedInfo,
      extractedInfoKeys: extractedInfo ? Object.keys(extractedInfo) : [],
      extractedName
    })

    if (extractedName) {
      console.log('[AI CONTACT NAME UPDATE ATTEMPT]', {
        leadId,
        extractedName,
        existingRawMetadata: lead.raw_metadata
      })

      // Merge into raw_metadata without overwriting existing metadata
      const updatedRawMetadata = {
        ...(lead.raw_metadata || {}),
        caller_name: extractedName,
        callerName: extractedName,
        extracted_info: {
          ...(lead.raw_metadata?.extracted_info || {}),
          name: extractedName,
          callerName: extractedName
        }
      }

      const { error: updateLeadError } = await supabaseAdmin
        .from('leads')
        .update({
          raw_metadata: updatedRawMetadata
        })
        .eq('id', leadId)

      console.log('[AI CONTACT NAME UPDATE RESULT]', {
        leadId,
        success: !updateLeadError,
        error: updateLeadError
      })

      if (updateLeadError) {
        console.error('[AI CONTACT NAME UPDATE] Failed to update lead raw_metadata:', updateLeadError)
      } else {
        console.log('[AI CONTACT NAME UPDATE] Successfully updated lead raw_metadata:', {
          leadId,
          caller_name: extractedName,
          extracted_info_name: extractedName
        })

        // Verify update by re-querying the lead
        const { data: updatedLead } = await supabaseAdmin
          .from('leads')
          .select('id, raw_metadata')
          .eq('id', leadId)
          .single()

        console.log('[AI CONTACT NAME VERIFY]', {
          leadId,
          rawMetadata: updatedLead?.raw_metadata
        })
      }
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

    // Fetch the latest AI call record to get the most up-to-date extracted_info with customer corrections
    console.log('[AI CONFIRMATION SMS FETCH LATEST AI RECORD]', {
      leadId,
      callSid
    })

    const { data: latestAiCallRecord, error: aiRecordError } = await supabaseAdmin
      .from('ai_call_records')
      .select('id, extracted_info, call_sid')
      .eq('lead_id', leadId)
      .eq('call_sid', callSid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (aiRecordError) {
      console.error('[AI CONFIRMATION SMS ERROR] Failed to fetch AI call record:', aiRecordError)
    } else if (latestAiCallRecord && latestAiCallRecord.extracted_info) {
      console.log('[AI CONFIRMATION SMS USING DATABASE EXTRACTED_INFO]', {
        aiCallRecordId: latestAiCallRecord.id,
        hasExtractedInfo: !!latestAiCallRecord.extracted_info,
        extractedInfoKeys: latestAiCallRecord.extracted_info ? Object.keys(latestAiCallRecord.extracted_info) : []
      })
      // Use the database extracted_info which includes customer corrections
      extractedInfo = latestAiCallRecord.extracted_info
    } else {
      console.log('[AI CONFIRMATION SMS USING PASSED EXTRACTED_INFO]', {
        reason: !latestAiCallRecord ? 'no_ai_record_found' : 'no_extracted_info_in_record'
      })
    }

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

    // Normalize extracted_info to canonical keys with backward compatibility
    const extracted = normalizeExtractedInfo(extractedInfo || {})

    console.log('[AI SMS NORMALIZED RECORD]', {
      route: '/api/ai-confirmation-sms',
      normalized: extracted
    })

    const summaryParts: string[] = []

    // Map available keys from extracted_info using canonical property names
    // Use safeFieldToString to prevent [object Object] from appearing
    if (extracted.callerName) {
      summaryParts.push(`- Name: ${normalizePunctuation(safeFieldToString(extracted.callerName))}`)
    }

    if (extracted.reasonForCalling) {
      summaryParts.push(`- Reason: ${normalizePunctuation(safeFieldToString(extracted.reasonForCalling))}`)
    }

    if (extracted.importantDetails) {
      summaryParts.push(`- Details: ${normalizePunctuation(safeFieldToString(extracted.importantDetails))}`)
    }

    if (extracted.urgencyLevel) {
      summaryParts.push(`- Urgency: ${normalizePunctuation(safeFieldToString(extracted.urgencyLevel))}`)
    }

    if (extracted.addressOrLocation) {
      summaryParts.push(`- Location: ${normalizePunctuation(safeFieldToString(extracted.addressOrLocation))}`)
    }

    if (extracted.preferredCallbackTime) {
      summaryParts.push(`- Callback time: ${normalizePunctuation(safeFieldToString(extracted.preferredCallbackTime))}`)
    }

    // Callback number: use extracted.callbackNumber if present, otherwise fallback to callerPhone
    const callbackNumber = extracted.callbackNumber || callerPhone
    if (callbackNumber) {
      summaryParts.push(`- Callback number: ${normalizePunctuation(safeFieldToString(callbackNumber))}`)
    }

    console.log('[AI SMS FIELD VALUES]', {
      route: '/api/ai-confirmation-sms',
      callerName: extracted.callerName,
      reasonForCalling: extracted.reasonForCalling,
      importantDetails: extracted.importantDetails,
      urgencyLevel: extracted.urgencyLevel,
      addressOrLocation: extracted.addressOrLocation,
      preferredCallbackTime: extracted.preferredCallbackTime,
      callbackNumber: extracted.callbackNumber,
      summaryPartsCount: summaryParts.length
    })

    // Build comprehensive confirmation message
    let messageBody = `Hi, this is ${businessName}. Thanks for calling — we received your request.\n\n`

    // Add details section
    messageBody += `Details:\n${summaryParts.join('\n')}\n\n`

    // Add next step and reply instruction
    messageBody += `We'll follow up as soon as possible. If anything above is wrong or you want to add more, just reply to this text.`

    console.log('[AI SMS FINAL BODY]', {
      route: '/api/ai-confirmation-sms',
      businessName,
      messageBodyLength: messageBody.length,
      summaryPartsCount: summaryParts.length
    })

    // Send SMS using sendSms (which handles message insertion and idempotency)
    console.log('[AI CONFIRMATION SMS TWILIO SEND START]', {
      to: callerPhone,
      from: business.twilio_phone_number,
      messagingServiceSid: business.twilio_messaging_service_sid
    })

    // Log explicit SMS decision before sending
    console.log('[AUTO SMS DECISION BEFORE SEND]', {
      callSid,
      leadId,
      conversationId,
      businessId,
      template: 'ai_summary',
      reason: 'ai_intake_completed',
      aiCompleted: true,
      voicemailCompleted: false,
      generic_sms_suppressed: true,
      messageBody: messageBody.substring(0, 100),
      source: 'external_ai_voice_service'
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

