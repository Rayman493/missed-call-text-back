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

  const sendResult = await sendSms(business, callerPhone, messageBody, {
    lead_id: leadId,
    conversation_id: conversationId,
    source: 'ai_summary',
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
