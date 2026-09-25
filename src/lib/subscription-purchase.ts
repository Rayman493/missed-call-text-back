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

import { isNativeAndroid, purchaseSubscription } from './google-play-billing'
import { supabase } from '@/lib/supabase/browser'

export interface NativePurchaseCallbacks {
  userId?: string | null
  /** Server confirmed an entitlement — caller should refresh business state / navigate on. */
  onEntitled?: () => void | Promise<void>
  onCanceled?: () => void
  onPending?: () => void
  onError?: (message: string) => void
}

/**
 * @returns true if running on native Android (purchase flow was attempted and
 *          handled); false on web/iOS — caller should continue Stripe Checkout.
 */
export async function maybeStartGooglePlaySubscription(cb: NativePurchaseCallbacks): Promise<boolean> {
  if (!isNativeAndroid()) return false

  let userId = cb.userId
  if (!userId) {
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  }
  if (!userId) {
    cb.onError?.('You must be signed in to subscribe.')
    return true
  }

  try {
    const result = await purchaseSubscription(userId)

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
