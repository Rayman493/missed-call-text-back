import { Insight } from '../insights/types'
import { SuggestedAction } from './types'
import { paymentActionGenerator } from './generators/payment-action-generator'
import { followUpActionGenerator } from './generators/follow-up-action-generator'
import { schedulingActionGenerator } from './generators/scheduling-action-generator'
import { communicationActionGenerator } from './generators/communication-action-generator'

const actionGenerators = [
  paymentActionGenerator,
  followUpActionGenerator,
  schedulingActionGenerator,
  communicationActionGenerator
]

/**
 * Convert insights to suggested actions
 * Only high-confidence, high-priority insights generate actions
 */
export function convertInsightsToActions(insights: Insight[]): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  for (const insight of insights) {
    for (const generator of actionGenerators) {
      if (generator.canGenerate(insight)) {
        const action = generator.generate(insight)
        if (action) {
          actions.push(action)
        }
      }
    }
  }

  // Sort by confidence (highest first), then by creation date (newest first)
  actions.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return b.confidence - a.confidence
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return actions
}

/**
 * Generate suggested actions for dashboard (top 3)
 */
export function generateDashboardSuggestedActions(insights: Insight[]): SuggestedAction[] {
  const actions = convertInsightsToActions(insights)
  return actions.slice(0, 3)
}

/**
 * Generate suggested actions for customer detail (all relevant)
 */
export function generateCustomerSuggestedActions(insights: Insight[]): SuggestedAction[] {
  return convertInsightsToActions(insights)
}
