/**
 * AI Call Assistant Session Manager (Phase 0 - QA Only)
 * 
 * Manages AI call session lifecycle and database operations
 */

import { supabaseAdmin } from '@/lib/supabase/admin'

export interface AICallSession {
  id: string
  business_id: string
  lead_id: string | null
  call_sid: string
  openai_session_id: string | null
  status: 'started' | 'connected' | 'in_conversation' | 'completed' | 'failed' | 'timed_out' | 'fallback_voicemail' | 'caller_hungup'
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
  business_category: string | null
  created_at: string
  updated_at: string
}

export interface CreateSessionParams {
  business_id: string
  lead_id: string | null
  call_sid: string
  openai_session_id?: string
  business_category?: string
}

export interface UpdateSessionParams {
  status?: AICallSession['status']
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
    console.log('[AI CALL ASSISTANT] Creating session', {
      business_id: params.business_id,
      call_sid: params.call_sid
    })

    const { data, error } = await supabaseAdmin
      .from('ai_call_sessions')
      .insert({
        business_id: params.business_id,
        lead_id: params.lead_id,
        call_sid: params.call_sid,
        openai_session_id: params.openai_session_id || null,
        status: 'started',
        started_at: new Date().toISOString(),
        business_category: params.business_category || null,
      })
      .select()
      .single()

    if (error) {
      // Check for duplicate call_sid
      if (error.code === '23505') {
        console.log('[AI CALL ASSISTANT] Duplicate call_sid detected, fetching existing session', {
          call_sid: params.call_sid
        })
        return getAISessionByCallSid(params.call_sid)
      }
      
      console.error('[AI CALL ASSISTANT] Failed to create session:', error)
      return null
    }

    console.log('[AI CALL ASSISTANT] Session created', {
      session_id: data.id,
      call_sid: data.call_sid
    })

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
    console.log('[AI CALL ASSISTANT] Updating session', {
      session_id: sessionId,
      updates: Object.keys(params)
    })

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

    console.log('[AI CALL ASSISTANT] Session updated', {
      session_id: sessionId,
      status: data.status
    })

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

  return updateAISession(sessionId, {
    status: 'completed',
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
  return updateAISession(sessionId, {
    status: 'fallback_voicemail',
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
