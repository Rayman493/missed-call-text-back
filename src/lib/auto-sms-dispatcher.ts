import { sendSms } from '@/lib/twilio'
import { supabaseAdmin, db } from '@/lib/supabase/admin'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { isCompleteAIIntake } from '@/lib/ai-intake-completion'
import { generateSummaryFromExtractedInfo } from '@/lib/sms-processing'
import { formatAiIntakeSummary } from '@/lib/ai-intake-formatter'
import { getOutOfOfficeNotice } from '@/lib/out-of-office'

export type AutoSmsTrigger = 'call_finished' | 'ai_confirmation' | 'voicemail_completed' | 'recording_fallback'
export type AutoSmsOutcome = 'AI_COMPLETE' | 'VOICEMAIL_COMPLETE' | 'GENERIC_FALLBACK'
export type AutoSmsTemplate = 'ai_summary' | 'voicemail_summary' | 'generic_missed_call'

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

async function hasAutomaticSmsForCall(callSid: string, leadId: string): Promise<boolean> {
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('raw_metadata')
    .eq('id', leadId)
    .maybeSingle()

  const metadata = lead?.raw_metadata || {}
  if (metadata.ai_confirmation_sms_sent === true || metadata.auto_sms_dispatch_call_sid === callSid || metadata.ai_summary_sms_call_sid === callSid || metadata.ai_confirmation_sms_call_sid === callSid) {
    return true
  }

  return false
}

function getGenericMissedCallMessage(business: any, businessName: string): string {
  const staleDefaultTemplate = 'Sorry we missed your call—how can we help?'
  const configuredMessage = business.auto_reply_message && business.auto_reply_message.trim()
    ? business.auto_reply_message
    : ''
  const template = configuredMessage && !configuredMessage.includes(staleDefaultTemplate)
    ? configuredMessage
    : `Hi, this is {{business_name}}. We just missed your call. Reply here with what you need help with, and we'll get back to you soon. Reply STOP to opt out.`

  return template.replace(/\{\{business_name\}\}/gi, businessName)
}

function getAiMessage(params: { extracted: any; callerPhone: string; businessName: string; aiOutcome?: string | null; intakeComplete: boolean }) {
  const { extracted, callerPhone, businessName, aiOutcome, intakeComplete } = params
  const isPartialIntake = aiOutcome === 'partial_intake'
  const isIncompleteOrEarlyHangup = aiOutcome === 'incomplete' || aiOutcome === 'early_hangup' || aiOutcome === 'no_speech' || aiOutcome === 'ai_connection_failed' || aiOutcome === 'caller_hung_up'
  const hasAnyIntakeInfo = extracted.callerName?.trim() || extracted.reasonForCalling?.trim() || extracted.addressOrLocation?.trim() || extracted.desiredCompletionTime?.trim() || extracted.preferredCallbackTime?.trim() || extracted.importantDetails?.trim()

  if (intakeComplete || aiOutcome === 'ai_failed_voicemail' || aiOutcome === 'ai_failed_sms') {
    return generateSummaryFromExtractedInfo(extracted, callerPhone, businessName, '')
  }

  if (isPartialIntake) {
    const collectedParts: string[] = []
    if (extracted.callerName?.trim()) collectedParts.push(`Name: ${extracted.callerName.trim()}`)
    if (extracted.reasonForCalling?.trim()) collectedParts.push(`Service: ${extracted.reasonForCalling.trim()}`)
    if (extracted.addressOrLocation?.trim()) collectedParts.push(`Address: ${extracted.addressOrLocation.trim()}`)
    if (extracted.desiredCompletionTime?.trim()) collectedParts.push(`When: ${extracted.desiredCompletionTime.trim()}`)
    if (extracted.preferredCallbackTime?.trim()) collectedParts.push(`Best callback: ${extracted.preferredCallbackTime.trim()}`)
    if (extracted.importantDetails?.trim()) collectedParts.push(`Details: ${extracted.importantDetails.trim()}`)
    const partialInfo = collectedParts.length > 0 ? `\n\nWe got: ${collectedParts.join('; ')}` : ''
    return `Hi, this is ${businessName}. We just missed your call.${partialInfo} Reply here with what you need help with, and we'll get back to you soon. Reply STOP to opt out.`
  }

  if (aiOutcome === 'no_speech') {
    return `Thanks for calling ${businessName}. We weren't able to hear you during your call. Reply to this text with what you need, and we'll make sure the business receives your message.`
  }

  if (isIncompleteOrEarlyHangup && !hasAnyIntakeInfo) {
    return `Hi, this is ${businessName}. We noticed the call ended before we could collect your information.\n\nPlease reply with:\n\n• Your name\n• What you need help with\n• Service address (if applicable)\n• When you'd like the work completed\n• Best time for us to call you back\n\nWe'll pass this to the business and they'll get back to you soon.\n\nReply STOP to opt out.`
  }

  return null
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
  const extracted = normalizeExtractedInfo(params.extractedInfo || aiCallRecord?.extracted_info || {})
  const aiOutcome = params.aiOutcome || aiCallRecord?.outcome || null
  const intakeComplete = isCompleteAIIntake(extracted)
  const aiCompleted = intakeComplete || aiOutcome === 'completed_intake' || aiOutcome === 'completed'

  let outcome: AutoSmsOutcome
  let template: AutoSmsTemplate
  let reason: string
  let messageBody: string

  if (aiCompleted) {
    outcome = 'AI_COMPLETE'
    template = 'ai_summary'
    reason = 'ai_intake_completed'
    messageBody = generateSummaryFromExtractedInfo(extracted, callerPhone, businessName, '')
  } else if (params.voicemailCompleted || trigger === 'voicemail_completed') {
    outcome = 'VOICEMAIL_COMPLETE'
    template = 'voicemail_summary'
    reason = 'voicemail_completed'
    messageBody = `${formatAiIntakeSummary(extracted, callerPhone, businessName)}\n\nReply STOP to opt out.`
  } else {
    outcome = 'GENERIC_FALLBACK'
    template = 'generic_missed_call'
    reason = 'no_ai_or_voicemail_completion'
    messageBody = getGenericMissedCallMessage(business, businessName)
  }

  const outOfOfficeAppend = getOutOfOfficeNotice(business) || ''
  if (template !== 'generic_missed_call' && outOfOfficeAppend && !messageBody.includes(outOfOfficeAppend.trim())) {
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

  const sendResult = await sendSms(business, callerPhone, messageBody, {
    lead_id: leadId,
    conversation_id: conversationId,
    source: template === 'ai_summary' ? 'ai_summary' : 'auto_sms_dispatcher',
    reason,
  })

  const twilioMessageSid = sendResult.sid

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
    messageId: sendResult.messageId,
  }
}
