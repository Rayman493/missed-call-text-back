/**
 * Lead Next Action Indicator (V1)
 *
 * Simple, reliable "next action" suggestion for lead cards.
 * Based on status only - no timing, no AI, no assumptions.
 *
 * Status tells the current state.
 * Next Action tells the obvious next step.
 */

import { normalizeCustomerStatus, CustomerStatus } from './customer-status'

export type NextAction = {
  text: string
  urgency: 'high' | 'medium' | 'low' | 'none'
} | null

/**
 * Get the next action for a lead based on its status.
 *
 * V1 Rules - Simple status-based mapping only:
 * - new → "Reply now" (high)
 * - needs_reply → "Reply now" (high)
 * - scheduled → "Upcoming job" (low)
 * - payment_requested → "Awaiting payment" (medium)
 * - completed → "Request review" (low)
 * - All other statuses → null
 *
 * Intentionally simple - no timing, no message direction, no AI prioritization.
 */
export function getNextAction(lead: any): NextAction {
  if (!lead) return null

  const rawStatus = lead.status || lead.lead_status
  if (!rawStatus) return null

  const status = normalizeCustomerStatus(rawStatus)

  // Only return actions for known statuses in V1 scope
  const v1Statuses = ['new', 'needs_reply', 'scheduled', 'payment_requested', 'completed']
  if (!v1Statuses.includes(status)) {
    return null
  }

  switch (status) {
    case 'new':
      return { text: 'Reply now', urgency: 'high' }

    case 'needs_reply':
      return { text: 'Reply now', urgency: 'high' }

    case 'scheduled':
      return { text: 'Upcoming job', urgency: 'low' }

    case 'payment_requested':
      return { text: 'Awaiting payment', urgency: 'medium' }

    case 'completed':
      return { text: 'Request review', urgency: 'low' }

    default:
      return null
  }
}