import { buildAiMessagePayload } from './ai-message-builder'

export interface PersistAiCallConversationMessagesInput {
  supabase: any
  callSid: string
  conversationId: string
  leadId: string
  fromPhone: string
  toPhone: string
  summary: string
  transcript: string
  extractedFields?: Record<string, any> | null
}

export interface PersistAiMessageResult {
  status: 'inserted' | 'already_exists' | 'failed' | 'skipped'
  error?: string
  insertedId?: string
  errorCode?: string
  errorMessage?: string
  errorDetails?: string
  errorHint?: string
}

export interface PersistAiCallConversationMessagesResult {
  summary: PersistAiMessageResult
  transcript: PersistAiMessageResult
}

/**
 * Idempotent persistence of AI call summary and transcript messages.
 *
 * This helper is the only place the voice service should write to the
 * messages table for AI intake. It wraps buildAiMessagePayload, deduplicates
 * by conversation + message_type within a time window, and never swallows
 * failures silently.
 *
 * Deduplication strategy:
 * - conversation_id: Ensures we don't mix messages from different calls
 * - message_type: Ensures we have at most one summary and one transcript per call
 * - Time window (1 hour): Allows re-processing of the same call without duplicates
 *
 * This strategy works with the production schema which has no structured_data column.
 */
export async function persistAiCallConversationMessages(
  input: PersistAiCallConversationMessagesInput
): Promise<PersistAiCallConversationMessagesResult> {
  const { supabase, callSid, conversationId, leadId, fromPhone, toPhone, summary, transcript, extractedFields } = input

  const baseLog = {
    callSid,
    conversationId,
    leadId,
    fromPhone,
    toPhone,
  }

  const result: PersistAiCallConversationMessagesResult = {
    summary: { status: 'skipped' },
    transcript: { status: 'skipped' },
  }

  if (!supabase) {
    console.log('[AI MESSAGE PERSIST] status=failed reason=supabase-missing', baseLog)
    result.summary = { status: 'failed', error: 'supabase client missing' }
    result.transcript = { status: 'failed', error: 'supabase client missing' }
    return result
  }

  if (!conversationId || !leadId || !fromPhone || !toPhone) {
    console.log('[AI MESSAGE PERSIST] status=failed reason=missing-ids', {
      ...baseLog,
      hasConversationId: !!conversationId,
      hasLeadId: !!leadId,
      hasFromPhone: !!fromPhone,
      hasToPhone: !!toPhone,
    })
    result.summary = { status: 'failed', error: 'missing conversation, lead, from_phone, or to_phone' }
    result.transcript = { status: 'failed', error: 'missing conversation, lead, from_phone, or to_phone' }
    return result
  }

  const persistOne = async (
    type: 'summary' | 'transcript',
    body: string
  ): Promise<PersistAiMessageResult> => {
    if (typeof body !== 'string' || body.length === 0) {
      console.log('[AI MESSAGE PERSIST] status=skipped reason=blank-body', {
        ...baseLog,
        messageType: type,
      })
      return { status: 'skipped' }
    }

    try {
      // Deduplication: Check for existing message of same type in this conversation within 1 hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data: existing, error: checkError } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('message_type', type)
        .gte('created_at', oneHourAgo)
        .maybeSingle()

      if (checkError && checkError.code !== 'PGRST116') {
        console.log('[AI MESSAGE PERSIST] status=failed reason=dedup-check-error', {
          ...baseLog,
          messageType: type,
          error: checkError.message,
          code: checkError.code,
        })
        return {
          status: 'failed',
          error: checkError.message,
          errorCode: checkError.code,
          errorMessage: checkError.message,
          errorDetails: JSON.stringify(checkError),
        }
      }

      if (existing) {
        console.log('[AI MESSAGE PERSIST] status=already_exists', {
          ...baseLog,
          messageType: type,
          existingMessageId: existing.id,
        })
        return { status: 'already_exists' }
      }

      const payload = buildAiMessagePayload({
        conversation_id: conversationId,
        lead_id: leadId,
        from_phone: fromPhone,
        to_phone: toPhone,
        body,
        direction: type === 'transcript' ? 'inbound' : 'outbound',
        message_type: type,
      })

      console.log('[AI MESSAGE PERSIST] insert-start', {
        ...baseLog,
        messageType: type,
        payloadFields: Object.keys(payload),
        bodyLength: body.length,
      })

      const { data: insertedData, error: insertError } = await supabase
        .from('messages')
        .insert(payload)
        .select('id, message_type, conversation_id')
        .single()

      if (insertError) {
        console.log('[AI MESSAGE PERSIST] status=failed reason=insert-error', {
          ...baseLog,
          messageType: type,
          errorCode: insertError.code,
          errorMessage: insertError.message,
          errorDetails: JSON.stringify(insertError),
          errorHint: insertError.hint,
        })
        return {
          status: 'failed',
          error: insertError.message,
          errorCode: insertError.code,
          errorMessage: insertError.message,
          errorDetails: JSON.stringify(insertError),
          errorHint: insertError.hint,
        }
      }

      console.log('[AI MESSAGE PERSIST] status=inserted', {
        ...baseLog,
        messageType: type,
        insertedId: insertedData?.id,
        bodyLength: body.length,
      })

      return {
        status: 'inserted',
        insertedId: insertedData?.id,
      }
    } catch (err: any) {
      console.log('[AI MESSAGE PERSIST] status=failed reason=exception', {
        ...baseLog,
        messageType: type,
        error: err?.message || String(err),
      })
      return {
        status: 'failed',
        error: err?.message || String(err),
        errorMessage: err?.message || String(err),
        errorDetails: err?.stack || String(err),
      }
    }
  }

  result.summary = await persistOne('summary', summary)
  result.transcript = await persistOne('transcript', transcript)

  return result
}
