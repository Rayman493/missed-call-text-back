/**
 * AI message payload builder for the messages table.
 *
 * Enforces the current ReplyFlow message contract (body + direction)
 * and rejects the legacy content-only insert shape. This is the
 * single source of truth for all AI intake message rows written by
 * the Fly.io voice service.
 */

export type AiMessageType = 'summary' | 'transcript' | 'system'

export type MessageDirection = 'inbound' | 'outbound'

export interface AiMessagePayload {
  conversation_id: string
  lead_id: string
  business_id: string
  body: string
  direction: MessageDirection
  message_type: AiMessageType
  structured_data?: any
}

/**
 * Build and validate a payload for the messages table.
 *
 * Throws if the payload does not satisfy the current body/direction
 * contract. This prevents any call-finalization path from silently
 * reverting to the legacy content-only insert.
 */
export function buildAiMessagePayload(payload: AiMessagePayload): Record<string, any> {
  if (typeof payload.conversation_id !== 'string' || payload.conversation_id.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] conversation_id is required and must be a non-empty string')
  }
  if (typeof payload.lead_id !== 'string' || payload.lead_id.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] lead_id is required and must be a non-empty string')
  }
  if (typeof payload.business_id !== 'string' || payload.business_id.length === 0) {
    throw new Error('[AI MESSAGE PAYLOAD] business_id is required and must be a non-empty string')
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
    business_id: payload.business_id,
    body: payload.body,
    direction: payload.direction,
    message_type: payload.message_type,
  }

  if (payload.structured_data !== undefined) {
    result.structured_data = payload.structured_data
  }

  return result
}
