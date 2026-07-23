/**
 * Terminal Payment Attempt State Machine
 *
 * This defines the state machine for Tap to Pay payment attempts, including
 * the "ambiguous" state for handling uncertain payment outcomes.
 *
 * States:
 * - not_started: Initial state before payment begins
 * - creating_payment_intent: PaymentIntent is being created on backend
 * - collecting: Native SDK is collecting payment method
 * - processing: Payment is being processed by Stripe
 * - succeeded: Payment succeeded (terminal state)
 * - failed: Payment failed (terminal state)
 * - canceled: Payment was canceled (terminal state)
 * - ambiguous: Payment outcome is uncertain (requires recovery)
 *
 * Transitions:
 * - not_started -> creating_payment_intent: User initiates payment
 * - creating_payment_intent -> collecting: PaymentIntent created successfully
 * - creating_payment_intent -> failed: PaymentIntent creation failed
 * - collecting -> processing: Payment method collected, confirming
 * - collecting -> failed: Payment collection failed
 * - collecting -> canceled: User canceled
 * - collecting -> ambiguous: Network error or app crash during collection
 * - processing -> succeeded: Payment succeeded
 * - processing -> failed: Payment failed
 * - processing -> ambiguous: Network error or app crash during processing
 * - ambiguous -> succeeded: Recovery confirms payment succeeded
 * - ambiguous -> failed: Recovery confirms payment failed
 * - ambiguous -> processing: Recovery shows still processing (continue polling)
 */

export type AttemptState =
  | 'not_started'
  | 'creating_payment_intent'
  | 'collecting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'ambiguous'

export interface AttemptStateTransition {
  from: AttemptState
  to: AttemptState
  reason?: string
}

/**
 * Check if a state is terminal (no further transitions possible)
 */
export function isTerminalState(state: AttemptState): boolean {
  return state === 'succeeded' || state === 'failed' || state === 'canceled'
}

/**
 * Check if a state requires recovery (ambiguous outcome)
 */
export function requiresRecovery(state: AttemptState): boolean {
  return state === 'ambiguous' || state === 'processing'
}

/**
 * Map Stripe PaymentIntent status to attempt state
 */
export function mapStripeStatusToAttemptState(stripeStatus: string): AttemptState {
  switch (stripeStatus) {
    case 'succeeded':
      return 'succeeded'
    case 'processing':
    case 'requires_capture':
    case 'requires_confirmation':
    case 'requires_action':
      return 'processing'
    case 'canceled':
      return 'canceled'
    case 'requires_payment_method':
      return 'failed'
    default:
      return 'ambiguous' // Unknown status requires recovery
  }
}

/**
 * Determine if a retry is allowed for a given state
 */
export function isRetryAllowed(state: AttemptState): boolean {
  // Retry is allowed for terminal failure states
  return state === 'failed' || state === 'canceled' || state === 'ambiguous'
}

/**
 * Get user-facing message for a state
 */
export function getStateMessage(state: AttemptState): string {
  switch (state) {
    case 'not_started':
      return 'Ready to start payment'
    case 'creating_payment_intent':
      return 'Setting up payment...'
    case 'collecting':
      return 'Tap card or phone to pay'
    case 'processing':
      return 'Processing payment...'
    case 'succeeded':
      return 'Payment successful'
    case 'failed':
      return 'Payment failed'
    case 'canceled':
      return 'Payment canceled'
    case 'ambiguous':
      return 'Payment status uncertain - checking...'
    default:
      return 'Unknown status'
  }
}

/**
 * Determine if user should be blocked from starting a new payment
 */
export function shouldBlockNewPayment(state: AttemptState): boolean {
  // Block if payment is in progress or ambiguous (needs resolution first)
  return state === 'creating_payment_intent' ||
         state === 'collecting' ||
         state === 'processing' ||
         state === 'ambiguous'
}
