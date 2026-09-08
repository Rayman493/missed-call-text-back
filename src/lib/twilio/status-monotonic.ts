/**
 * Canonical message delivery status monotonicity helper.
 *
 * Higher rank = more final state. Status can only move to higher ranks,
 * with explicit terminal-state rules for delivered and failure states.
 */

export const STATUS_RANK: Record<string, number> = {
  pending: 0,
  sending: 1,
  accepted: 2,
  queued: 3,
  sent: 4,
  delivered: 5,
  undelivered: 6,
  failed: 7,
  not_sent: 8,
}

/**
 * Determine the monotonic status for a message update.
 *
 * Terminal-state rules:
 * - Delivered cannot downgrade to any other status
 * - Failed/undelivered/not_sent cannot be replaced by delivered
 * - Queued cannot replace sent
 * - Sent cannot replace delivered
 *
 * @param currentStatus - existing persisted status
 * @param newStatus - incoming status from Twilio callback
 * @returns the status that should be persisted
 */
export function getMonotonicMessageStatus(
  currentStatus: string | null | undefined,
  newStatus: string | null | undefined
): string {
  const current = currentStatus?.toLowerCase() || 'pending'
  const incoming = newStatus?.toLowerCase() || current

  // Terminal state: Delivered cannot downgrade
  if (current === 'delivered') {
    return current
  }

  // Terminal failure states cannot be overwritten by a later delivered
  if (
    (current === 'failed' || current === 'undelivered' || current === 'not_sent') &&
    incoming === 'delivered'
  ) {
    return current
  }

  // Queued cannot replace Sent
  if (current === 'sent' && incoming === 'queued') {
    return current
  }

  // Sent cannot replace Delivered
  if (current === 'delivered' && incoming === 'sent') {
    return current
  }

  const currentRank = STATUS_RANK[current] ?? 0
  const incomingRank = STATUS_RANK[incoming] ?? 0

  // Only upgrade if new status has higher or equal rank
  if (incomingRank >= currentRank) {
    return incoming
  }

  // Keep current status if new status would downgrade
  return current
}
