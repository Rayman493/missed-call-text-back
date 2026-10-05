/**
 * Shared subscription purchase action.
 *
 * Android → native Google Play Billing sheet (server-verified entitlement).
 * Web/iOS → existing Stripe Checkout (caller continues its current path).
 *
 * Usage: call `maybeStartGooglePlaySubscription` at the top of every
 * subscription-checkout handler. If it returns true, the Android flow was
 * handled and the caller must return early.
 */

import { isNativeAndroid, purchaseSubscription, reconcilePlayPurchases } from './google-play-billing'
import { supabase } from '@/lib/supabase/browser'

export interface NativePurchaseCallbacks {
  userId?: string | null
  /** Re-verify Play-held purchases before launching the sheet (retry paths). */
  reconcileFirst?: boolean
  /** Server confirmed an entitlement — caller should refresh business state / navigate on. */
  onEntitled?: () => void | Promise<void>
  onCanceled?: () => void
  onPending?: () => void
  onError?: (message: string) => void
}

/** Upper bound for the whole native purchase + server verification handoff. */
export const PLAY_PURCHASE_TIMEOUT_MS = 120_000

const PURCHASE_TIMEOUT = Symbol('purchase-timeout')

const PURCHASE_TIMEOUT_MESSAGE =
  'Purchase is taking longer than expected. If you already completed it in Google Play, it will activate automatically — tap "Continue to Free Trial" to check.'

/**
 * Last-mile entitlement grace. Google's subscriptionsv2 record can lag the
 * local PURCHASED result (PENDING → ACTIVE flips seconds after the first
 * verification), and the manual Retry path reconciles the same held
 * purchase instantly — which proved entitlement routinely lands between the
 * client's last poll and the user's Retry tap. Before reporting a
 * recoverable non-entitled result, re-run the authoritative reconcile
 * (Play cache → server verification → business entitlement) a bounded
 * number of times. Never launches a second purchase; reconcile is
 * idempotent and only re-verifies what Play already holds.
 */
const POST_PURCHASE_RECONCILE_ATTEMPTS = 3
const POST_PURCHASE_RECONCILE_INTERVAL_MS = 3000

async function settleRecoverableEntitlement(): Promise<boolean> {
  for (let i = 0; i < POST_PURCHASE_RECONCILE_ATTEMPTS; i++) {
    if (i > 0) {
      await new Promise(r => setTimeout(r, POST_PURCHASE_RECONCILE_INTERVAL_MS))
    }
    try {
      const { entitled } = await reconcilePlayPurchases()
      if (entitled) return true
    } catch (e) {
      console.warn('[SubscriptionPurchase] Post-purchase reconcile failed:', e)
    }
  }
  return false
}

// A failed verification is retry-worthy only when it can resolve itself once
// the auth/settlement state settles: a 404 (Business not found from a stale
// session during the signup→purchase handoff), a 5xx, or a transport failure
// with no HTTP response. Deliberate rejections — 400 invalid/unrecognized
// token, 401 unauthenticated, product mismatch — never self-resolve and must
// surface immediately. Cancellation never reaches this classification.
const isTransientVerifyFailure = (result: {
  ok: boolean
  httpStatus?: number
  transportFailed?: boolean
  unauthorized?: boolean
}) =>
  !result.ok &&
  !result.unauthorized &&
  (result.transportFailed === true ||
    result.httpStatus === 404 ||
    (typeof result.httpStatus === 'number' && result.httpStatus >= 500))

/**
 * @returns true if running on native Android (purchase flow was attempted and
 *          handled); false on web/iOS — caller should continue Stripe Checkout.
 */
export async function maybeStartGooglePlaySubscription(cb: NativePurchaseCallbacks): Promise<boolean> {
  if (!isNativeAndroid()) return false

  // Retry paths: the Google account may already hold the purchase (e.g. a
  // previous attempt timed out after the sheet completed). Re-verify Play-held
  // purchases first — a confirmed entitlement means no new sheet is needed.
  if (cb.reconcileFirst) {
    try {
      const { entitled } = await reconcilePlayPurchases()
      if (entitled) {
        await cb.onEntitled?.()
        return true
      }
    } catch (e) {
      console.warn('[SubscriptionPurchase] Pre-purchase reconcile failed:', e)
    }
  }

  let userId = cb.userId
  if (!userId) {
    // Local session read only — a network getUser() here can stall forever
    // and leave the caller's loading state stuck.
    const { data: { session } } = await supabase.auth.getSession()
    userId = session?.user?.id ?? null
  }
  if (!userId) {
    cb.onError?.('You must be signed in to subscribe.')
    return true
  }

  try {
    const purchasePromise = purchaseSubscription(userId)
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeoutPromise = new Promise<typeof PURCHASE_TIMEOUT>((resolve) => {
      timeoutId = setTimeout(() => resolve(PURCHASE_TIMEOUT), PLAY_PURCHASE_TIMEOUT_MS)
    })
    const raced = await Promise.race([
      purchasePromise.then(result => ({ result })),
      timeoutPromise,
    ])
    clearTimeout(timeoutId)

    if (raced === PURCHASE_TIMEOUT) {
      // The timeout does not cancel the in-flight native purchase. If the
      // original operation completes later with a real entitlement, deliver
      // it — never discard a legitimate purchase result.
      purchasePromise.then(late => {
        if (late?.ok && late?.entitled) void cb.onEntitled?.()
      }).catch(() => {})
      cb.onError?.(PURCHASE_TIMEOUT_MESSAGE)
      return true
    }

    const result = raced.result
    if (result.canceled) {
      cb.onCanceled?.()
      return true
    }
    if (!result.ok) {
      // A recoverable verification failure — e.g. the held-purchase verify
      // raced the post-signup session flip and got a 404, or hit a 5xx —
      // gets the same bounded authoritative reconcile as pending results
      // before the Retry UI is shown. Terminal failures skip the loop.
      if (isTransientVerifyFailure(result) && await settleRecoverableEntitlement()) {
        await cb.onEntitled?.()
        return true
      }
      cb.onError?.(result.error || 'Purchase failed. Please try again.')
      return true
    }
    if (result.entitled) {
      await cb.onEntitled?.()
      return true
    }
    // Recoverable non-entitled result (pending, or a verified-but-not-yet-
    // active snapshot such as UNSPECIFIED): the entitlement may settle
    // seconds after the last poll. Run the same reconcile the Retry button
    // performs before showing Retry — if the server now reports the
    // entitlement, continue automatically instead of dead-ending.
    if (await settleRecoverableEntitlement()) {
      await cb.onEntitled?.()
      return true
    }
    cb.onPending?.()
    return true
  } catch (error: any) {
    console.error('[SubscriptionPurchase] Native purchase failed:', error)
    const message = error?.message || 'Could not start Google Play purchase.'
    // A BillingClient "already connecting" rejection is internal lifecycle
    // coordination, not a user-facing failure — the purchase may still be
    // held on the Play account. Route to the pending-recovery path (Retry
    // Checkout reconciles) instead of surfacing the raw BillingClient
    // message. Covers builds without the single-flight plugin fix.
    if (/in the process of connecting|Billing connection start conflict/i.test(message)) {
      cb.onPending?.()
      return true
    }
    cb.onError?.(message)
    return true
  }
}
