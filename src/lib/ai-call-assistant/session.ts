/**
 * AI Call Assistant Session Manager
 * 
 * Manages AI call session lifecycle and database operations
 */

import { supabaseAdmin } from '@/lib/supabase/admin'
import { classifyOutcome, OutcomeClassificationInput } from './outcome-classifier'

// Guardrail configuration
export const AI_GUARDRAILS = {
  MAX_CALL_SECONDS: parseInt(process.env.AI_MAX_CALL_SECONDS || '300', 10), // Default: 5 minutes
  MAX_CONVERSATION_TURNS: parseInt(process.env.AI_MAX_CONVERSATION_TURNS || '20', 10), // Default: 20 turns
  MAX_FIELD_ATTEMPTS: parseInt(process.env.AI_MAX_FIELD_ATTEMPTS || '3', 10), // Default: 3 attempts per field
}

export interface AICallSession {
  id: string
  business_id: string
  lead_id: string | null
  call_sid: string
  openai_session_id: string | null
  status: 'started' | 'connected' | 'in_conversation' | 'completed' | 'failed' | 'timed_out' | 'fallback_voicemail' | 'caller_hungup'
  outcome: 'completed_intake' | 'partial_intake' | 'early_hangup' | 'no_speech' | 'ai_connection_failed' | null
  fallback_stage: string | null
  started_at: string
  connected_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  transcript: string | null
  summary: string | null
  caller_name: string | null
  reason_for_call: string | null
  urgency: string | null
  callback_number: string | null
  error_message: string | null
  raw_metadata: any
  created_at: string
  updated_at: string
}

export interface CreateSessionParams {
  business_id: string
  lead_id: string | null
  call_sid: string
  openai_session_id?: string
}

export interface UpdateSessionParams {
  status?: AICallSession['status']
  outcome?: AICallSession['outcome']
  fallback_stage?: string
  connected_at?: string
  ended_at?: string
  duration_seconds?: number
  transcript?: string
  summary?: string
  caller_name?: string
  reason_for_call?: string
  urgency?: string
  callback_number?: string
  error_message?: string
  raw_metadata?: any
}

/**
 * Create a new AI call session
 */
export async function createAISession(params: CreateSessionParams): Promise<AICallSession | null> {
  try {
    const insertPayload = {
      business_id: params.business_id,
      lead_id: params.lead_id,
      call_sid: params.call_sid,
      openai_session_id: params.openai_session_id || null,
      status: 'started',
      started_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from('ai_call_sessions')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      // Check for duplicate call_sid
      if (error.code === '23505') {
        return getAISessionByCallSid(params.call_sid)
      }
      
      console.error('[AI SESSION CREATE] failure', {
        code: error.code,
        message: error.message,
        callSid: params.call_sid
      })
      return null
    }

    return data
  } catch (error) {
    console.error('[AI CALL ASSISTANT] Exception creating session:', error)
    return null
  }
}

/**
 * Get AI session by call SID
 */
export async function getAISessionByCallSid(callSid: string): Promise<AICallSession | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_call_sessions')
      .select('*')
      .eq('call_sid', callSid)
      .single()

    if (error) {
      console.error('[AI CALL ASSISTANT] Failed to get session by call_sid:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('[AI CALL ASSISTANT] Exception getting session:', error)
    return null
  }
}

/**
 * Update AI session
 */
