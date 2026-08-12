/**
 * Stripe Connect Onboarding Helper
 *
 * Opens Stripe Connect onboarding using the appropriate mechanism for the current platform.
 *
 * Native iOS (iOS 17.4+): Uses ASWebAuthenticationSession for automatic return-to-app behavior.
 * Desktop/web/Android: Uses window.location.href for normal browser navigation.
 *
 * IMPORTANT: Connect onboarding does NOT indicate account connection success. Account
 * status must be verified through server-side refresh endpoint or Stripe webhook.
 */

import { Capacitor } from '@capacitor/core'
import { registerPlugin } from '@capacitor/core'

export interface StripeConnectPlugin {
  openConnectOnboarding(options: {
    url: string
    callbackHost: string
    callbackPath: string
  }): Promise<{
    completed: boolean
    callbackMatched: boolean
    callbackUrl?: string
  }>
}

const ReplyflowStripeConnect = registerPlugin<StripeConnectPlugin>('ReplyflowStripeConnect')

/**
 * Check if current platform is native iOS
 */
export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

export async function openStripeConnectOnboarding(url: string): Promise<void> {
  if (isNativeIOS()) {
    console.log('[STRIPE CONNECT] Opening Connect onboarding in native web session (iOS)')
    try {
      const result = await ReplyflowStripeConnect.openConnectOnboarding({
        url,
        callbackHost: 'www.replyflowhq.com',
        callbackPath: '/dashboard/settings'
      })
      console.log('[STRIPE CONNECT] Native onboarding session completed:', result)

      // Handle the callback result
      if (result.callbackMatched && result.callbackUrl) {
        console.log('[STRIPE CONNECT] Callback matched, navigating to settings with return marker')
        // Navigate to settings with connect return marker to trigger status refresh
        window.location.href = '/dashboard/settings?stripe_connect_return=1'
        return
      }

      if (result.completed) {
        console.log('[STRIPE CONNECT] Onboarding completed without callback match')
        // Navigate to settings to trigger status refresh
        window.location.href = '/dashboard/settings?stripe_connect_return=1'
        return
      }

      console.error('[STRIPE CONNECT] Callback did not match')
      throw new Error('Callback did not match expected path')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[STRIPE CONNECT] Native onboarding session failed:', errorMessage)

      // Don't silently fall back for plugin errors - surface them to the user
      if (errorMessage.includes('does not respond to method call') ||
          errorMessage.includes('not available') ||
          errorMessage.includes('not defined')) {
        throw new Error('Stripe Connect is not available. Please try again.')
      }

      // For other errors (e.g., user cancellation), fall back to browser navigation
      console.log('[STRIPE CONNECT] Falling back to browser navigation')
      window.location.href = url
    }
  } else {
    console.log('[STRIPE CONNECT] Opening Connect onboarding in browser (desktop/web/Android)')
    window.location.href = url
  }
}