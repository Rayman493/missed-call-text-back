/**
 * Payment Request State Transition Guards
 *
 * This module enforces valid state transitions for payment requests to prevent
 * regressions and ensure data integrity.
 *
 * VALID TRANSITIONS:
 * - pending → processing
 * - pending → failed
 * - pending → canceled
 * - processing → paid
 * - processing → failed
 * - processing → canceled
 * - requires_payment_method → paid (via retry)
 * - requires_payment_method → failed
 * - requires_payment_method → canceled
 *
 * INVALID TRANSITIONS (BLOCKED):
 * - paid → any (terminal state)
 * - failed → processing (cannot resume failed attempts)
 * - canceled → processing (cannot resume canceled attempts)
 * - any → ambiguous (ambiguous is a client-side state, not a DB state)
 */

export type PaymentRequestStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'canceled' | 'cancelled' | 'requires_payment_method'

export interface TransitionResult {
  allowed: boolean
  reason?: string
}

/**
 * Canonical DB spelling is 'cancelled'. Accept 'canceled' as an alias because
 * some callers (and tests) use the American spelling, but always compare using
 * the canonical form.
 */
function canonicalStatus(status: PaymentRequestStatus): PaymentRequestStatus {
  return status === 'canceled' ? 'cancelled' : status
}

/**
 * Terminal states that cannot be transitioned from
 */
const TERMINAL_STATES: PaymentRequestStatus[] = ['paid', 'failed', 'cancelled']

/**
 * Validate a state transition
 */
export function validateStateTransition(
  fromStatus: PaymentRequestStatus | null,
  toStatus: PaymentRequestStatus
): TransitionResult {
  // If no previous status, any transition is allowed (new record)
  if (!fromStatus) {
    return { allowed: true }
  }

  const normalizedFrom = canonicalStatus(fromStatus)
  const normalizedTo = canonicalStatus(toStatus)

  // Cannot transition from terminal states
  if (TERMINAL_STATES.includes(normalizedFrom)) {
    return {
      allowed: false,
      reason: `Cannot transition from terminal state '${normalizedFrom}' to '${normalizedTo}'`,
    }
  }

  // Specific invalid transitions
  const invalidTransitions: Record<string, PaymentRequestStatus[]> = {
    failed: ['processing', 'pending'],
    cancelled: ['processing', 'pending'],
  }

  const blockedForFrom = invalidTransitions[normalizedFrom] || []
  if (blockedForFrom.includes(normalizedTo)) {
    return {
      allowed: false,
      reason: `Invalid transition from '${normalizedFrom}' to '${normalizedTo}'`,
    }
  }

  // All other transitions are allowed
  return { allowed: true }
}

/**
 * Safe status update that validates transition before applying
 * Returns true if update was applied, false if transition was invalid
 */
export async function safeStatusUpdate(
  updateFn: (newStatus: PaymentRequestStatus) => Promise<void>,
  fromStatus: PaymentRequestStatus | null,
  toStatus: PaymentRequestStatus
): Promise<boolean> {
  const validation = validateStateTransition(fromStatus, toStatus)

  if (!validation.allowed) {
    console.error('[STATE_TRANSITION] Blocked invalid transition:', validation.reason)
    return false
  }

  try {
    await updateFn(toStatus)
    console.log('[STATE_TRANSITION] Applied transition:', fromStatus || 'null', '→', toStatus)
    return true
  } catch (error) {
    console.error('[STATE_TRANSITION] Failed to apply transition:', error)
    return false
  }
}

/**
 * Check if a status is terminal
 */
export function isTerminalStatus(status: PaymentRequestStatus): boolean {
  return TERMINAL_STATES.includes(canonicalStatus(status))
}

/**
 * Check if a status allows retry (new PaymentIntent creation)
 */
export function allowsRetry(status: PaymentRequestStatus): boolean {
  const normalized = canonicalStatus(status)
  return normalized === 'failed' || normalized === 'cancelled' || normalized === 'requires_payment_method'
}

/**
 * Check if a status requires recovery (ambiguous outcome handling)
 */
export function requiresRecovery(status: PaymentRequestStatus): boolean {
  return status === 'pending' || status === 'processing'
}
