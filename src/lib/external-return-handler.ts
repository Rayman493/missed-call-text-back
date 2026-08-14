/**
 * Centralized External Return Handler
 *
 * Handles return flows from external browsers (Stripe Connect, Stripe Checkout, Stripe Portal, OAuth, etc.)
 * ensuring authoritative server-side status reconciliation rather than trusting client callback parameters.
 *
 * Principles:
 * - BROWSER CALLBACK != AUTHORITATIVE SUCCESS
 * - Server-side status is source of truth
 * - Idempotent and deduplicated
 * - Works on Android, iOS, and web
 * - Recognized returns skip generic deep-link navigation
 * - Clean internal route navigation without transient parameters
 */

import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

export type PendingStripeOperation = 'connect_onboarding' | 'checkout' | 'portal' | null

const PENDING_STRIPE_OPERATION_KEY = 'pending_stripe_operation'
const PENDING_STRIPE_OPERATION_TIMESTAMP_KEY = 'pending_stripe_operation_timestamp'
const PENDING_STRIPE_OPERATION_BUSINESS_ID_KEY = 'pending_stripe_operation_business_id'
const STRIPE_RECONCILIATION_IN_FLIGHT_KEY = 'stripe_reconciliation_in_flight'
const STRIPE_RECONCILIATION_LAST_TIME_KEY = 'stripe_reconciliation_last_time'

const RECONCILIATION_DEDUP_WINDOW_MS = 5000 // Don't reconcile more than once every 5 seconds
const OPERATION_EXPIRY_MS = 300000 // Pending operations expire after 5 minutes

/**
 * Centralized External Return Registry
 *
 * Maps external return URLs to their handlers, internal destinations, and reconciliation logic.
 * All recognized returns skip generic deep-link navigation and trigger authoritative reconciliation.
 */
interface ExternalReturnFlow {
  name: string
  matcher: (url: URL) => boolean
  internalDestination: string
  reconcile: (businessId?: string) => Promise<void>
}

const EXTERNAL_RETURN_FLOWS: ExternalReturnFlow[] = [
  {
    name: 'STRIPE_CONNECT',
    matcher: (url) => url.searchParams.get('stripe_onboarding') === 'complete',
    internalDestination: '/dashboard/settings',
    reconcile: async (businessId) => {
      const result = await reconcileStripeStatus(businessId)
      console.log('[STRIPE CONNECT RETURN] Reconciliation result:', result)
    }
  },
  {
    name: 'STRIPE_CHECKOUT',
    matcher: (url) => url.searchParams.get('session_id')?.startsWith('cs_') || url.searchParams.get('checkout') === 'success',
    internalDestination: '/billing/success',
    reconcile: async (businessId) => {
      // Stripe Checkout reconciliation is handled by the billing/success page itself
      // via /api/billing/checkout-status polling
      // We just need to navigate to the clean route without transient params
      console.log('[STRIPE CHECKOUT RETURN] Navigating to billing/success for status polling')
    }
  },
  {
    name: 'STRIPE_PORTAL',
    matcher: (url) => url.searchParams.get('billing') === 'returned',
    internalDestination: '/dashboard/settings',
    reconcile: async (businessId) => {
      // Stripe Portal reconciliation - refresh billing status from backend
      const result = await fetch('/api/billing/checkout-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_billing: true })
      })
      console.log('[STRIPE PORTAL RETURN] Billing status refresh result:', result.ok)
    }
  }
]

/**
 * Check if running in Capacitor native environment
 */
function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Set a pending Stripe operation that needs reconciliation on return/resume
 */
