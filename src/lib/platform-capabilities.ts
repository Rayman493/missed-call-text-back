import { Capacitor } from '@capacitor/core'

/**
 * Returns true if the current platform supports Business Number messaging.
 * Business Number requires native mobile (Android/iOS) to open the device messaging app.
 * 
 * Current behavior:
 * - Native Android: true
 * - Native iOS: true
 * - Desktop: false
 * - Mobile browser: false (sms: launch not validated)
 * 
 * This helper centralizes the capability check so mobile browser support can be added later
 * without touching business logic throughout the codebase.
 */
export function supportsBusinessNumber(): boolean {
  return Capacitor.isNativePlatform()
}
