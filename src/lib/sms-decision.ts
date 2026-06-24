import { supabaseAdmin } from '@/lib/supabase/admin'
import { isBusinessOutOfOffice } from '@/lib/out-of-office'

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

  console.log('[AFTER HOURS CHECK] isWithinBusinessHours', {
    businessId: business.id,
    timezone: businessTimezone,
    openTime: businessHoursStart,
    closeTime: businessHoursEnd,
    dayOfWeek: nowInTimezone.toLocaleDateString('en-US', { weekday: 'long' }),
    businessHoursEnabled,
    withinBusinessHours,
    isWeekday,
    currentTimeInMinutes,
    startTimeInMinutes,
    endTimeInMinutes
  })

  return withinBusinessHours
}

/**
 * SMS Decision Types
 */
export type SmsTemplate = 'ai_summary' | 'partial_intake' | 'missed_call' | 'after_hours' | 'out_of_office' | 'none'

export interface SmsDecisionResult {
  template: SmsTemplate
  reason: string
  shouldSend: boolean
  aiCompleted: boolean
  voicemailCompleted: boolean
  aiCallRecordId?: string
  aiOutcome?: string
  fallbackSmsType?: string
}

/**
 * AI Call Outcome Types
 */
export type AiCallOutcome = 
  | 'completed_intake'  // AI collected required fields and confirmation flow completed
  | 'partial_intake'    // Caller provided some useful info but hung up before completion
  | 'early_hangup'      // Caller hung up before providing useful info
  | 'no_speech'         // Call connected but caller did not speak
  | 'ai_connection_failed'  // AI service failed before intake could start

