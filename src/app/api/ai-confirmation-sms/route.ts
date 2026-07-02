import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendSms } from '@/lib/twilio'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizePunctuation } from '@/lib/utils'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { getOutOfOfficeNotice } from '@/lib/out-of-office'
import { generateSummaryFromExtractedInfo } from '@/lib/sms-processing'

/**
 * Check if current time is within business hours for a business
 */
function isWithinBusinessHours(business: any): boolean {
  const businessHoursEnabled = business.business_hours_enabled || false
  if (!businessHoursEnabled) {
    return true // If business hours not enabled, treat as always within hours
  }

  const businessHoursStart = business.business_hours_start || '09:00'
  const businessHoursEnd = business.business_hours_end || '17:00'
  const businessTimezone = business.business_hours_timezone || 'America/New_York'

  const now = new Date()
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: businessTimezone }))

  const [startHour, startMin] = businessHoursStart.split(':').map(Number)
  const [endHour, endMin] = businessHoursEnd.split(':').map(Number)

  const currentHour = nowInTimezone.getHours()
  const currentMin = nowInTimezone.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMin
  const startTimeInMinutes = startHour * 60 + startMin
  const endTimeInMinutes = endHour * 60 + endMin

  const dayIndex = nowInTimezone.getDay()
  const isWeekday = dayIndex >= 1 && dayIndex <= 5

  const withinBusinessHours = isWeekday && currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes

  return withinBusinessHours
}

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
    desiredCompletionTime?: string
    desired_completion_time?: string
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
    const altAuthHeader = request.headers.get('x-internal-api-secret')
    
    console.log('[AI CONFIRMATION SMS AUTH DEBUG]', {
      hasAuthHeader: !!authHeader,
      authHeaderScheme: authHeader?.startsWith('Bearer ') ? 'Bearer' : authHeader ? 'other' : 'none',
      hasAltAuthHeader: !!altAuthHeader,
      hasInternalApiSecret: !!process.env.INTERNAL_API_SECRET
    })
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AI CONFIRMATION SMS ERROR] Missing or invalid authorization header')
      console.error('[AI CONFIRMATION SMS ERROR] Expected: Authorization: Bearer <INTERNAL_API_SECRET>')
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
      console.log('[AI CONFIRMATION SMS AUTH DEBUG]', {
        secretLengthProvided: providedSecret.length,
        secretLengthExpected: expectedSecret.length,
        secretsMatch: providedSecret === expectedSecret
      })
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('[AI CONFIRMATION SMS AUTH SUCCESS] Authorization validated')

    const body: ConfirmationSMSRequest = await request.json()

    const {
      businessId,
      leadId,
      conversationId,
      callSid,
      callerPhone,
      businessName
    } = body

    let extractedInfo = body.extractedInfo

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

    // Idempotency check - check if confirmation SMS already sent for this callSid
    // Use callSid-based check to prevent duplicate SMS per call
    console.log('[AI SUMMARY SEND BOUNDARY]', {
      callSid,
      conversationId,
      leadId,
      timestamp: new Date().toISOString()
    })

    // Check for existing AI summary SMS for this callSid in lead metadata
    const { data: leadWithMetadata, error: metadataError } = await supabaseAdmin
      .from('leads')
      .select('raw_metadata')
      .eq('id', leadId)
      .single()

    let existingSummarySms = false
    let idempotencyReason = ''

    if (!metadataError && leadWithMetadata?.raw_metadata) {
      const metadata = leadWithMetadata.raw_metadata
      // Check normalized ai_summary_sms_call_sid first
      if (metadata.ai_summary_sms_call_sid === callSid) {
        existingSummarySms = true
        idempotencyReason = 'ai_summary_sms_already_sent_for_this_call_sid'
        console.log('[AI SUMMARY SEND BOUNDARY]', {
          existingSummaryForCallSid: true,
          existingSummaryForConversation: false,
          shouldSend: false,
          reason: idempotencyReason
        })
      }
      // Fallback to legacy ai_confirmation_sms_call_sid for backward compatibility
      else if (metadata.ai_confirmation_sms_call_sid === callSid) {
        existingSummarySms = true
        idempotencyReason = 'ai_summary_sms_already_sent_for_this_call_sid_legacy'
        console.log('[AI SUMMARY SEND BOUNDARY]', {
          existingSummaryForCallSid: true,
          existingSummaryForConversation: false,
          shouldSend: false,
          reason: idempotencyReason,
          note: 'Using legacy ai_confirmation_sms_call_sid key'
        })
      }
    }

    // Fallback: if callSid check failed or callSid missing, check conversationId
    if (!existingSummarySms) {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
      const { data: existingMessage, error: checkError } = await supabaseAdmin
        .from('messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .ilike('body', 'Here\'s a summary of your request%')
        .gte('created_at', tenMinutesAgo)
        .limit(1)
        .maybeSingle()

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('[AI SUMMARY SEND BOUNDARY ERROR]', {
          operation: 'duplicate check select',
          code: checkError.code,
          message: checkError.message
        })
      } else if (existingMessage) {
        existingSummarySms = true
        idempotencyReason = 'summary_message_already_in_messages_table'
        console.log('[AI SUMMARY SEND BOUNDARY]', {
          existingSummaryForCallSid: false,
          existingSummaryForConversation: true,
          shouldSend: false,
          reason: idempotencyReason,
          messageId: existingMessage.id,
          note: 'Fallback to conversationId check used'
        })
      } else {
        console.log('[AI SUMMARY SEND BOUNDARY]', {
          existingSummaryForCallSid: false,
          existingSummaryForConversation: false,
          shouldSend: true,
          reason: 'no_existing_summary_found'
        })
      }
    }

    if (existingSummarySms) {
      console.log('[AI SUMMARY SMS SKIPPED DUPLICATE]', {
        callSid,
        leadId,
        conversationId,
        existingMessageId: idempotencyReason.includes('messages_table') ? 'see logs' : 'n/a',
        reason: idempotencyReason
      })
      return NextResponse.json({ success: true, skipped: true, reason: idempotencyReason })
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
      .select('id, name, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status, out_of_office_enabled, out_of_office_start, out_of_office_end, out_of_office_message, business_hours_enabled, business_hours_start, business_hours_end, business_hours_timezone, after_hours_message, auto_reply_message')
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
      .select('id, outcome, extracted_info, call_sid')
      .eq('lead_id', leadId)
      .eq('call_sid', callSid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const aiOutcome = latestAiCallRecord?.outcome || null

    if (aiRecordError) {
      console.error('[AI CONFIRMATION SMS ERROR] Failed to fetch AI call record:', aiRecordError)
    } else if (latestAiCallRecord && latestAiCallRecord.extracted_info) {
      console.log('[AI CONFIRMATION SMS USING DATABASE EXTRACTED_INFO]', {
        aiCallRecordId: latestAiCallRecord.id,
        aiOutcome,
        hasExtractedInfo: !!latestAiCallRecord.extracted_info,
        extractedInfoKeys: latestAiCallRecord.extracted_info ? Object.keys(latestAiCallRecord.extracted_info) : []
      })
      // Use the database extracted_info which includes customer corrections
      extractedInfo = latestAiCallRecord.extracted_info
    } else {
      console.log('[AI CONFIRMATION SMS USING PASSED EXTRACTED_INFO]', {
        reason: !latestAiCallRecord ? 'no_ai_record_found' : 'no_extracted_info_in_record',
        aiOutcome
      })
    }

    // Build confirmation message with all extracted fields
    console.log('[AI SMS SOURCE RECORD]', {
      route: '/api/ai-confirmation-sms',
      businessId,
      leadId,
      conversationId,
      callSid,
      aiOutcome,
      extractedInfo,
      source: 'external_ai_voice_service'
    })

    // Normalize extracted_info to canonical keys with backward compatibility
    const extracted = normalizeExtractedInfo(extractedInfo || {})

    console.log('[AI SMS NORMALIZED RECORD]', {
      route: '/api/ai-confirmation-sms',
      normalized: extracted,
      aiOutcome
    })

    // Check if all required fields are present
    const requiredFields = ['callerName', 'reasonForCalling', 'importantDetails', 'addressOrLocation', 'desiredCompletionTime', 'preferredCallbackTime'];
    const missingFields = requiredFields.filter(field => {
      const value = (extracted as any)[field];
      return !value || value.trim() === '';
    });
    const isComplete = missingFields.length === 0;

    // Determine if we need to prepend an out-of-office or after-hours notice
    let prefixNotice = ''
    let messageType: 'normal' | 'after_hours' | 'out_of_office' = 'normal'
    let usingDefaultMessage = false

    // Priority: Out of Office > After Hours > Normal
    const outOfOfficeNotice = getOutOfOfficeNotice(business);
    const outOfOfficeActive = outOfOfficeNotice !== null;

    if (outOfOfficeActive) {
      messageType = 'out_of_office'
      // Use custom out of office message or default
      if (business.out_of_office_message && business.out_of_office_message.trim()) {
        prefixNotice = business.out_of_office_message.replace(/\{\{business_name\}\}/gi, businessName)
        usingDefaultMessage = false
      } else {
        prefixNotice = `Thanks for contacting ${businessName}. We are currently out of office and responses may be delayed.`
        usingDefaultMessage = true
      }
    } else if (!isWithinBusinessHours(business)) {
      messageType = 'after_hours'
      // Use custom after-hours message or default
      const afterHoursMessage = business.after_hours_message || ''
      if (afterHoursMessage && afterHoursMessage.trim()) {
        prefixNotice = afterHoursMessage.replace(/\{\{business_name\}\}/gi, businessName)
        usingDefaultMessage = false
      } else {
        prefixNotice = `Thanks for calling ${businessName}. We are currently closed and will get back to you during business hours.`
        usingDefaultMessage = true
      }
    }

    // Choose SMS template based on AI outcome
    // completed_intake/completed -> AI summary (existing behavior)
    // partial_intake -> brief partial info SMS
    // incomplete/early_hangup/no_speech with no info -> intake-oriented guided message
    // incomplete/early_hangup/no_speech with some info -> standard missed-call SMS
    const isCompletedIntake = aiOutcome === 'completed_intake' || aiOutcome === 'completed' || aiOutcome === 'ai_completed';
    const isPartialIntake = aiOutcome === 'partial_intake';
    const isIncompleteOrEarlyHangup = aiOutcome === 'incomplete' ||
                                      aiOutcome === 'early_hangup' ||
                                      aiOutcome === 'no_speech' ||
                                      aiOutcome === 'ai_connection_failed' ||
                                      aiOutcome === 'caller_hung_up';

    // Check if any intake information was collected
    const hasAnyIntakeInfo = extracted.callerName?.trim() ||
                            extracted.reasonForCalling?.trim() ||
                            extracted.addressOrLocation?.trim() ||
                            extracted.desiredCompletionTime?.trim() ||
                            extracted.preferredCallbackTime?.trim() ||
                            extracted.importantDetails?.trim();

    let messageBody: string;
    let selectedTemplate: string;
    let selectionReason: string;

    if (isCompletedIntake) {
      selectedTemplate = 'ai_summary';
      selectionReason = 'ai_intake_completed';
      console.log('[AI SMS ROUTE USING CENTRALIZED FORMATTER] formatAiIntakeSummary via generateSummaryFromExtractedInfo');
      messageBody = generateSummaryFromExtractedInfo(extracted, callerPhone, businessName, prefixNotice);
    } else if (isPartialIntake) {
      selectedTemplate = 'partial_intake';
      selectionReason = 'partial_intake';
      const collectedParts: string[] = [];
      if (extracted.callerName?.trim()) collectedParts.push(`Name: ${extracted.callerName.trim()}`);
      if (extracted.reasonForCalling?.trim()) collectedParts.push(`Service: ${extracted.reasonForCalling.trim()}`);
      if (extracted.addressOrLocation?.trim()) collectedParts.push(`Address: ${extracted.addressOrLocation.trim()}`);
      if (extracted.desiredCompletionTime?.trim()) collectedParts.push(`When: ${extracted.desiredCompletionTime.trim()}`);
      if (extracted.preferredCallbackTime?.trim()) collectedParts.push(`Best callback: ${extracted.preferredCallbackTime.trim()}`);
      if (extracted.importantDetails?.trim()) collectedParts.push(`Details: ${extracted.importantDetails.trim()}`);

      const partialInfo = collectedParts.length > 0 ? `\n\nWe got: ${collectedParts.join('; ')}` : '';
      const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';
      messageBody = `${prefix}Hi, this is ${businessName}. We just missed your call.${partialInfo} Reply here with what you need help with, and we'll get back to you soon. Reply STOP to opt out.`;
    } else if (isIncompleteOrEarlyHangup && !hasAnyIntakeInfo) {
      // Incomplete or early hangup with no information collected - use intake-oriented guided message
      selectedTemplate = 'early_hangup_no_info';
      selectionReason = 'incomplete_no_info';
      const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';
      messageBody = `${prefix}Hi, this is ${businessName}. We noticed the call ended before we could collect your information.

Please reply with:

• Your name
• What you need help with
• Service address (if applicable)
• When you'd like the work completed
• Best time for us to call you back

We'll pass this to the business and they'll get back to you soon.

Reply STOP to opt out.`;
    } else {
      // Standard missed-call fallback for no useful info or unknown outcome
      selectedTemplate = 'missed_call';
      selectionReason = isIncompleteOrEarlyHangup ? 'incomplete_with_info' : 'standard_missed_call';
      const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';
      const autoReplyMessage = business.auto_reply_message && business.auto_reply_message.trim()
        ? business.auto_reply_message.replace(/\{\{business_name\}\}/gi, businessName)
        : `Hi, this is ${businessName}. We just missed your call. Reply here with what you need help with, and we'll get back to you soon. Reply STOP to opt out.`;
      messageBody = `${prefix}${autoReplyMessage}`;
    }

    // Temporary debug logs for decision logic
    console.log('[AI SMS TEMPLATE DECISION]', {
      callSid,
      outcome: aiOutcome,
      hasAnyIntakeInfo,
      selectedTemplate,
      reason: selectionReason,
      isIncompleteOrEarlyHangup,
      isPartialIntake,
      isCompletedIntake
    });

    console.log('[AI SMS FINAL BODY PREVIEW] =========================================');
    console.log('[AI SMS FINAL BODY PREVIEW] Template:', selectedTemplate);
    console.log('[AI SMS FINAL BODY PREVIEW] First 300 characters:', messageBody.substring(0, 300));
    console.log('[AI SMS FINAL BODY PREVIEW] Total length:', messageBody.length);
    console.log('[AI SMS FINAL BODY PREVIEW] Timestamp:', new Date().toISOString());
    console.log('[AI SMS FINAL BODY PREVIEW] =========================================');

    console.log('[AI SMS FINAL BODY]', {
      route: '/api/ai-confirmation-sms',
      businessName,
      template: selectedTemplate,
      aiOutcome,
      messageBodyLength: messageBody.length,
      isComplete,
      missingFields
    })

    // Send SMS using sendSms (which handles message insertion and idempotency)
    console.log('[AI CONFIRMATION SMS TWILIO SEND START]', {
      to: callerPhone,
      from: business.twilio_phone_number,
      messagingServiceSid: business.twilio_messaging_service_sid,
      template: selectedTemplate,
      aiOutcome
    })

    // Log explicit SMS decision before sending
    console.log('[AUTO SMS DECISION BEFORE SEND]', {
      callSid,
      leadId,
      conversationId,
      businessId,
      template: selectedTemplate,
      aiOutcome,
      reason: isCompletedIntake ? 'ai_intake_completed' : isPartialIntake ? 'partial_intake' : 'early_hangup_fallback',
      aiCompleted: isCompletedIntake,
      voicemailCompleted: false,
      generic_sms_suppressed: isCompletedIntake,
      messageBody: messageBody.substring(0, 100),
      source: 'external_ai_voice_service'
    })

    // Compact SMS trace log
    console.log('[SMS TRACE] =========================================');
    console.log('[SMS TRACE] callSid:', callSid);
    console.log('[SMS TRACE] sender: ai-confirmation-sms');
    console.log('[SMS TRACE] reason:', selectionReason);
    console.log('[SMS TRACE] template selected:', selectedTemplate);
    console.log('[SMS TRACE] why summary skipped: N/A (this is the summary sender)');
    console.log('[SMS TRACE] why generic sent: N/A (this sends summary, not generic)');
    console.log('[SMS TRACE] =========================================');

    try {
      const sendResult = await sendSms(
        business,
        callerPhone,
        messageBody,
        {
          lead_id: leadId,
          conversation_id: conversationId
        }
      )

      const twilioMessageSid = sendResult.sid

      console.log('[AI SUMMARY SMS SENT]', {
        callSid,
        messageSid: twilioMessageSid,
        leadId,
        conversationId
      })

      if (twilioMessageSid) {
        console.log('[AI CONFIRMATION SMS SUCCESS]', {
          twilioMessageSid,
          conversationId,
          leadId
        })

        // Update lead metadata with AI summary SMS sent flag (normalized key)
        const { error: metadataUpdateError } = await supabaseAdmin
          .from('leads')
          .update({
            raw_metadata: {
              ...(lead?.raw_metadata || {}),
              ai_summary_sms_sent: true,
              ai_summary_sms_sent_at: new Date().toISOString(),
              ai_summary_sms_message_sid: twilioMessageSid,
              ai_summary_sms_call_sid: callSid
            }
          })
          .eq('id', leadId)

        if (metadataUpdateError) {
          console.error('[AI CONFIRMATION SMS METADATA UPDATE ERROR]', {
            leadId,
            error: metadataUpdateError
          })
        } else {
          console.log('[AI CONFIRMATION SMS METADATA UPDATED]', {
            leadId,
            ai_confirmation_sms_sent: true,
            ai_confirmation_sms_sent_at: new Date().toISOString()
          })
        }

        // Check for pending correction acknowledgement
        const pendingAcknowledgement = lead?.raw_metadata?.pending_correction_acknowledgement
        if (pendingAcknowledgement) {
          console.log('[PENDING CORRECTION ACKNOWLEDGEMENT FOUND]', {
            leadId,
            pendingAcknowledgement
          })

          // Send the pending correction acknowledgement
          const acknowledgementMessage = `Thanks! We've updated your ${pendingAcknowledgement.field_changed.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} to "${pendingAcknowledgement.new_value}".`
          const acknowledgementResult = await sendSms(business, callerPhone, acknowledgementMessage, {
            lead_id: leadId,
          })
          const acknowledgementSid = acknowledgementResult.sid

          if (acknowledgementSid) {
            console.log('[PENDING CORRECTION ACKNOWLEDGEMENT SENT]', {
              leadId,
              acknowledgementSid,
              fieldChanged: pendingAcknowledgement.field_changed,
              newValue: pendingAcknowledgement.new_value
            })

            // Clear pending acknowledgement from metadata
            const { error: clearPendingError } = await supabaseAdmin
              .from('leads')
              .update({
                raw_metadata: {
                  ...((lead?.raw_metadata || {})),
                  ai_confirmation_sms_sent: true,
                  ai_confirmation_sms_sent_at: (lead?.raw_metadata || {}).ai_confirmation_sms_sent_at,
                  ai_confirmation_sms_message_sid: (lead?.raw_metadata || {}).ai_confirmation_sms_message_sid,
                  pending_correction_acknowledgement: null
                }
              })
              .eq('id', leadId)

            if (clearPendingError) {
              console.error('[PENDING CORRECTION ACKNOWLEDGEMENT CLEAR ERROR]', {
                leadId,
                error: clearPendingError
              })
            } else {
              console.log('[PENDING CORRECTION ACKNOWLEDGEMENT CLEARED]', {
                leadId
              })
            }
          } else {
            console.error('[PENDING CORRECTION ACKNOWLEDGEMENT SEND FAILED]', {
              leadId,
              pendingAcknowledgement
            })
          }
        }

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

