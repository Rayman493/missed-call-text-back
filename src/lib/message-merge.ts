import { getMonotonicMessageStatus } from '@/lib/twilio/status-monotonic'

// Canonical status monotonicity is provided by @/lib/twilio/status-monotonic.
// The local `getMonotonicStatus` wrapper delegates to that single source of
// truth so fetch/realtime reconciliation uses the same transition-aware state
// machine as the Twilio callback path.
function getMonotonicStatus(currentStatus: string, newStatus: string): string {
  return getMonotonicMessageStatus(currentStatus, newStatus)
}

/**
 * Canonical message merge function
 * - Matches by database ID, clientMessageId, or Twilio SID
 * - Enforces status monotonicity
 * - Prevents duplicates
 * - Preserves chronological ordering
 * - Clears optimistic flags on server reconciliation
 */
export function mergeMessageWithMonotonicity(existingMessages: any[], incomingMessage: any, source: string = 'unknown'): any[] {
  // Guard against null/undefined incoming messages (defensive: a null entry
  // in a realtime payload or API response would otherwise crash on .id access).
  if (!incomingMessage) return existingMessages
  const messageMap = new Map<string, any>()

  // Add existing messages first
  existingMessages.forEach(msg => {
    messageMap.set(msg.id, msg)
  })

  // Find existing message by multiple correlation keys
  let existingMessage: any = null
  let matchKey: string = ''

  // Normalize field names for matching
  const incomingClientMessageId = incomingMessage.clientMessageId || incomingMessage.client_message_id
  const incomingTwilioSid = incomingMessage.twilio_message_sid

  console.log('[SMS RECONCILE] =========================================')
  console.log('[SMS RECONCILE] source:', source)
  console.log('[SMS RECONCILE] incomingMessageId:', incomingMessage.id)
  console.log('[SMS RECONCILE] incomingClientMessageId:', incomingClientMessageId)
  console.log('[SMS RECONCILE] incomingTwilioSid:', incomingTwilioSid)
  console.log('[SMS RECONCILE] incomingStatus:', incomingMessage.status)
  console.log('[SMS RECONCILE] =========================================')

  // 1. Match by exact database ID
  if (incomingMessage.id && messageMap.has(incomingMessage.id)) {
    existingMessage = messageMap.get(incomingMessage.id)
    matchKey = 'id'
    console.log('[SMS RECONCILE] Matched by database ID')
  }
  // 2. Match by clientMessageId (for optimistic message reconciliation)
  else if (incomingClientMessageId) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      const msgClientMessageId = msg.clientMessageId || msg.client_message_id
      if (msgClientMessageId === incomingClientMessageId) {
        existingMessage = msg
        matchKey = 'clientMessageId'
        console.log('[SMS RECONCILE] Matched by clientMessageId:', incomingClientMessageId)
        break
      }
    }
  }
  // 3. Match by Twilio SID (for status updates)
  else if (incomingTwilioSid) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      if (msg.twilio_message_sid === incomingTwilioSid) {
        existingMessage = msg
        matchKey = 'twilio_message_sid'
        console.log('[SMS RECONCILE] Matched by Twilio SID:', incomingTwilioSid)
        break
      }
    }
  }

  if (existingMessage) {
    console.log('[SMS RECONCILE] Found existing message, merging...')
    console.log('[SMS RECONCILE] existingStatus:', existingMessage.status)
    console.log('[SMS RECONCILE] existingIsOptimistic:', existingMessage.isOptimistic)

    // Merge with monotonic status. The optimistic 'sending' state is a LOCAL
    // pseudo-status (API call in flight) — it is NOT the Twilio 'sending'
    // lifecycle state. If it were compared directly, the canonical server
    // snapshot ('queued'/'accepted') would be rejected as a regression and the
    // bubble would stay "Sending" forever once persisted. Treat optimistic
    // 'sending' as 'pending' for the comparison so any real server status wins.
    // A persisted Twilio 'sending' row still correctly rejects 'queued'.
    const effectiveExistingStatus =
      existingMessage.isOptimistic && existingMessage.status === 'sending'
        ? 'pending'
        : existingMessage.status

    const mergedMessage = {
      ...existingMessage,
      ...incomingMessage,
      // Preserve clientMessageId from optimistic message
      clientMessageId: existingMessage.clientMessageId || incomingMessage.clientMessageId || incomingMessage.client_message_id,
      // Clear optimistic flag when server confirms
      isOptimistic: false,
      status: getMonotonicStatus(effectiveExistingStatus, incomingMessage.status)
    }

    console.log('[SMS RECONCILE] mergedStatus:', mergedMessage.status)
    console.log('[SMS RECONCILE] mergedIsOptimistic:', mergedMessage.isOptimistic)

    // If matched by clientMessageId but incoming has real ID, update the map key
    if (matchKey === 'clientMessageId' && incomingMessage.id && incomingMessage.id !== existingMessage.id) {
      console.log('[SMS RECONCILE] Updating map key from optimistic ID to server ID:', {
        oldKey: existingMessage.id,
        newKey: incomingMessage.id
      })
      messageMap.delete(existingMessage.id)
      messageMap.set(incomingMessage.id, mergedMessage)
    } else {
      messageMap.set(existingMessage.id, mergedMessage)
    }
  } else {
    console.log('[SMS RECONCILE] No existing message found, adding as new')
    // New message - add to map
    messageMap.set(incomingMessage.id, incomingMessage)
  }

  console.log('[SMS RECONCILE] Total messages after merge:', messageMap.size)
  console.log('[SMS RECONCILE] =========================================')

  // Convert back to array and sort chronologically
  const merged = Array.from(messageMap.values())
  const sorted = merged.sort((a: any, b: any) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (timeDiff !== 0) return timeDiff

    // Tie-breaker: inbound before outbound if same timestamp
    if (a.direction === 'inbound' && b.direction === 'outbound') return -1
    if (a.direction === 'outbound' && b.direction === 'inbound') return 1

    // Final tie-breaker: id ascending
    return a.id.localeCompare(b.id)
  })

  return sorted
}
