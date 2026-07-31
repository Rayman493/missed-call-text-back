import { buildAiMessagePayload } from './ai-message-builder'

export interface PersistAiCallConversationMessagesInput {
  supabase: any
  callSid: string
  conversationId: string
  leadId: string
  businessId: string
  summary: string
  transcript: string
  extractedFields?: Record<string, any> | null
}

export interface PersistAiMessageResult {
  status: 'inserted' | 'already_exists' | 'failed' | 'skipped'
  error?: string
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
 * by conversation + message_type + call_sid stored in structured_data, and
 * never swallows failures silently.
 */
export async function persistAiCallConversationMessages(
  input: PersistAiCallConversationMessagesInput
): Promise<PersistAiCallConversationMessagesResult> {
  const { supabase, callSid, conversationId, leadId, businessId, summary, transcript, extractedFields } = input

  const baseLog = {
    callSid,
    conversationId,
    leadId,
    businessId,
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

  if (!conversationId || !leadId || !businessId) {
    console.log('[AI MESSAGE PERSIST] status=failed reason=missing-ids', {
      ...baseLog,
      hasConversationId: !!conversationId,
      hasLeadId: !!leadId,
      hasBusinessId: !!businessId,
    })
    result.summary = { status: 'failed', error: 'missing conversation, lead, or business id' }
    result.transcript = { status: 'failed', error: 'missing conversation, lead, or business id' }
    return result
  }

  const persistOne = async (
    type: 'summary' | 'transcript',
    body: string,
    structuredData: Record<string, any> | null
  ): Promise<PersistAiMessageResult> => {
    if (typeof body !== 'string' || body.length === 0) {
      console.log('[AI MESSAGE PERSIST] status=skipped reason=blank-body', {
        ...baseLog,
        messageType: type,
      })
      return { status: 'skipped' }
    }

    try {
      const { data: existing, error: checkError } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('message_type', type)
        .eq('structured_data->>call_sid', callSid)
        .maybeSingle()

      if (checkError && checkError.code !== 'PGRST116') {
        console.log('[AI MESSAGE PERSIST] status=failed reason=dedup-check-error', {
          ...baseLog,
          messageType: type,
          error: checkError.message,
          code: checkError.code,
        })
        return { status: 'failed', error: checkError.message }
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
        business_id: businessId,
        body,
        direction: type === 'transcript' ? 'inbound' : 'outbound',
        message_type: type,
        structured_data: structuredData,
      })

      const { error: insertError } = await supabase.from('messages').insert(payload)

      if (insertError) {
        console.log('[AI MESSAGE PERSIST] status=failed reason=insert-error', {
          ...baseLog,
          messageType: type,
          error: insertError.message,
          code: insertError.code,
        })
        return { status: 'failed', error: insertError.message }
      }

      console.log('[AI MESSAGE PERSIST] status=inserted', {
        ...baseLog,
        messageType: type,
        bodyLength: body.length,
      })

      return { status: 'inserted' }
    } catch (err: any) {
      console.log('[AI MESSAGE PERSIST] status=failed reason=exception', {
        ...baseLog,
        messageType: type,
        error: err?.message || String(err),
      })
      return { status: 'failed', error: err?.message || String(err) }
    }
  }

  const summaryStructuredData = {
    ...(extractedFields || {}),
    call_sid: callSid,
  }

  result.summary = await persistOne('summary', summary, summaryStructuredData)
  result.transcript = await persistOne('transcript', transcript, { call_sid: callSid })

  return result
}
