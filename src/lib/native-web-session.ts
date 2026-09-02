/**
 * Generic Native Web Session Helper
 *
 * Opens authenticated web sessions using the appropriate mechanism for the current platform.
 *
 * Native iOS: Uses ASWebAuthenticationSession for automatic return-to-app behavior.
 * Native Android: Uses Chrome Custom Tabs for automatic return-to-app behavior.
 * Desktop/web: Uses window.location.href for normal browser navigation.
 *
 * This is a generic primitive for any authenticated web flow (Stripe Billing Portal, etc.).
 * It does NOT impose flow-specific behavior like session_id extraction or success navigation.
 *
 * The caller is responsible for:
 * - Handling the terminal result (callback, cancel, error)
 * - Performing flow-specific navigation
 * - Refreshing canonical state
 */

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import ReplyflowWebCheckoutPlugin from '@/lib/web-checkout'

export interface NativeWebSessionResult {
  completed: boolean
  canceled?: boolean
  callbackMatched: boolean
  callbackUrl?: string
  errorCode?: string
  errorMessage?: string
}

export interface NativeWebSessionOptions {
  url: string
  callbackHost: string
  callbackPath: string
  operationType?: 'checkout' | 'billing_portal'
}

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

/**
 * Open an authenticated web session using the appropriate mechanism for the current platform.
 *
 * @param options - Session configuration including URL and callback details
 * @returns Promise resolving to the terminal session result
 */
export async function openNativeWebSession(options: NativeWebSessionOptions): Promise<NativeWebSessionResult> {
  const { url, callbackHost, callbackPath, operationType } = options

  if (isNativeIOS()) {
    console.log('[Native Web Session] Opening in ASWebAuthenticationSession (iOS)')
    try {
      const result = await ReplyflowWebCheckoutPlugin.openCheckoutSession({
        url,
        callbackHost,
        callbackPath,
        operationType,
      })
      console.log('[Native Web Session] Native session completed:', result)
      return result
    } catch (error) {
      console.error('[Native Web Session] Native session failed:', error)
      console.log('[Native Web Session] Falling back to in-app browser')
      // Fallback to Browser.open() if native session fails
      try {
        await Browser.open({ url })
        console.log('[Native Web Session] Browser.open() fallback succeeded')
        return { completed: false, callbackMatched: false }
      } catch (browserError) {
        console.error('[Native Web Session] Browser.open() fallback failed:', browserError)
        // Final fallback to window.location.href
        console.log('[Native Web Session] Falling back to window.location.href')
        window.location.href = url
        return { completed: false, callbackMatched: false }
      }
    }
  } else if (isNativeAndroid()) {
    console.log('[Native Web Session] Opening in native plugin (Android)')
    try {
      const result = await ReplyflowWebCheckoutPlugin.openCheckoutSession({
        url,
        callbackHost,
        callbackPath,
        operationType,
      })
      console.log('[Native Web Session] Native session completed:', result)
      return result
    } catch (error) {
      console.error('[Native Web Session] Native session failed:', error)
      throw error // Re-throw error - do NOT fall back to Browser.open() for Android
    }
  } else {
    // Desktop/web: Use normal browser navigation
    console.log('[Native Web Session] Opening in browser (desktop/web)')
    window.location.href = url
    return { completed: false, callbackMatched: false }
  }
}