import { Insight } from '../../insights/types'
import { SuggestedAction, ActionGenerator, ActionType } from '../types'

export const paymentActionGenerator: ActionGenerator = {
  canGenerate: (insight: Insight) => {
    // Only generate for payment insights with high confidence
    if (insight.type !== 'payment') return false
    if (insight.confidence && insight.confidence < 80) return false
    if (insight.priority === 'low') return false
    return true
  },

  generate: (insight: Insight): SuggestedAction | null => {
    const daysSinceRequest = insight.metadata?.daysSinceRequest || 0

    // Outstanding payment - suggest sending payment reminder
    if (insight.customerId && daysSinceRequest >= 3) {
      let suggestedMessage = ''
      if (daysSinceRequest >= 14) {
        suggestedMessage = 'Hi, just following up on the payment request from 2 weeks ago. Is there anything I can help with?'
      } else if (daysSinceRequest >= 7) {
        suggestedMessage = 'Hi, checking in on the payment request from last week. Let me know if you have any questions.'
      } else {
        suggestedMessage = 'Hi, following up on the recent payment request. Please let me know when you can take care of it.'
      }

      return {
        id: `action-payment-reminder-${insight.id}`,
        title: 'Send payment reminder',
        reason: insight.reason || `Payment outstanding for ${daysSinceRequest} days`,
        recommendedAction: 'Send a follow-up message about the outstanding payment',
        suggestedMessage,
        confidence: insight.confidence || 85,
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
