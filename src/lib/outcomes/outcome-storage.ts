import { ActionOutcomeRecord } from './types'

const OUTCOME_STORAGE_KEY = 'replyflow_action_outcomes'
const MAX_STORED_OUTCOMES = 1000

/**
 * Store an outcome record to localStorage for future learning hooks
 */
export function storeOutcome(outcome: ActionOutcomeRecord): void {
  if (typeof window === 'undefined') return

  try {
    const stored = getStoredOutcomes()
    stored.push(outcome)
    
    // Keep only the most recent outcomes to prevent storage bloat
    if (stored.length > MAX_STORED_OUTCOMES) {
      stored.splice(0, stored.length - MAX_STORED_OUTCOMES)
    }
    
    localStorage.setItem(OUTCOME_STORAGE_KEY, JSON.stringify(stored))
  } catch (error) {
    console.error('[Outcome Storage] Failed to store outcome:', error)
  }
}

/**
 * Get all stored outcome records
 */
export function getStoredOutcomes(): ActionOutcomeRecord[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(OUTCOME_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('[Outcome Storage] Failed to retrieve outcomes:', error)
    return []
  }
}

/**
 * Clear all stored outcomes (for testing or reset)
 */
export function clearStoredOutcomes(): void {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(OUTCOME_STORAGE_KEY)
  } catch (error) {
    console.error('[Outcome Storage] Failed to clear outcomes:', error)
  }
}

/**
 * Get completed actions for analytics (internal only)
 */
export function getCompletedActions(): ActionOutcomeRecord[] {
  return getStoredOutcomes().filter(o => o.outcome === 'completed')
}

/**
 * Get dismissed actions for analytics (internal only)
 */
export function getDismissedActions(): ActionOutcomeRecord[] {
  return getStoredOutcomes().filter(o => o.outcome === 'dismissed')
}

/**
 * Get action completion rate (internal only)
 */
export function getCompletionRate(): number {
  const all = getStoredOutcomes()
  if (all.length === 0) return 0
  const completed = all.filter(o => o.outcome === 'completed').length
  return Math.round((completed / all.length) * 100)
}
