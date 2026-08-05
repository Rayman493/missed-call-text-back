import { ActionOutcomeRecord, OutcomeTracker, ActionOutcome, ResolutionMethod } from './types'
import { storeOutcome } from './outcome-storage'

class OutcomesService implements OutcomeTracker {
  private outcomes: Map<string, ActionOutcomeRecord> = new Map()

  recordActionShown(actionId: string, timeShown: string): void {
    // Only record if not already tracked
    if (!this.outcomes.has(actionId)) {
      this.outcomes.set(actionId, {
        id: `outcome-${actionId}-${Date.now()}`,
        suggestedActionId: actionId,
        sourceInsightId: '',
        actionType: 'send-message',
        businessId: '',
        outcome: 'ignored' as ActionOutcome,
        timeShown
      })
    }
  }

  recordActionCompleted(actionId: string, resolutionMethod: ResolutionMethod, timeCompleted: string): void {
    const existing = this.outcomes.get(actionId)
    if (existing) {
      const completed = {
        ...existing,
        outcome: 'completed' as ActionOutcome,
        resolutionMethod,
        timeCompleted
      }
      this.outcomes.set(actionId, completed)
      // Persist to storage for future learning hooks
      storeOutcome(completed)
    }
  }

  recordActionDismissed(actionId: string, timeDismissed: string): void {
    const existing = this.outcomes.get(actionId)
    if (existing) {
      const dismissed = {
        ...existing,
        outcome: 'dismissed' as ActionOutcome,
        resolutionMethod: 'manual-dismiss' as ResolutionMethod,
        timeDismissed
      }
      this.outcomes.set(actionId, dismissed)
      // Persist to storage for future learning hooks
      storeOutcome(dismissed)
    }
  }

  recordActionExpired(actionId: string, timeExpired: string): void {
    const existing = this.outcomes.get(actionId)
    if (existing) {
      const expired = {
        ...existing,
        outcome: 'expired' as ActionOutcome,
        resolutionMethod: 'expired' as ResolutionMethod,
        timeExpired
      }
      this.outcomes.set(actionId, expired)
      // Persist to storage for future learning hooks
      storeOutcome(expired)
    }
  }

  getActionOutcome(actionId: string): ActionOutcomeRecord | null {
    return this.outcomes.get(actionId) || null
  }

  getCompletedActions(): ActionOutcomeRecord[] {
    return Array.from(this.outcomes.values()).filter(o => o.outcome === 'completed')
  }

  clear(): void {
    this.outcomes.clear()
  }
}

// Singleton instance
export const outcomesService = new OutcomesService()
