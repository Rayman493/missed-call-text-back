import { sendSms } from '@/lib/twilio'
import { supabaseAdmin, db } from '@/lib/supabase/admin'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { isCompleteAIIntake } from '@/lib/ai-intake-completion'
import { generateSummaryFromExtractedInfo } from '@/lib/sms-processing'
import { getOutOfOfficeNotice } from '@/lib/out-of-office'

export type AutoSmsTrigger = 'call_finished' | 'ai_confirmation' | 'voicemail_completed' | 'recording_fallback'
export type AutoSmsOutcome = 'SUMMARY'
export type AutoSmsTemplate = 'ai_summary'

interface DispatchParams {
  trigger: AutoSmsTrigger
  callSid: string
  businessId: string
  leadId: string
  conversationId?: string
  callerPhone: string
  businessName?: string
  extractedInfo?: any
  aiOutcome?: string | null
  voicemailCompleted?: boolean
}

interface DispatchResult {
  success: boolean
  skipped?: boolean
  reason: string
  outcome?: AutoSmsOutcome
  template?: AutoSmsTemplate
  twilioMessageSid?: string | null
  messageId?: string | null
}

async function getConversationId(leadId: string, businessId: string, conversationId?: string): Promise<string | undefined> {
  if (conversationId) return conversationId

  let conversation = await db.getOpenConversationForLead(leadId, businessId)
  if (!conversation) {
    conversation = await db.createConversation({
      lead_id: leadId,
      business_id: businessId,
      status: 'open',
      source: 'missed_call',
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
  }

  return conversation?.id
}

async function getAiCallRecord(callSid: string, leadId: string) {
  const { data } = await supabaseAdmin
    .from('ai_call_records')
    .select('id, outcome, extracted_info, summary, fields_collected_count, had_user_speech')
    .eq('lead_id', leadId)
    .eq('call_sid', callSid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

async function getLeadMetadata(leadId: string) {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('raw_metadata')
    .eq('id', leadId)
    .maybeSingle()

  return data
}

// Merge extracted info from multiple sources with priority
// Priority: params.extractedInfo > aiCallRecord.extracted_info > lead.raw_metadata
function mergeExtractedInfo(params: any, aiCallRecord: any, leadMetadata: any): any {
  const paramsExtracted = params.extractedInfo || {};
  const aiCallRecordExtracted = aiCallRecord?.extracted_info || {};
  const leadRawMetadata = leadMetadata?.raw_metadata || {};
  const leadExtracted = leadRawMetadata.extracted_info || leadRawMetadata;

  // Start with params (highest priority)
  const merged = { ...paramsExtracted };

  // Merge from ai_call_record
  Object.keys(aiCallRecordExtracted).forEach(key => {
    if (!merged[key] || merged[key] === 'Not collected') {
      merged[key] = aiCallRecordExtracted[key];
    }
  });

  // Merge from lead metadata (lowest priority)
  Object.keys(leadExtracted).forEach(key => {
    if (!merged[key] || merged[key] === 'Not collected') {
      merged[key] = leadExtracted[key];
    }
  });

  return merged;
}

async function hasAutomaticSmsForCall(callSid: string, leadId: string): Promise<boolean> {
  // Verify a message with a valid Twilio SID exists for this call
  // This prevents false positives from failed attempts that set metadata flags
  const { data: existingMessage } = await supabaseAdmin
    .from('messages')
    .select('id, twilio_message_sid, status, error_code')
    .eq('lead_id', leadId)
    .eq('direction', 'outbound')
    .not('twilio_message_sid', 'is', null)
    .not('twilio_message_sid', 'eq', 'NOT_CALLED')
    .not('twilio_message_sid', 'like', 'SIM_%')
    .maybeSingle()

  if (existingMessage) {
    // Only block if the message was actually sent to Twilio (valid SID) and not failed
    const wasTwilioCalled = existingMessage.twilio_message_sid && existingMessage.twilio_message_sid !== 'NOT_CALLED'
    const hasError = existingMessage.error_code
    const isFailedStatus = existingMessage.status === 'failed' || existingMessage.status === 'undelivered'

    if (wasTwilioCalled && !hasError && !isFailedStatus) {
      console.log('[AUTO SMS IDEMPOTENCY] Valid SMS already sent for lead:', {
        leadId,
        messageId: existingMessage.id,
        twilioMessageSid: existingMessage.twilio_message_sid,
        status: existingMessage.status
      })
      return true
    }
  }

  return false
}

// Helper function to check if SMS error is transient (worth retrying)
function isTransientSmsError(error: any): boolean {
  if (!error) return false
  const permanentErrors = [
    '21610', // Unsubscribed number
    '21611', // Invalid phone number
    '21612', // Cannot route to this number
    '21614', // 'To' number is not a valid mobile number
    '21615', // Phone number is incapable of receiving SMS
    '21408', // Permission denied
  ]
  const errorCode = error.code || error.status
  const errorMessage = error.message || ''
  
  // Check for permanent error codes
  if (permanentErrors.includes(String(errorCode))) {
    return false
  }
  
  // Check for permanent error messages
  if (errorMessage.includes('unsubscribed') || 
      errorMessage.includes('invalid number') ||
      errorMessage.includes('blocked') ||
      errorMessage.includes('permission denied')) {
    return false
  }
  
  // Assume all other errors are transient (network, timeout, rate limit, etc.)
  return true
}

export async function dispatchAutomaticCustomerSms(params: DispatchParams): Promise<DispatchResult> {
  const { trigger, callSid, businessId, leadId, callerPhone } = params

  const { data: business, error: businessError } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single()

  if (businessError || !business) {
    return { success: false, skipped: true, reason: 'business_not_found' }
  }

  if (await isIgnoredContact(businessId, callerPhone)) {
    return { success: true, skipped: true, reason: 'ignored_contact' }
  }

  if (await hasAutomaticSmsForCall(callSid, leadId)) {
    return { success: true, skipped: true, reason: 'automatic_sms_already_dispatched_for_call' }
  }

  const businessName = params.businessName || business.name || 'My Business'
  const aiCallRecord = await getAiCallRecord(callSid, leadId)
  const leadMetadata = await getLeadMetadata(leadId)
  
  // Merge extracted info from multiple sources to handle race conditions
  // Priority: params.extractedInfo > aiCallRecord.extracted_info > lead.raw_metadata
  const mergedExtractedInfo = mergeExtractedInfo(params, aiCallRecord, leadMetadata)
  const extracted = normalizeExtractedInfo(mergedExtractedInfo)
  const aiOutcome = params.aiOutcome || aiCallRecord?.outcome || null
  const intakeComplete = isCompleteAIIntake(extracted)
  const outcome: AutoSmsOutcome = 'SUMMARY'
  const template: AutoSmsTemplate = 'ai_summary'
  const reason = intakeComplete || aiOutcome === 'completed_intake' || aiOutcome === 'completed'
    ? 'ai_intake_completed'
    : params.voicemailCompleted || trigger === 'voicemail_completed'
      ? 'post_call_structured_summary'
      : 'post_call_structured_summary'
  let messageBody = generateSummaryFromExtractedInfo(extracted, callerPhone, businessName, '')

  const outOfOfficeAppend = getOutOfOfficeNotice(business) || ''
  if (outOfOfficeAppend && !messageBody.includes(outOfOfficeAppend.trim())) {
    messageBody = `${messageBody}${outOfOfficeAppend}`
  }

  const conversationId = await getConversationId(leadId, businessId, params.conversationId)

  console.log('[AUTO SMS DISPATCH]', {
    callSid,
    leadId,
    conversationId,
    trigger,
    Outcome: outcome,
    SelectedTemplate: template,
    Reason: reason
  })

  console.log(`[AUTO SMS DISPATCH] Sending template: ${template}`)

  // RETRY LOGIC: Bounded retry for transient Twilio failures
  const retryDelays = [60000, 300000, 1800000] // 1min, 5min, 30min
  const maxRetries = retryDelays.length
  let twilioMessageSid: string | null = null
  let messageId: string | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const sendResult = await sendSms(business, callerPhone, messageBody, {
      lead_id: leadId,
      conversation_id: conversationId,
      source: 'ai_summary',
      reason,
    })

    twilioMessageSid = sendResult.sid
    messageId = sendResult.messageId

    if (twilioMessageSid) {
      // SMS sent successfully
      break
    }

    // SMS failed, check if we should retry
    if (attempt === maxRetries) {
      // Max retries reached
      console.error('[SMS SEND FAILED]', {
        leadId,
        callSid,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        timestamp: new Date().toISOString()
      })
      break
    }

    // Log retry attempt
    console.log('[SMS RETRY]', {
      attempt: attempt + 1,
      leadId,
      callSid,
      reason: 'SMS sending returned null sid',
      nextRetryDelay: retryDelays[attempt]
    })

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]))

    // Re-check idempotency after delay (SMS may have been sent by another process)
    if (await hasAutomaticSmsForCall(callSid, leadId)) {
      console.log('[IDEMPOTENCY]', {
        existingSmsFound: true,
        callSid,
        leadId,
        action: 'skipping_sms_already_sent'
      })
      // Mark as success since SMS was already sent
      twilioMessageSid = 'already_sent'
      break
    }
  }

  if (twilioMessageSid) {
    const { data: leadForMetadata } = await supabaseAdmin
      .from('leads')
      .select('raw_metadata')
      .eq('id', leadId)
      .maybeSingle()

    const dispatchedAt = new Date().toISOString()
    const rawMetadata = {
      ...(leadForMetadata?.raw_metadata || {}),
      auto_sms_dispatch_call_sid: callSid,
      auto_sms_dispatch_template: template,
      auto_sms_dispatch_outcome: outcome,
      auto_sms_dispatch_message_sid: twilioMessageSid,
      auto_sms_dispatch_sent_at: dispatchedAt,
      ...(template === 'ai_summary' ? {
        ai_summary_sms_sent: true,
        ai_confirmation_sms_sent: true,
        ai_summary_sms_call_sid: callSid,
        ai_summary_sms_message_sid: twilioMessageSid,
        ai_summary_sms_sent_at: dispatchedAt,
      } : {})
    }

    await supabaseAdmin
      .from('leads')
      .update({
        status: 'contacted',
        raw_metadata: rawMetadata
      })
      .eq('id', leadId)

    await supabaseAdmin
      .from('call_events')
      .update({
        sms_sent_at: new Date().toISOString(),
        sms_message_sid: twilioMessageSid,
        sms_pending: false
      })
      .eq('twilio_call_sid', callSid)
  }

  return {
    success: !!twilioMessageSid,
    skipped: false,
    reason,
    outcome,
    template,
    twilioMessageSid,
    messageId,
  }
}
