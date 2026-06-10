import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * SMS Decision Types
 */
export type SmsTemplate = 'ai_summary' | 'missed_call' | 'after_hours' | 'none'

export interface SmsDecisionResult {
  template: SmsTemplate
  reason: string
  shouldSend: boolean
  aiCompleted: boolean
  voicemailCompleted: boolean
  aiCallRecordId?: string
}

/**
 * Centralized SMS Decision Logic
 * 
 * This function provides a single authoritative decision point for determining
 * which SMS template to send after an inbound call, eliminating race conditions
 * between AI summary SMS and generic missed-call SMS.
 */
export async function determineSmsTemplate(params: {
  callSid: string
  leadId: string
  conversationId?: string
  businessId: string
}): Promise<SmsDecisionResult> {
  const { callSid, leadId, conversationId, businessId } = params

  console.log('[AUTO SMS DECISION] Starting decision process', {
    callSid,
    leadId,
    conversationId,
    businessId,
    timestamp: new Date().toISOString()
  })

  // Check for AI call record with retry logic
  let aiCallRecord = null
  const retryDelays = [0, 500, 1000, 2000]

  for (let i = 0; i < retryDelays.length; i++) {
    const delay = retryDelays[i]
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const { data: record } = await supabaseAdmin
      .from('ai_call_records')
      .select('id, outcome, call_sid, lead_id, conversation_id, extracted_info, summary')
      .eq('call_sid', callSid)
      .maybeSingle()

    if (record) {
      aiCallRecord = record
      if (i > 0) {
        console.log('[AUTO SMS DECISION] AI record found after retry', {
          callSid,
          attempt: i + 1,
          totalDelay: delay,
          aiCallRecordId: aiCallRecord.id,
          outcome: aiCallRecord.outcome
        })
      }
      break
    }
  }

  // Check if AI summary SMS already sent
  let aiSummaryAlreadySent = false
  if (conversationId) {
    const { data: existingAiSummary } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .eq('direction', 'outbound')
      .ilike('body', 'Hi, this is%')
      .ilike('body', '%Thanks for calling — we received your request%')
      .limit(1)
      .maybeSingle()

    aiSummaryAlreadySent = !!existingAiSummary
  }

  // Decision logic
  const aiCompleted = aiCallRecord?.outcome === 'completed'
  const hasExtractedInfo = aiCallRecord?.extracted_info && Object.keys(aiCallRecord.extracted_info).length > 0
  const hasSummary = aiCallRecord?.summary && aiCallRecord.summary.length > 0

  let result: SmsDecisionResult

  if (aiCompleted || hasExtractedInfo || hasSummary) {
    // AI has completed or has data - AI summary SMS should be sent by external service
    console.log('[AUTO SMS DECISION] AI completed - suppress generic SMS', {
      callSid,
      leadId,
      conversationId,
      aiCallRecordId: aiCallRecord?.id,
      aiCompleted,
      hasExtractedInfo,
      hasSummary,
      aiSummaryAlreadySent,
      reason: aiCompleted ? 'ai_intake_completed' : hasExtractedInfo ? 'ai_extracted_info_exists' : 'ai_summary_exists'
    })

    result = {
      template: 'none',
      shouldSend: false,
      reason: aiCompleted ? 'ai_intake_completed' : hasExtractedInfo ? 'ai_extracted_info_exists' : 'ai_summary_exists',
      aiCompleted: true,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id
    }
  } else {
    // No AI data - send generic missed-call SMS
    console.log('[AUTO SMS DECISION] No AI data - send generic missed-call SMS', {
      callSid,
      leadId,
      conversationId,
      aiCallRecordFound: !!aiCallRecord,
      aiSummaryAlreadySent,
      reason: 'no_ai_data'
    })

    result = {
      template: 'missed_call',
      shouldSend: true,
      reason: 'no_ai_data',
      aiCompleted: false,
      voicemailCompleted: false
    }
  }

  console.log('[AUTO SMS DECISION] Final decision', {
    callSid,
    leadId,
    conversationId,
    template: result.template,
    shouldSend: result.shouldSend,
    reason: result.reason,
    aiCompleted: result.aiCompleted,
    generic_sms_suppressed: result.template === 'none'
  })

  return result
}

/**
 * Check if AI summary SMS has already been sent for a conversation
 * This is a durable marker to prevent duplicate AI summary SMS
 */
export async function hasAiSummaryBeenSent(conversationId: string): Promise<boolean> {
  const { data: existingAiSummary } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .ilike('body', 'Hi, this is%')
    .ilike('body', '%Thanks for calling — we received your request%')
    .limit(1)
    .maybeSingle()

  return !!existingAiSummary
}

/**
 * Check if any automated SMS has been sent for a lead in the last 5 minutes
 * This prevents duplicate automated messages
 */
export async function hasRecentAutomatedSms(leadId: string): Promise<boolean> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  
  const { data: recentMessage } = await supabaseAdmin
    .from('messages')
    .select('id')
    .eq('lead_id', leadId)
    .eq('direction', 'outbound')
    .eq('is_manual', false)
    .gte('created_at', fiveMinutesAgo)
    .limit(1)
    .maybeSingle()

  return !!recentMessage
}
