import { Insight } from '../../insights/types'
import { SuggestedAction, ActionGenerator, ActionType } from '../types'

export const communicationActionGenerator: ActionGenerator = {
  canGenerate: (insight: Insight) => {
    if (insight.type !== 'communication') return false
    if (insight.confidence && insight.confidence < 75) return false
    if (insight.priority === 'low') return false
    return true
  },

  generate: (insight: Insight): SuggestedAction | null => {
    const daysSinceLastMessage = insight.metadata?.daysSinceLastMessage || 0

    // Customer waiting for reply - suggest sending follow-up
    if (insight.id === 'waiting-for-replies') {
      return {
        id: `action-reply-waiting-${insight.id}`,
        title: 'Reply to waiting customers',
        reason: insight.reason || 'Customers have sent inbound messages without receiving replies',
        recommendedAction: 'Review and respond to waiting customers',
        confidence: insight.confidence || 85,
        destinationLink: insight.primaryAction?.href || '/dashboard/leads',
        actionType: 'view-customer',
        sourceInsightId: insight.id,
        createdAt: new Date().toISOString()
      }
    }

    // No recent reply - suggest follow-up
    if (insight.id === 'no-recent-reply' && insight.customerId && daysSinceLastMessage >= 3) {
      return {
        id: `action-follow-up-message-${insight.id}`,
        title: 'Send follow-up message',
        reason: insight.reason || `Last outbound message was sent ${daysSinceLastMessage} days ago with no reply`,
        recommendedAction: 'Send a follow-up message to re-engage the customer',
        suggestedMessage: 'Hi, just wanted to check in and see if you have any questions.',
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
