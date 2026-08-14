/**
 * Stripe Connect Onboarding Helper
 *
 * Opens Stripe Connect onboarding using the appropriate mechanism for the current platform.
 *
 * Native iOS (iOS 17.4+): Uses ASWebAuthenticationSession for automatic return-to-app behavior.
 * Android: Uses Capacitor Browser plugin for controlled external browser with App Link return.
 * Desktop/web: Uses window.location.href for normal browser navigation.
 *
 * IMPORTANT: Connect onboarding does NOT indicate account connection success. Account
 * status must be verified through server-side refresh endpoint or Stripe webhook.
 */

import { Capacitor } from '@capacitor/core'
import { registerPlugin } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { setPendingStripeOperation } from '@/lib/external-return-handler'

/**
 * Normalize Stripe Connect native plugin errors to user-friendly messages
 * Internal implementation details are stripped before showing to users
 */
export function normalizeStripeConnectError(errorMessage: string): string {
  const lowerError = errorMessage.toLowerCase()

  // Normalize user cancellation/incomplete onboarding to user-friendly message
  if (lowerError.includes('canceled') ||
      lowerError.includes('cancelled') ||
      lowerError.includes('user cancelled') ||
      lowerError.includes('user canceled')) {
    return 'Stripe Setup Not Completed'
  }

  // Strip raw native/plugin implementation details
  if (errorMessage.includes('Native') ||
      errorMessage.includes('plugin') ||
      errorMessage.includes('ReplyflowStripeConnect')) {
    return 'Stripe Connect encountered an error. Please try again.'
  }

  // Return original message for other errors (rare)
  return errorMessage
}

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

export async function openStripeConnectOnboarding(url: string, businessId?: string): Promise<{ completed: boolean; callbackMatched: boolean }> {
  console.log('[STRIPE CONNECT] web_build_marker=CONNECT_CALL_FIX_2026_08_12')

  // Set pending operation for reconciliation on return/resume
  if (businessId) {
    await setPendingStripeOperation('connect_onboarding')
    console.log('[STRIPE CONNECT] Pending operation set for business:', businessId)
  }

  if (isNativeIOS()) {
    console.log('[STRIPE CONNECT] Opening Connect onboarding in native web session (iOS)')
    try {
      const result = await ReplyflowStripeConnect.openConnectOnboarding({
        url,
        callbackHost: 'www.replyflowhq.com',
        callbackPath: '/dashboard/settings'
      })

      console.log('[STRIPE CONNECT] native_promise_returned=true', { hasResult: !!result })
      console.log('[STRIPE CONNECT] native_result_received=true')
      console.log('[STRIPE CONNECT] native_completed=', result?.completed)
      console.log('[STRIPE CONNECT] native_callback_matched=', result?.callbackMatched)

      if (!result || result.completed === undefined || result.callbackMatched === undefined) {
        console.error('[STRIPE CONNECT] Native result is invalid or undefined')
        throw new Error('Stripe Connect returned an invalid result. Please try again.')
      }

      // Return the result directly without navigation
      // The caller (handleConnectStripe) will handle status refresh
      return {
        completed: result.completed,
        callbackMatched: result.callbackMatched
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[STRIPE CONNECT] Native onboarding session failed:', errorMessage)

      // Don't silently fall back for plugin errors - surface them to the user
      if (errorMessage.includes('does not respond to method call') ||
          errorMessage.includes('not available') ||
          errorMessage.includes('not defined')) {
        throw new Error('Stripe Connect is not available. Please try again.')
      }

      // Normalize error to user-friendly message
      const normalizedMessage = normalizeStripeConnectError(errorMessage)
      throw new Error(normalizedMessage)
    }
  } else if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    // Android: Use Capacitor Browser plugin for controlled external browser
    console.log('[STRIPE CONNECT] Opening Connect onboarding in Capacitor Browser (Android)')
    try {
      await Browser.open({ url })
      // Browser.open() doesn't wait for completion - returns immediately
      // The actual return happens via App Link and appUrlOpen listener
      return { completed: false, callbackMatched: false }
    } catch (error) {
      console.error('[STRIPE CONNECT] Browser.open failed:', error)
      // Fallback to window.location.href if Browser plugin fails
      window.location.href = url
      return { completed: false, callbackMatched: false }
    }
  } else {
    // Desktop/web: Use normal browser navigation
    console.log('[STRIPE CONNECT] Opening Connect onboarding in browser (desktop/web)')
    window.location.href = url
    return { completed: false, callbackMatched: false }
  }
}