export async function setPendingStripeOperation(operation: PendingStripeOperation, businessId?: string): Promise<void> {
  if (!operation) {
    await Preferences.remove({ key: PENDING_STRIPE_OPERATION_KEY })
    await Preferences.remove({ key: PENDING_STRIPE_OPERATION_TIMESTAMP_KEY })
    await Preferences.remove({ key: PENDING_STRIPE_OPERATION_BUSINESS_ID_KEY })
    return
  }

  await Preferences.set({ key: PENDING_STRIPE_OPERATION_KEY, value: operation })
  await Preferences.set({ key: PENDING_STRIPE_OPERATION_TIMESTAMP_KEY, value: Date.now().toString() })
  if (businessId) {
    await Preferences.set({ key: PENDING_STRIPE_OPERATION_BUSINESS_ID_KEY, value: businessId })
  }
  console.log('[EXTERNAL RETURN] Pending operation set:', operation, 'businessId:', businessId)
}

/**
 * Get the current pending Stripe operation (expires after 5 minutes)
 */
export async function getPendingStripeOperation(): Promise<{ operation: PendingStripeOperation; businessId?: string }> {
  try {
    const timestampStr = await Preferences.get({ key: PENDING_STRIPE_OPERATION_TIMESTAMP_KEY })
    if (!timestampStr.value) return { operation: null }

    const timestamp = parseInt(timestampStr.value, 10)
    const now = Date.now()

    if (now - timestamp > OPERATION_EXPIRY_MS) {
      console.log('[EXTERNAL RETURN] Pending operation expired, clearing')
      await setPendingStripeOperation(null)
      return { operation: null }
    }

    const operation = await Preferences.get({ key: PENDING_STRIPE_OPERATION_KEY })
    const businessId = await Preferences.get({ key: PENDING_STRIPE_OPERATION_BUSINESS_ID_KEY })
    return {
      operation: operation.value as PendingStripeOperation,
      businessId: businessId.value || undefined
    }
  } catch (error) {
    console.error('[EXTERNAL RETURN] Error getting pending operation:', error)
    return { operation: null }
  }
}

/**
 * Check if a reconciliation is already in progress or was recently completed
 */
async function shouldSkipReconciliation(): Promise<boolean> {
  try {
    const inFlightStr = await Preferences.get({ key: STRIPE_RECONCILIATION_IN_FLIGHT_KEY })
    if (inFlightStr.value === 'true') {
      console.log('[EXTERNAL RETURN] Reconciliation already in flight, skipping')
      return true
    }

    const lastTimeStr = await Preferences.get({ key: STRIPE_RECONCILIATION_LAST_TIME_KEY })
    if (lastTimeStr.value) {
      const lastTime = parseInt(lastTimeStr.value, 10)
      const now = Date.now()
      if (now - lastTime < RECONCILIATION_DEDUP_WINDOW_MS) {
        console.log('[EXTERNAL RETURN] Reconciliation too recent, skipping')
        return true
      }
    }

    return false
  } catch (error) {
    console.error('[EXTERNAL RETURN] Error checking reconciliation state:', error)
    return false
  }
}

/**
 * Mark a reconciliation as in progress
 */
async function setReconciliationInFlight(inFlight: boolean): Promise<void> {
  await Preferences.set({ key: STRIPE_RECONCILIATION_IN_FLIGHT_KEY, value: inFlight ? 'true' : 'false' })
  if (inFlight) {
    await Preferences.set({ key: STRIPE_RECONCILIATION_LAST_TIME_KEY, value: Date.now().toString() })
  }
}

/**
 * Trigger authoritative Stripe status reconciliation from the server
 * This should be called when:
 * - User returns from Stripe Connect onboarding (via URL callback)
 * - User returns from Stripe Checkout (via URL callback)
 * - App resumes with a pending Stripe operation
 */
