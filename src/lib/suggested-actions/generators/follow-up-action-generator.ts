import { Insight } from '../../insights/types'
import { SuggestedAction, ActionGenerator, ActionType } from '../types'

export const followUpActionGenerator: ActionGenerator = {
  canGenerate: (insight: Insight) => {
    if (insight.type !== 'follow-up') return false
    if (insight.confidence && insight.confidence < 75) return false
    if (insight.priority === 'low') return false
    return true
  },

  generate: (insight: Insight): SuggestedAction | null => {
    const isOverdue = insight.metadata?.isOverdue

    if (isOverdue && insight.customerId) {
      return {
        id: `action-follow-up-overdue-${insight.id}`,
        title: 'Send follow-up message',
        reason: insight.reason || 'Follow-up was scheduled for a past date but not completed',
        recommendedAction: 'Send a message to check in with the customer',
        suggestedMessage: 'Hi, following up to see if you still need help with anything.',
        confidence: insight.confidence || 80,
        destinationLink: insight.primaryAction?.href || `/dashboard/leads/${insight.customerId}`,
        actionType: 'send-message',
        customerId: insight.customerId,
        sourceInsightId: insight.id,
        createdAt: new Date().toISOString()
      }
    }

    return null
  }
}
