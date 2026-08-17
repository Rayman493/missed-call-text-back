/**
 * Stripe Checkout Opening Helper
 *
 * Opens Stripe Checkout using the appropriate mechanism for the current platform.
 *
 * Native iOS: Uses ASWebAuthenticationSession for automatic return-to-app behavior.
 * Native Android: Uses native ReplyflowWebCheckoutPlugin with Chrome Custom Tabs for automatic return-to-app behavior.
 * Desktop/web: Uses window.location.href for normal browser navigation.
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

/**
 * Check if current platform is native Android
 */
export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function openStripeCheckout(url: string): Promise<void> {
  // Verify global receiver exists before opening Stripe
  const receiverType = typeof (window as any).__onStripeReturn
  console.log('[ACCOUNT_CREATION_BRIDGE] before Stripe launch receiver type=' + receiverType)

  if (typeof window !== 'undefined' && (window as any).__recordClickEvent) {
    (window as any).__recordClickEvent('browser_open_start', {
      platform: Capacitor.getPlatform()
    })
  }

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
  } else if (isNativeAndroid()) {
    console.log('[StripeCheckout] Opening Stripe in native plugin (Android)')
    try {
      const result = await ReplyflowWebCheckoutPlugin.openCheckoutSession({
        url,
        callbackHost: 'www.replyflowhq.com',
        callbackPath: '/billing/success'
      })
      console.log('[StripeCheckout] Native checkout session completed:', result)

      // Handle the callback result (same as iOS)
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
      throw error // Re-throw error - do NOT fall back to Browser.open()
    }
  } else {
    console.log('[StripeCheckout] Opening Stripe in browser (desktop/web)')
    window.location.href = url
  }
}