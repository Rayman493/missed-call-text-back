import { Insight } from '../insights/types'
import { ActionOutcome, ResolutionMethod } from '../outcomes/types'

export type ActionType = 'send-message' | 'schedule-appointment' | 'request-payment' | 'confirm-appointment' | 'view-customer' | 'view-calendar' | 'view-payments'

export interface SuggestedAction {
  id: string
  title: string
  reason: string
  recommendedAction: string
  suggestedMessage?: string
  confidence: number
  destinationLink: string
  actionType: ActionType
  customerId?: string
  sourceInsightId: string
  createdAt: string
  outcome?: ActionOutcome
  timeShown?: string
  timeCompleted?: string
  resolutionMethod?: ResolutionMethod
  completionMessage?: string
}

export interface ActionGenerator {
  canGenerate: (insight: Insight) => boolean
  generate: (insight: Insight) => SuggestedAction | null
}

export interface SuggestedActionContext {
  businessId: string
  customerId?: string
}
