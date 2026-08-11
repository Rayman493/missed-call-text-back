/**
 * Stripe Checkout Opening Helper
 *
 * Opens Stripe Checkout using the appropriate mechanism for the current platform.
 *
 * Native iOS: Uses Browser.open() to open Stripe in an in-app browser (SFSafariViewController).
 * Desktop/web/Android: Uses window.location.href for normal browser navigation.
 *
 * IMPORTANT: Browser.open() does NOT indicate payment success. It only presents the checkout.
 * Payment/subscription state must be verified through server-side checkout-status or Stripe webhook.
 */

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'

/**
 * Check if current platform is native iOS
 */
export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function openStripeCheckout(url: string): Promise<void> {
  if (isNativeIOS()) {
    console.log('[StripeCheckout] Opening Stripe in in-app browser (native iOS)')
    try {
      await Browser.open({ url })
      console.log('[StripeCheckout] Browser.open() succeeded')
    } catch (error) {
      console.error('[StripeCheckout] Failed to open in-app browser:', error)
      // Fallback to window.location.href if Browser.open fails
      console.log('[StripeCheckout] Falling back to window.location.href')
      window.location.href = url
    }
  } else {
    console.log('[StripeCheckout] Opening Stripe in browser (desktop/web/Android)')
    window.location.href = url
  }
}