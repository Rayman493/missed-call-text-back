import { SuggestedAction } from '../suggested-actions/types'
import { outcomesService } from './outcomes-service'
import { ResolutionMethod } from './types'

/**
 * Mark an action as shown (record the timestamp)
 */
export function markActionShown(action: SuggestedAction): SuggestedAction {
  const timeShown = new Date().toISOString()
  outcomesService.recordActionShown(action.id, timeShown)
  
  return {
    ...action,
    timeShown
  }
}

/**
 * Mark an action as completed (user clicked and completed the action)
 */
export function markActionCompleted(action: SuggestedAction, resolutionMethod: ResolutionMethod = 'manual-click'): SuggestedAction {
  const timeCompleted = new Date().toISOString()
  outcomesService.recordActionCompleted(action.id, resolutionMethod, timeCompleted)
  
  const completionMessage = getCompletionMessage(action)
  
  return {
    ...action,
    outcome: 'completed',
    timeCompleted,
    resolutionMethod,
    completionMessage
  }
}

/**
 * Mark an action as dismissed (user explicitly dismissed it)
 */
export function markActionDismissed(action: SuggestedAction): SuggestedAction {
  const timeDismissed = new Date().toISOString()
  outcomesService.recordActionDismissed(action.id, timeDismissed)
  
  return {
    ...action,
    outcome: 'dismissed',
    timeCompleted: timeDismissed,
    resolutionMethod: 'manual-dismiss'
  }
}

/**
 * Mark an action as expired (no longer relevant)
 */
export function markActionExpired(action: SuggestedAction): SuggestedAction {
  const timeExpired = new Date().toISOString()
  outcomesService.recordActionExpired(action.id, timeExpired)
  
  return {
    ...action,
    outcome: 'expired',
    timeCompleted: timeExpired,
    resolutionMethod: 'expired'
  }
}

/**
 * Get a completion message for an action
 */
function getCompletionMessage(action: SuggestedAction): string {
  switch (action.actionType) {
    case 'send-message':
      return 'Message sent'
    case 'schedule-appointment':
      return 'Appointment scheduled'
    case 'request-payment':
      return 'Payment requested'
    case 'confirm-appointment':
      return 'Appointment confirmed'
    case 'view-customer':
      return 'Viewed customer'
    case 'view-calendar':
      return 'Viewed calendar'
    case 'view-payments':
      return 'Viewed payments'
    default:
      return 'Completed'
  }
}
