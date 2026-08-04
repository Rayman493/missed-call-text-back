/**
 * Centralized Customer Status Transition Helper
 * 
 * This helper provides a single source of truth for automatic customer status transitions.
 * All status changes should flow through this function to ensure consistent behavior.
 * 
 * Protected statuses (ignored, lost) are never overridden automatically.
 * Backward transitions are prevented to maintain logical progression.
 */

import { normalizeCustomerStatus } from './customer-status'

/**
 * Canonical customer statuses
 */
export type CustomerStatus = 'new' | 'needs_reply' | 'active' | 'scheduled' | 'payment_requested' | 'paid' | 'completed' | 'ignored' | 'lost'

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
 */
const PROTECTED_STATUSES: CustomerStatus[] = ['ignored', 'lost']

/**
 * Statuses that should not transition backward
 * e.g., paid should not become active, completed should not become needs_reply
 */
const BACKWARD_TRANSITION_RULES: Partial<Record<CustomerStatus, CustomerStatus[]>> = {
  paid: ['active', 'needs_reply', 'new'],
  completed: ['active', 'needs_reply', 'new', 'scheduled', 'payment_requested'],
  scheduled: ['active', 'needs_reply', 'new'],
}

/**
 * Transition table mapping (currentStatus, event) → nextStatus
 * Returns null if transition is not allowed
 */
const TRANSITION_TABLE: Record<CustomerStatus, Partial<Record<StatusEvent, CustomerStatus>>> = {
  new: {
    inbound_message_received: 'needs_reply',
    ai_intake_completed: 'needs_reply',
    business_reply_sent: 'active',
    appointment_created: 'scheduled',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  needs_reply: {
    business_reply_sent: 'active',
    appointment_created: 'scheduled',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  active: {
    appointment_created: 'scheduled',
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  scheduled: {
    payment_request_sent: 'payment_requested',
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  payment_requested: {
    payment_succeeded: 'paid',
    workflow_completed: 'completed',
  },
  paid: {
    workflow_completed: 'completed',
  },
  completed: {
    // No transitions from completed - it's a terminal state
  },
  ignored: {
    // Protected status - no automatic transitions
  },
  lost: {
    // Protected status - no automatic transitions
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

  // Protected statuses are never overridden
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
