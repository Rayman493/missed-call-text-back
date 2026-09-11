/**
 * Centralized Customer Status Transition Helper
 *
 * This helper provides a single source of truth for automatic customer status transitions.
 * All status changes should flow through this function to ensure consistent behavior.
 *
 * Universal reactivation rule: inbound_message_received always transitions the customer
 * to 'active' regardless of prior lifecycle status (all 10 statuses). A normal inbound
 * customer SMS must never be blocked by lifecycle status. This reactivation only updates
 * the customer/lead lifecycle status — it does NOT alter jobs, payments, appointments,
 * reminders, or any other business object state.
 *
 * Protected statuses (cancelled, ignored, lost) are never overridden by business/workflow
 * events, but ARE reactivated to 'active' by inbound_message_received.
 * Backward transitions are prevented for business/workflow events to maintain logical progression.
 */

import { normalizeCustomerStatus } from './customer-status'

/**
 * Canonical customer statuses
 */
export type CustomerStatus = 'new' | 'needs_reply' | 'active' | 'scheduled' | 'payment_requested' | 'paid' | 'completed' | 'cancelled' | 'ignored' | 'lost'

/**
 * Events that can trigger status transitions
 */
export type StatusEvent =
  | 'customer_created'
  | 'inbound_message_received'
  | 'ai_intake_completed'
  | 'business_reply_sent'
  | 'appointment_created'
  | 'payment_request_sent'
  | 'payment_succeeded'
  | 'workflow_completed'

/**
 * Protected statuses that should never be overridden automatically
 * by business/workflow events (e.g. business_reply_sent, appointment_created).
 *
 * NOTE: inbound_message_received is intentionally EXCLUDED from this protection.
 * A customer reply always reactivates the customer to 'active' regardless of
 * prior lifecycle status (cancelled, ignored, lost). This is the canonical
 * universal reactivation rule: customer status must never prevent an existing
 * customer from continuing a conversation.
 */
const PROTECTED_STATUSES: CustomerStatus[] = ['cancelled', 'ignored', 'lost']

/**
 * Statuses that should not transition backward
 * e.g., paid should not become active, completed should not become needs_reply
 *
 * NOTE: This rule does NOT apply to inbound_message_received. A customer reply
 * universally reactivates to 'active' from every lifecycle status.
 */
const BACKWARD_TRANSITION_RULES: Partial<Record<CustomerStatus, CustomerStatus[]>> = {
  paid: ['active', 'needs_reply', 'new'],
  completed: ['active', 'needs_reply', 'new', 'scheduled', 'payment_requested'],
  scheduled: ['active', 'needs_reply', 'new'],
}

/**
 * Transition table mapping (currentStatus, event) → nextStatus
 * Returns null if transition is not allowed
 *
 * Universal reactivation rule: inbound_message_received → 'active' for ALL
 * 10 lifecycle statuses. A normal inbound customer SMS always reactivates the
 * customer to 'active', regardless of prior lifecycle status. This does NOT
 * alter jobs, payments, appointments, or any other business object state —
 * it only updates the customer/lead lifecycle status.
 */
const TRANSITION_TABLE: Record<CustomerStatus, Partial<Record<StatusEvent, CustomerStatus>>> = {
  new: {
    inbound_message_received: 'active',
    ai_intake_completed: 'needs_reply',
    business_reply_sent: 'active',
    appointment_created: 'scheduled',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  needs_reply: {
    inbound_message_received: 'active',
    business_reply_sent: 'active',
    appointment_created: 'scheduled',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  active: {
    inbound_message_received: 'active',
    appointment_created: 'scheduled',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  scheduled: {
    inbound_message_received: 'active',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  payment_requested: {
    inbound_message_received: 'active',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  paid: {
    inbound_message_received: 'active',
    workflow_completed: 'completed',
  },
  completed: {
    inbound_message_received: 'active',
  },
  cancelled: {
    inbound_message_received: 'active',
  },
  ignored: {
    inbound_message_received: 'active',
  },
  lost: {
    inbound_message_received: 'active',
  },
}

/**
 * Apply a status event to determine the next status
 * 
 * @param currentStatus - The current customer status (raw or normalized)
 * @param event - The event that occurred
 * @returns The next status, or null if transition is not allowed
 */
export function applyCustomerStatusEvent(
  currentStatus: string | null | undefined,
  event: StatusEvent
): CustomerStatus | null {
  // Normalize the current status
  const normalizedCurrent = normalizeCustomerStatus(currentStatus || 'new') as CustomerStatus

  // Universal reactivation rule: inbound_message_received always reactivates
  // the customer to 'active' regardless of prior lifecycle status. This event
  // is exempt from the protected-status guard because a customer reply must
  // never be blocked by lifecycle status (cancelled, ignored, lost).
  // All 10 lifecycle statuses map to 'active' for this event in TRANSITION_TABLE.
  if (event === 'inbound_message_received') {
    return TRANSITION_TABLE[normalizedCurrent]?.[event] ?? 'active'
  }

  // Protected statuses are never overridden by other (business/workflow) events
  if (PROTECTED_STATUSES.includes(normalizedCurrent)) {
    return null
  }

  // Check for backward transitions
  const forbiddenBackwardTransitions = BACKWARD_TRANSITION_RULES[normalizedCurrent]
  if (forbiddenBackwardTransitions) {
    // This check is handled by the transition table not having those transitions
    // But we can add additional validation here if needed
  }

  // Look up the transition
  const nextStatus = TRANSITION_TABLE[normalizedCurrent]?.[event]

  return nextStatus || null
}

/**
 * Check if a status is protected (ignored or lost)
 */
export function isProtectedStatus(status: string | null | undefined): boolean {
  const normalized = normalizeCustomerStatus(status || 'new') as CustomerStatus
  return PROTECTED_STATUSES.includes(normalized)
}

/**
 * Get all possible next statuses for a given current status
 */
export function getPossibleTransitions(currentStatus: string | null | undefined): CustomerStatus[] {
  const normalized = normalizeCustomerStatus(currentStatus || 'new') as CustomerStatus
  return Object.values(TRANSITION_TABLE[normalized] || {}).filter(Boolean) as CustomerStatus[]
}