export async function reconcileStripeStatus(businessId?: string): Promise<{ success: boolean; status?: string; error?: string }> {
  // Native apps only (web doesn't need this - it can check status directly)
  if (!isNative()) {
    console.log('[EXTERNAL RETURN] Not native, skipping reconciliation')
    return { success: false, error: 'Not native' }
  }

  // Deduplication check
  if (await shouldSkipReconciliation()) {
    return { success: false, error: 'Dedup' }
  }

  // If no business ID provided, try to get it from pending operation context
  if (!businessId) {
    const pending = await getPendingStripeOperation()
    if (!pending.operation) {
      console.log('[EXTERNAL RETURN] No business ID and no pending operation')
      return { success: false, error: 'No context' }
    }
    businessId = pending.businessId
    if (!businessId) {
      console.log('[EXTERNAL RETURN] Pending operation exists but business ID not stored')
      return { success: false, error: 'Missing business ID' }
    }
  }

  try {
    await setReconciliationInFlight(true)
    console.log('[EXTERNAL RETURN] Reconciling Stripe status for business:', businessId)

    const response = await fetch('/api/stripe/connect/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ business_id: businessId })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[EXTERNAL RETURN] Reconciliation failed:', response.status, errorText)
      return { success: false, error: errorText }
    }

    const data = await response.json()
    console.log('[EXTERNAL RETURN] Reconciliation succeeded:', {
      canonicalStatus: data.canonicalStatus,
      charges_enabled: data.charges_enabled,
      details_submitted: data.details_submitted
    })

    // Clear pending operation after successful reconciliation
    await setPendingStripeOperation(null)

    return { success: true, status: data.canonicalStatus }
  } catch (error) {
    console.error('[EXTERNAL RETURN] Reconciliation error:', error)
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
  } finally {
    await setReconciliationInFlight(false)
  }
}

/**
 * Handle external return from browser (called by appUrlOpen listener)
 * This should be called from the Capacitor init.ts appUrlOpen handler
 *
 * @returns true if the URL was handled and navigation should be skipped, false otherwise
 */
export async function handleExternalReturn(url: string): Promise<boolean> {
  console.log('[NAV_SOURCE] source=EXTERNAL_RETURN_HANDLER_ENTER url=' + url)

  const urlObj = new URL(url)

  // Check against centralized external return registry for HTTPS URLs
  if (urlObj.protocol === 'https:') {
    for (const flow of EXTERNAL_RETURN_FLOWS) {
      if (flow.matcher(urlObj)) {
        console.log('[EXTERNAL RETURN] Recognized flow:', flow.name)

        // Trigger authoritative reconciliation
        const pending = await getPendingStripeOperation()
        await flow.reconcile(pending.businessId)

        // Navigate to clean internal route without transient parameters
        console.log('[EXTERNAL RETURN] Navigating to clean route:', flow.internalDestination)
        console.log('[NAV_SOURCE] source=EXTERNAL_RETURN_HANDLER_NAVIGATE destination=' + flow.internalDestination)
        window.location.href = flow.internalDestination

        // Clear pending operation after successful handling
        if (pending.operation) {
          await setPendingStripeOperation(null)
        }

        console.log('[NAV_SOURCE] source=EXTERNAL_RETURN_HANDLER_EXIT handled=true')
        return true // Signal to skip generic deep-link navigation
      }
    }
  }

  console.log('[EXTERNAL RETURN] Not a recognized external return URL, skipping')
  console.log('[NAV_SOURCE] source=EXTERNAL_RETURN_HANDLER_EXIT handled=false')
  return false
}

/**
 * Handle app resume (called by appStateChange listener)
 * This should be called from the Capacitor init.ts appStateChange listener
 */
export async function handleAppResume(): Promise<void> {
  console.log('[EXTERNAL RETURN] App resumed, checking for pending operations')

  const pending = await getPendingStripeOperation()
  if (!pending.operation) {
    console.log('[EXTERNAL RETURN] No pending Stripe operation')
    return
  }

  console.log('[EXTERNAL RETURN] Pending operation found:', pending.operation, 'businessId:', pending.businessId)

  // Trigger reconciliation using the business ID from pending operation
  const result = await reconcileStripeStatus(pending.businessId)
  console.log('[EXTERNAL RETURN] App resume reconciliation result:', result)
}