export async function updateAISession(sessionId: string, params: UpdateSessionParams): Promise<AICallSession | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_call_sessions')
      .update({
        ...params,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single()

    if (error) {
      console.error('[AI CALL ASSISTANT] Failed to update session:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('[AI CALL ASSISTANT] Exception updating session:', error)
    return null
  }
}

/**
 * Mark session as completed with extracted data
 */
export async function completeAISession(
  sessionId: string,
  extractedData: {
    caller_name: string
    reason_for_call: string
    urgency: string
    callback_number: string
  },
  transcript?: string,
  summary?: string
): Promise<AICallSession | null> {
  const duration = await calculateSessionDuration(sessionId)

  // Prepare extracted info for outcome classification
  const extractedInfo = {
    callerName: extractedData.caller_name,
    reasonForCalling: extractedData.reason_for_call,
    urgencyLevel: extractedData.urgency,
    callbackNumber: extractedData.callback_number
  }

  // Classify the outcome based on actual data collected
  const classification = classifyOutcome({
    extractedInfo,
    transcript: transcript ? JSON.parse(transcript) : null,
    confirmationCompleted: true
  })

  return updateAISession(sessionId, {
    status: 'completed',
    outcome: classification.outcome,
    ended_at: new Date().toISOString(),
    duration_seconds: duration || undefined,
    transcript,
    summary,
    caller_name: extractedData.caller_name,
    reason_for_call: extractedData.reason_for_call,
    urgency: extractedData.urgency,
    callback_number: extractedData.callback_number,
  })
}

/**
 * Mark session as failed with fallback reason
 */
export async function failAISession(
  sessionId: string,
  fallbackStage: string,
  errorMessage?: string
): Promise<AICallSession | null> {
  // Determine outcome based on error type
  let outcome: AICallSession['outcome'] = 'ai_connection_failed'
  
  if (fallbackStage === 'caller_hangup') {
    outcome = 'early_hangup'
  } else if (fallbackStage === 'no_speech') {
    outcome = 'no_speech'
  }

  return updateAISession(sessionId, {
    status: 'fallback_voicemail',
    outcome,
    fallback_stage: fallbackStage,
    ended_at: new Date().toISOString(),
    error_message: errorMessage,
  })
}

/**
 * Calculate session duration
 */
export async function calculateSessionDuration(sessionId: string): Promise<number | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ai_call_sessions')
      .select('started_at')
      .eq('id', sessionId)
      .single()

    if (error || !data) return null

    const started = new Date(data.started_at).getTime()
    const ended = Date.now()
    return Math.floor((ended - started) / 1000)
  } catch (error) {
    console.error('[AI CALL ASSISTANT] Failed to calculate duration:', error)
    return null
  }
}

/**
 * Update session transcript (incremental)
 */
export async function updateSessionTranscript(sessionId: string, transcript: string): Promise<void> {
  await updateAISession(sessionId, { transcript })
}

/**
 * Mark session as timed out due to duration limit
 */
export async function timeoutAISession(
  sessionId: string,
  reason: 'duration' | 'turn_limit' | 'field_limit',
  extractedData?: {
    caller_name?: string
    reason_for_call?: string
    urgency?: string
    callback_number?: string
  }
): Promise<AICallSession | null> {
  const duration = await calculateSessionDuration(sessionId)

  // Save whatever data was collected as partial intake
  let outcome: AICallSession['outcome'] = 'partial_intake'
  
  if (extractedData && extractedData.caller_name && extractedData.reason_for_call) {
    // Some data collected, mark as partial
    outcome = 'partial_intake'
  } else {
    // No meaningful data collected
    outcome = 'early_hangup'
  }

  return updateAISession(sessionId, {
    status: 'timed_out',
    outcome,
    ended_at: new Date().toISOString(),
    duration_seconds: duration || undefined,
    caller_name: extractedData?.caller_name || undefined,
    reason_for_call: extractedData?.reason_for_call || undefined,
    urgency: extractedData?.urgency || undefined,
    callback_number: extractedData?.callback_number || undefined,
    raw_metadata: {
      guardrail_triggered: true,
      guardrail_reason: reason,
      ...extractedData
    }
  })
}

/**
 * Mark session as completed with partial intake (graceful exit)
 */
export async function completePartialAISession(
  sessionId: string,
  extractedData: {
    caller_name?: string
    reason_for_call?: string
    urgency?: string
    callback_number?: string
  },
  reason: 'duration' | 'turn_limit' | 'field_limit'
): Promise<AICallSession | null> {
  const duration = await calculateSessionDuration(sessionId)

  const classification = classifyOutcome({
    extractedInfo: {
      callerName: extractedData.caller_name || '',
      reasonForCalling: extractedData.reason_for_call || '',
      urgencyLevel: extractedData.urgency || 'low',
      callbackNumber: extractedData.callback_number || ''
    },
    transcript: null,
    confirmationCompleted: false
  })

  return updateAISession(sessionId, {
    status: 'completed',
    outcome: 'partial_intake',
    ended_at: new Date().toISOString(),
    duration_seconds: duration || undefined,
    caller_name: extractedData.caller_name || undefined,
    reason_for_call: extractedData.reason_for_call || undefined,
    urgency: extractedData.urgency || undefined,
    callback_number: extractedData.callback_number || undefined,
    raw_metadata: {
      guardrail_triggered: true,
      guardrail_reason: reason,
      partial_intake: true
    }
  })
}
