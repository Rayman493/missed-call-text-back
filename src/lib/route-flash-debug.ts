/**
 * Development-only route flash debug logger.
 *
 * Helps identify which dashboard guard is causing the onboarding/setup page
 * to flash during navigation before the correct state resolves.
 *
 * Logs are only emitted in development (process.env.NODE_ENV === 'development')
 * and are deduped by a stable signature so rapid re-renders don't spam the console.
 */

const DEBUG = process.env.NODE_ENV === 'development'

// Keep a small ring of recent log signatures to suppress duplicate lines.
const recentSignatures = new Set<string>()
const MAX_RECENT = 20
let pruneIndex = 0
const signatureOrder: string[] = []

function recordSignature(sig: string) {
  if (recentSignatures.has(sig)) return false
  recentSignatures.add(sig)
  signatureOrder.push(sig)
  if (signatureOrder.length > MAX_RECENT) {
    const oldest = signatureOrder.shift()
    if (oldest) recentSignatures.delete(oldest)
  }
  return true
}

export interface RouteFlashDebugData {
  /** Source component / function that is logging */
  source: string
  /** The route being requested */
  pathname?: string | null
  /** Previous pathname if tracked */
  previousPathname?: string | null
  /** Auth loading state */
  authLoading?: boolean
  /** User id present / absent */
  userId?: string | null | undefined
  /** Business id present / absent */
  businessId?: string | null | undefined
  /** Business onboarding status */
  onboardingStatus?: string | null | undefined
  /** Business subscription status */
  subscriptionStatus?: string | null | undefined
  /** first_test_call_completed_at */
  firstTestCallCompletedAt?: string | null | undefined
  /** missedCallCount if available */
  missedCallCount?: number | null | undefined
  /** Derived setup/onboarding state */
  derivedSetupState?: string | null | undefined
  /** Which branch rendered: loading | onboarding | setup | billing | dashboard-content */
  renderBranch?: string
  /** Reason for the branch decision */
  reason?: string
  /** Additional context */
  [key: string]: any
}

export function logRouteFlashDebug(data: RouteFlashDebugData) {
  if (!DEBUG) return

  // Build a stable signature from the most important fields so that identical
  // state transitions are only logged once.
  const sig = JSON.stringify({
    source: data.source,
    pathname: data.pathname,
    previousPathname: data.previousPathname,
    renderBranch: data.renderBranch,
    derivedSetupState: data.derivedSetupState,
    authLoading: data.authLoading,
    userId: data.userId,
    businessId: data.businessId,
    onboardingStatus: data.onboardingStatus,
    subscriptionStatus: data.subscriptionStatus,
    reason: data.reason,
  })

  if (!recordSignature(sig)) return

  const payload = {
    timestamp: new Date().toISOString(),
    ...data,
  }

  console.log('[ROUTE FLASH DEBUG]', payload)
}
