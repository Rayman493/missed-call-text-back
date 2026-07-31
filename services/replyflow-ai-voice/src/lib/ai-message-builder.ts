/**
 * AI message payload builder for the messages table.
 *
 * This builder reuses the exact same persistence contract as SMS,
 * differing only in the fields that legitimately distinguish AI
 * summary/transcript messages from SMS messages.
 *
 * AI messages should NOT use the 'sender' field (it does not exist
 * in production). Instead, they use message_type to distinguish
 * the source (summary=ai, transcript=caller).
 */

export type AiMessageType = 'summary' | 'transcript' | 'system'

export type MessageDirection = 'inbound' | 'outbound'

export interface AiMessagePayload {
  conversation_id: string
  lead_id: string
  from_phone: string
  to_phone: string
  body: string
  direction: MessageDirection
  message_type: AiMessageType
  call_sid?: string
  structured_data?: any
}

/**
 * Build and validate a payload for the messages table.
 *
 * This enforces the production message contract:
 * - lead_id, direction, body, from_phone, to_phone are required
 * - twilio_message_sid, status, media_count are optional
 * - No 'sender' field (not in production schema)
 * - No 'business_id' field (not in message contract)
 */
export function buildAiMessagePayload(payload: AiMessagePayload): Record<string, any> {
  if (typeof payload.conversation_id !== 'string' || payload.conversation_id.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] conversation_id is required and must be a non-empty string')
  }
  if (typeof payload.lead_id !== 'string' || payload.lead_id.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] lead_id is required and must be a non-empty string')
  }
  if (typeof payload.from_phone !== 'string' || payload.from_phone.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] from_phone is required and must be a non-empty string')
  }
  if (typeof payload.to_phone !== 'string' || payload.to_phone.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] to_phone is required and must be a non-empty string')
  }
  if (typeof payload.body !== 'string') {
    throw new Error('[AI MESSAGE PAYLOAD] body is required and must be a string')
  }
  if (payload.direction !== 'inbound' && payload.direction !== 'outbound') {
    throw new Error(`[AI MESSAGE PAYLOAD] direction must be 'inbound' or 'outbound', received: ${payload.direction}`)
  }
  if (typeof payload.message_type !== 'string' || payload.message_type.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] message_type is required and must be a non-empty string')
  }

  const result: Record<string, any> = {
    conversation_id: payload.conversation_id,
    lead_id: payload.lead_id,
    body: payload.body,
    direction: payload.direction,
    message_type: payload.message_type,
    from_phone: payload.from_phone,
    to_phone: payload.to_phone,
    twilio_message_sid: null, // AI messages don't have Twilio SIDs
    status: null, // AI messages don't have delivery status
    media_count: 0, // AI messages are text-only
    created_at: new Date().toISOString(),
  }

  // Store call_sid in structured_data for deduplication
  if (payload.call_sid || payload.structured_data) {
    result.structured_data = {
      ...payload.structured_data,
      ...(payload.call_sid ? { call_sid: payload.call_sid } : {}),
    }
  }

  return result
}
