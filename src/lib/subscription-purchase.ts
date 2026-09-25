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
    if (result.pending) {
      cb.onPending?.()
      return true
    }
    if (!result.ok) {
      cb.onError?.(result.error || 'Purchase failed. Please try again.')
      return true
    }
    if (result.entitled) {
      await cb.onEntitled?.()
      return true
    }
    // Verified but no entitlement (e.g. pending payment state from Google).
    cb.onPending?.()
    return true
  } catch (error: any) {
    console.error('[SubscriptionPurchase] Native purchase failed:', error)
    cb.onError?.(error?.message || 'Could not start Google Play purchase.')
    return true
  }
}
