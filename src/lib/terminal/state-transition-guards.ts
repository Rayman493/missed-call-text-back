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

export type PaymentRequestStatus = 'pending' | 'processing' | 'paid' | 'failed' | 'canceled' | 'requires_payment_method'

export interface TransitionResult {
  allowed: boolean
  reason?: string
}

/**
 * Terminal states that cannot be transitioned from
 */
const TERMINAL_STATES: PaymentRequestStatus[] = ['paid', 'failed', 'canceled']

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

  // Cannot transition from terminal states
  if (TERMINAL_STATES.includes(fromStatus)) {
    return {
      allowed: false,
      reason: `Cannot transition from terminal state '${fromStatus}' to '${toStatus}'`,
    }
  }

  // Specific invalid transitions
  const invalidTransitions: Record<string, PaymentRequestStatus[]> = {
    failed: ['processing', 'pending'],
    canceled: ['processing', 'pending'],
  }

  const blockedForFrom = invalidTransitions[fromStatus] || []
  if (blockedForFrom.includes(toStatus)) {
    return {
      allowed: false,
      reason: `Invalid transition from '${fromStatus}' to '${toStatus}'`,
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
  return TERMINAL_STATES.includes(status)
}

/**
 * Check if a status allows retry (new PaymentIntent creation)
 */
export function allowsRetry(status: PaymentRequestStatus): boolean {
  return status === 'failed' || status === 'canceled' || status === 'requires_payment_method'
}

/**
 * Check if a status requires recovery (ambiguous outcome handling)
 */
export function requiresRecovery(status: PaymentRequestStatus): boolean {
  return status === 'pending' || status === 'processing'
}
