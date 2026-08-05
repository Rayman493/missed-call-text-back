import { ActionType } from '../suggested-actions/types'

export type ActionOutcome = 'completed' | 'dismissed' | 'ignored' | 'expired' | 'automatically-resolved'

export type ResolutionMethod = 'manual-click' | 'manual-dismiss' | 'auto-resolved' | 'expired'

export interface ActionOutcomeRecord {
  id: string
  suggestedActionId: string
  sourceInsightId: string
  actionType: ActionType
  customerId?: string
  businessId: string
  outcome: ActionOutcome
  resolutionMethod?: ResolutionMethod
  timeShown: string
  timeCompleted?: string
  timeDismissed?: string
  timeExpired?: string
  metadata?: Record<string, any>
}

export interface SuggestedActionWithOutcome {
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
  completionMessage?: string
}

export interface OutcomeTracker {
  recordActionShown(actionId: string, timeShown: string): void
  recordActionCompleted(actionId: string, resolutionMethod: ResolutionMethod, timeCompleted: string): void
  recordActionDismissed(actionId: string, timeDismissed: string): void
  recordActionExpired(actionId: string, timeExpired: string): void
  getActionOutcome(actionId: string): ActionOutcomeRecord | null
  getCompletedActions(): ActionOutcomeRecord[]
}
