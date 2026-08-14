import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/**
 * Developer-only Tap to Pay diagnostics opt-in mechanism.
 *
 * This ensures diagnostics are never shown in production builds, even on debug builds,
 * unless explicitly enabled by an engineer on the device.
 *
 * SECURITY: This is intentionally not exposed via:
 * - Query parameters
 * - Remote configuration
 * - Business settings
 * - User preferences
 *
 * It can only be enabled by direct Capacitor Preferences access on the device.
 */

const TTP_DIAGNOSTICS_OPT_IN_KEY = 'ttp_diagnostics_enabled'

/**
 * Check if diagnostics should be rendered.
 *
 * Requirements:
 * 1. Web development (NODE_ENV !== 'production') → enabled
 * 2. Native builds → require BOTH:
 *    - isNativeDebugBuild === true
 *    - Explicit developer opt-in enabled
 *
 * @param isNativeDebugBuild - Whether the native build is a debug build
 * @returns Promise<boolean> - true if diagnostics should be rendered
 */
export async function isDiagnosticsEnabled(isNativeDebugBuild: boolean = false): Promise<boolean> {
  // Web development: always enabled for local development
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    return true
  }

  // Native: require BOTH debug build AND explicit opt-in
  if (Capacitor.isNativePlatform()) {
    // Must be a debug build
    if (!isNativeDebugBuild) {
      return false
    }

    // Must have explicit developer opt-in
    try {
      const optIn = await Preferences.get({ key: TTP_DIAGNOSTICS_OPT_IN_KEY })
      return optIn.value === 'true'
    } catch {
      // If Preferences fails, default to disabled
      return false
    }
  }

  // Production web: never enabled
  return false
}

/**
 * Enable Tap to Pay diagnostics (developer-only).
 * This can only be called by engineers with direct device access.
 *
 * Usage (in Capacitor DevApp console or similar):
 * ```javascript
 * import { enableDiagnostics } from '@/lib/tap-to-pay-diagnostics-opt-in'
 * await enableDiagnostics()
 * ```
 */
export async function enableDiagnostics(): Promise<void> {
  await Preferences.set({ key: TTP_DIAGNOSTICS_OPT_IN_KEY, value: 'true' })
}

/**
 * Disable Tap to Pay diagnostics (developer-only).
 * This can only be called by engineers with direct device access.
 *
 * Usage (in Capacitor DevApp console or similar):
 * ```javascript
 * import { disableDiagnostics } from '@/lib/tap-to-pay-diagnostics-opt-in'
 * await disableDiagnostics()
 * ```
 */
export async function disableDiagnostics(): Promise<void> {
  await Preferences.remove({ key: TTP_DIAGNOSTICS_OPT_IN_KEY })
}

/**
 * Check if diagnostics opt-in is currently enabled (device-local state only).
 * This does not check the build configuration, only the opt-in flag.
 *
 * @returns Promise<boolean> - true if opt-in is enabled
 */
export async function isDiagnosticsOptInEnabled(): Promise<boolean> {
  const optIn = await Preferences.get({ key: TTP_DIAGNOSTICS_OPT_IN_KEY })
  return optIn.value === 'true'
}