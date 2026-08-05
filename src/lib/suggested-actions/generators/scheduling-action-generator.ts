import { Insight } from '../../insights/types'
import { SuggestedAction, ActionGenerator, ActionType } from '../types'

export const schedulingActionGenerator: ActionGenerator = {
  canGenerate: (insight: Insight) => {
    if (insight.type !== 'scheduling') return false
    if (insight.confidence && insight.confidence < 75) return false
    if (insight.priority === 'low') return false
    return true
  },

  generate: (insight: Insight): SuggestedAction | null => {
    // Jobs today - suggest confirming appointment
    if (insight.id === 'jobs-today' && insight.customerId) {
      return {
        id: `action-confirm-appointment-${insight.id}`,
        title: 'Confirm appointment',
        reason: insight.reason || 'You have scheduled work today',
        recommendedAction: 'Send a message to confirm the appointment',
        suggestedMessage: 'Hi, just confirming our appointment for today. See you soon!',
        confidence: insight.confidence || 90,
        destinationLink: `/dashboard/leads/${insight.customerId}`,
        actionType: 'confirm-appointment',
        customerId: insight.customerId,
        sourceInsightId: insight.id,
        createdAt: new Date().toISOString()
      }
    }

    // No appointment scheduled - suggest scheduling
    if (insight.id === 'no-appointment-scheduled' && insight.customerId) {
      return {
        id: `action-schedule-appointment-${insight.id}`,
        title: 'Schedule appointment',
        reason: insight.reason || 'No future appointments found for this customer',
        recommendedAction: 'Schedule a follow-up appointment',
        suggestedMessage: 'Hi, would you like to schedule a time for me to come by?',
        confidence: insight.confidence || 75,
        destinationLink: insight.primaryAction?.href || `/dashboard/leads/${insight.customerId}#jobs`,
        actionType: 'schedule-appointment',
        customerId: insight.customerId,
        sourceInsightId: insight.id,
        createdAt: new Date().toISOString()
      }
    }

    return null
  }
}
