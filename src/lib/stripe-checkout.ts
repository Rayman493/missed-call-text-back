/**
 * Stripe Checkout Opening Helper
 *
 * Opens Stripe Checkout using the appropriate mechanism for the current platform.
 *
 * Native iOS: Uses ASWebAuthenticationSession for automatic return-to-app behavior.
 * Desktop/web/Android: Uses window.location.href for normal browser navigation.
 *
 * IMPORTANT: Native checkout does NOT indicate payment success. Payment/subscription
 * state must be verified through server-side checkout-status or Stripe webhook.
 */

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import ReplyflowWebCheckoutPlugin from '@/lib/web-checkout'

/**
 * Check if current platform is native iOS
 */
export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function openStripeCheckout(url: string): Promise<void> {
  if (isNativeIOS()) {
    console.log('[StripeCheckout] Opening Stripe in native web session (iOS)')
    try {
      const result = await ReplyflowWebCheckoutPlugin.openCheckoutSession({
        url,
        callbackHost: 'www.replyflowhq.com',
        callbackPath: '/billing/success'
      })
      console.log('[StripeCheckout] Native checkout session completed:', result)

      // Handle the callback result
      if (result.callbackMatched && result.callbackUrl) {
        console.log('[StripeCheckout] Callback received, extracting session_id')
        const callbackUrl = new URL(result.callbackUrl)
        const sessionId = callbackUrl.searchParams.get('session_id')

        if (sessionId) {
          console.log('[StripeCheckout] Navigating to billing/success with session_id')
          // Navigate to billing/success with native_callback marker
          window.location.href = `/billing/success?session_id=${sessionId}&native_callback=1&return_to_app=1`
          return
        } else {
          console.error('[StripeCheckout] No session_id in callback URL')
        }
      }

      if (result.canceled) {
        console.log('[StripeCheckout] User canceled checkout')
        // Return to calling page - user can retry
        return
      }

      if (!result.callbackMatched) {
        console.error('[StripeCheckout] Callback did not match')
        throw new Error('Callback did not match expected URL')
      }
    } catch (error) {
      console.error('[StripeCheckout] Native checkout session failed:', error)
      console.log('[StripeCheckout] Falling back to in-app browser')
      // Fallback to Browser.open() if native session fails
      try {
        await Browser.open({ url })
        console.log('[StripeCheckout] Browser.open() fallback succeeded')
      } catch (browserError) {
        console.error('[StripeCheckout] Browser.open() fallback failed:', browserError)
        // Final fallback to window.location.href
        console.log('[StripeCheckout] Falling back to window.location.href')
        window.location.href = url
      }
    }
  } else {
    console.log('[StripeCheckout] Opening Stripe in browser (desktop/web/Android)')
    window.location.href = url
  }
}