/**
 * Billing recovery utility for iOS native Stripe checkout return handling
 *
 * This module provides deterministic logic for determining when to trigger
 * custom-scheme recovery after Stripe checkout returns to external browser.
 */

/**
 * Determine if billing success should trigger app recovery
 *
 * @param url - Current page URL
 * @returns true if should trigger recovery, false otherwise
 */
export function shouldTriggerAppRecovery(url: string): boolean {
  try {
    const urlObj = new URL(url)
    const hasReturnToAppMarker = urlObj.searchParams.has('return_to_app')
    const hasRecoveryMarker = urlObj.searchParams.has('recovery')

    // Trigger recovery if:
    // - return_to_app marker is present (checkout originated from native iOS app)
    // - recovery marker is absent (not already recovered)
    return hasReturnToAppMarker && !hasRecoveryMarker
  } catch {
    return false
  }
}

/**
 * Determine if checkout needs native return marker in success URL
 *
 * @param isNativePlatform - Whether running in Capacitor native environment
 * @param platform - Capacitor platform (ios, android, web)
 * @returns true if should add return_to_app=1 to success URL
 */
export function needsNativeReturnMarker(isNativePlatform: boolean, platform: string): boolean {
  // Only add marker for native iOS
  return isNativePlatform && platform === 'ios'
}