/**
 * Centralized SMS Decision Logic
 * 
 * This function provides a single authoritative decision point for determining
 * which SMS template to send after an inbound call, eliminating race conditions
 * between AI summary SMS and generic missed-call SMS.
 * 
 * Updated to handle early hangup and partial intake scenarios with appropriate fallback SMS.
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
      .select('id, outcome, call_sid, lead_id, conversation_id, extracted_info, summary, hangup_stage, fields_collected_count, had_user_speech')
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

  // Check if any automated SMS has been sent for this lead in the last 5 minutes
  const recentAutomatedSms = await hasRecentAutomatedSms(leadId)
  if (recentAutomatedSms) {
    console.log('[AUTO SMS DECISION] Recent automated SMS already sent - suppressing duplicate', {
      leadId,
      callSid,
      reason: 'recent_automated_sms_exists'
    })
    return {
      template: 'none',
      shouldSend: false,
      reason: 'recent_automated_sms_exists',
      aiCompleted: false,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id
    }
  }

  // Check for Out of Office Mode (priority: 2, after ignored/blocked rules)
  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, name, out_of_office_enabled, out_of_office_start, out_of_office_end, out_of_office_message, business_hours_enabled, business_hours_start, business_hours_end, business_hours_timezone')
    .eq('id', businessId)
    .single()

  console.log('[AFTER HOURS DECISION] Business data for after-hours check', {
    businessId,
    businessHoursEnabled: business?.business_hours_enabled,
    businessHoursStart: business?.business_hours_start,
    businessHoursEnd: business?.business_hours_end,
    businessTimezone: business?.business_hours_timezone
  })

  if (business && isBusinessOutOfOffice(business as any)) {
    console.log('[AUTO SMS DECISION] Out of Office Mode is active - using out of office message', {
      leadId,
      callSid,
      businessId,
      businessName: business.name
    })
    return {
      template: 'out_of_office',
      shouldSend: true,
      reason: 'out_of_office_active',
      aiCompleted: false,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id
    }
  }

  // Check for After Hours Mode (priority: 3, after out-of-office, before AI outcome)
  // For NON-AI completed intake only. For AI completed intake, the notice will be prepended to AI Summary SMS.
  const isAfterHours = business && !isWithinBusinessHours(business)
  if (business && isAfterHours) {
    // Check if AI completed intake - if so, let the AI summary SMS handle the notice
    const outcome = aiCallRecord?.outcome as AiCallOutcome
    if (outcome === 'completed_intake') {
      console.log('[AUTO SMS DECISION] After Hours Mode active but AI completed intake - AI summary will include notice', {
        leadId,
        callSid,
        businessId,
        businessName: business.name,
        businessHoursEnabled: business.business_hours_enabled
      })
      // Continue to AI outcome logic, which will return template: 'none'
    } else {
      console.log('[AUTO SMS DECISION] After Hours Mode is active - using after hours message', {
        leadId,
        callSid,
        businessId,
        businessName: business.name,
        businessHoursEnabled: business.business_hours_enabled
      })
      return {
        template: 'after_hours',
        shouldSend: true,
        reason: 'after_hours_active',
        aiCompleted: false,
        voicemailCompleted: false,
        aiCallRecordId: aiCallRecord?.id
      }
    }
  }

  // Decision logic based on AI call outcome
  const outcome = aiCallRecord?.outcome as AiCallOutcome
  const hasExtractedInfo = aiCallRecord?.extracted_info && Object.keys(aiCallRecord.extracted_info).length > 0
  const hasSummary = aiCallRecord?.summary && aiCallRecord.summary.length > 0
  const fieldsCollectedCount = aiCallRecord?.fields_collected_count || 0
  const hadUserSpeech = aiCallRecord?.had_user_speech || false

  let result: SmsDecisionResult

  if (outcome === 'completed_intake') {
    // AI completed full intake - AI summary SMS should be sent by external service
    console.log('[AFTER HOURS DECISION] AI completed intake - suppressing generic SMS', {
      callSid,
      leadId,
      aiCallRecordId: aiCallRecord?.id,
      outcome,
      reason: 'ai_intake_completed',
      businessHoursEnabled: business?.business_hours_enabled,
      note: 'THIS IS THE ROOT CAUSE: AI completion suppresses ALL SMS including after-hours'
    })
    console.log('[AUTO SMS DECISION] AI completed intake - suppress generic SMS', {
      callSid,
      leadId,
      aiCallRecordId: aiCallRecord?.id,
      outcome,
      reason: 'ai_intake_completed'
    })

    result = {
      template: 'none',
      shouldSend: false,
      reason: 'ai_intake_completed',
      aiCompleted: true,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id,
      aiOutcome: outcome,
      fallbackSmsType: 'none'
    }
  } else if (outcome === 'partial_intake') {
    // Partial intake - send partial recovery SMS
    console.log('[AUTO SMS DECISION] Partial intake detected - send partial recovery SMS', {
      callSid,
      leadId,
      aiCallRecordId: aiCallRecord?.id,
      outcome,
      fieldsCollectedCount,
      reason: 'partial_intake'
    })

    result = {
      template: 'partial_intake',
      shouldSend: true,
      reason: 'partial_intake',
      aiCompleted: false,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id,
      aiOutcome: outcome,
      fallbackSmsType: 'partial_recovery'
    }
  } else if (outcome === 'early_hangup' || outcome === 'no_speech') {
    // Early hangup or no speech - send generic missed-call recovery SMS
    console.log('[AUTO SMS DECISION] Early hangup or no speech - send generic missed-call SMS', {
      callSid,
      leadId,
      aiCallRecordId: aiCallRecord?.id,
      outcome,
      hadUserSpeech,
      reason: outcome
    })

    result = {
      template: 'missed_call',
      shouldSend: true,
      reason: outcome,
      aiCompleted: false,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id,
      aiOutcome: outcome,
      fallbackSmsType: 'generic_recovery'
    }
  } else if (outcome === 'ai_connection_failed') {
    // AI connection failed - send generic missed-call recovery SMS
    console.log('[AUTO SMS DECISION] AI connection failed - send generic missed-call SMS', {
      callSid,
      leadId,
      aiCallRecordId: aiCallRecord?.id,
      outcome,
      reason: 'ai_connection_failed'
    })

    result = {
      template: 'missed_call',
      shouldSend: true,
      reason: 'ai_connection_failed',
      aiCompleted: false,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id,
      aiOutcome: outcome,
      fallbackSmsType: 'generic_recovery'
    }
  } else if (hasExtractedInfo || hasSummary || fieldsCollectedCount > 0) {
    // Legacy fallback: if AI has some data but no outcome recorded, treat as partial intake
    console.log('[AUTO SMS DECISION] AI has data but no outcome - treat as partial intake', {
      callSid,
      leadId,
      aiCallRecordId: aiCallRecord?.id,
      hasExtractedInfo,
      hasSummary,
      fieldsCollectedCount,
      reason: 'ai_data_without_outcome'
    })

    result = {
      template: 'partial_intake',
      shouldSend: true,
      reason: 'ai_data_without_outcome',
      aiCompleted: false,
      voicemailCompleted: false,
      aiCallRecordId: aiCallRecord?.id,
      aiOutcome: outcome || 'partial_intake',
      fallbackSmsType: 'partial_recovery'
    }
  } else {
    // No AI data - send generic missed-call SMS
    console.log('[AUTO SMS DECISION] No AI data - send generic missed-call SMS', {
      callSid,
      leadId,
      conversationId,
      aiCallRecordFound: !!aiCallRecord,
      reason: 'no_ai_data'
    })

    result = {
      template: 'missed_call',
      shouldSend: true,
      reason: 'no_ai_data',
      aiCompleted: false,
      voicemailCompleted: false,
      fallbackSmsType: 'generic_recovery'
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
    aiOutcome: result.aiOutcome,
    fallbackSmsType: result.fallbackSmsType
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
    .eq('is_manual', false)
    .gte('created_at', fiveMinutesAgo)
    .limit(1)
    .maybeSingle()

  return !!recentMessage
}
