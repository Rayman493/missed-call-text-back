/**
 * Stripe-managed refund and dispute reconciliation helpers.
 *
 * Stripe is the authority for financial transactions. These pure functions
 * derive ReplyFlow's stored refund/dispute state from authoritative Stripe
 * objects — never from client-supplied or amount-only data.
 */

export type RefundStatus = 'pending' | 'partially_refunded' | 'refunded' | 'failed'
export type DisputeStatus = 'open' | 'won' | 'lost'

export interface RefundStateResult {
  refund_status: RefundStatus | null
  refunded_amount_cents: number
}

/**
 * Derive refund state from an authoritative Stripe Charge.
 *
 * `charge.amount_refunded` is Stripe's authoritative total of all successful
 * refunds (integer minor units). Refund objects carry individual statuses so
 * a pending or failed refund is never reported as completed.
 *
 * A failed/canceled refund must never display as refunded — when any amount
 * was actually refunded, the partial/full state wins; 'failed' only applies
 * when nothing was refunded but a refund attempt exists and did not succeed.
 */
export function computeRefundState(
  originalAmountCents: number,
  charge: { amount_refunded?: number | null; refunds?: { data?: Array<{ status?: string | null }> } | null }
): RefundStateResult {
  const rawRefunded = Math.max(0, charge.amount_refunded ?? 0)
  // Defensive cap: never report more refunded than the original amount.
  const refunded = Math.min(rawRefunded, originalAmountCents)

  if (refunded >= originalAmountCents && originalAmountCents > 0) {
    return { refund_status: 'refunded', refunded_amount_cents: refunded }
  }
  if (refunded > 0) {
    return { refund_status: 'partially_refunded', refunded_amount_cents: refunded }
  }

  const statuses = (charge.refunds?.data ?? [])
    .map(r => r.status)
    .filter((s): s is string => !!s)

  if (statuses.some(s => s === 'pending')) {
    return { refund_status: 'pending', refunded_amount_cents: 0 }
  }
  if (statuses.some(s => s === 'failed' || s === 'canceled')) {
    return { refund_status: 'failed', refunded_amount_cents: 0 }
  }
  if (statuses.some(s => s === 'succeeded')) {
    // Succeeded refunds with zero amount_refunded is contradictory Stripe
    // data — trust the total and treat as pending until Stripe settles it.
    return { refund_status: 'pending', refunded_amount_cents: 0 }
  }
  return { refund_status: null, refunded_amount_cents: 0 }
}

/**
 * Map a Stripe dispute status to the stored dispute state.
 *
 * 'warning_closed' means the dispute was closed without a response — the
 * business lost by default. 'won' only reflects the dispute outcome Stripe
 * reported; it does NOT imply funds were reinstated.
 */
export function mapDisputeStatus(stripeStatus: string | null | undefined): DisputeStatus {
  if (stripeStatus === 'won') return 'won'
  if (stripeStatus === 'lost' || stripeStatus === 'warning_closed') return 'lost'
  return 'open'
}
