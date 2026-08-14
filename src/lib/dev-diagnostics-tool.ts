/**
 * Development tool for enabling/disabling Tap to Pay diagnostics on device.
 *
 * This is a standalone script that can be run in a development environment
 * to enable or disable diagnostics for testing purposes.
 *
 * USAGE:
 * 1. Build and run the app in debug mode on a device
 * 2. Add this file to your development build (e.g., via a debug-only route or dev tools screen)
 * 3. Call the functions from a debug UI or console
 *
 * ALTERNATIVE: Use Capacitor DevApp console to call Preferences directly:
 * ```javascript
 * Capacitor.Plugins.Preferences.set({ key: 'ttp_diagnostics_enabled', value: 'true' })
 * ```
 */

import { Preferences } from '@capacitor/preferences'

const TTP_DIAGNOSTICS_OPT_IN_KEY = 'ttp_diagnostics_enabled'

/**
 * Enable Tap to Pay diagnostics for development/testing.
 * This should only be used in debug builds on test devices.
 */
export async function devEnableDiagnostics(): Promise<{ success: boolean; message: string }> {
  try {
    await Preferences.set({ key: TTP_DIAGNOSTICS_OPT_IN_KEY, value: 'true' })
    return { success: true, message: 'Diagnostics enabled. Restart the app to see the diagnostics panel.' }
  } catch (error) {
    return { success: false, message: `Failed to enable diagnostics: ${error}` }
  }
}

/**
 * Disable Tap to Pay diagnostics.
 */
export async function devDisableDiagnostics(): Promise<{ success: boolean; message: string }> {
  try {
    await Preferences.remove({ key: TTP_DIAGNOSTICS_OPT_IN_KEY })
    return { success: true, message: 'Diagnostics disabled. Restart the app to apply.' }
  } catch (error) {
    return { success: false, message: `Failed to disable diagnostics: ${error}` }
  }
}

/**
 * Check current diagnostics opt-in status.
 */
export async function devCheckDiagnosticsStatus(): Promise<{ enabled: boolean; message: string }> {
  try {
    const result = await Preferences.get({ key: TTP_DIAGNOSTICS_OPT_IN_KEY })
    const enabled = result.value === 'true'
    return {
      enabled,
      message: enabled ? 'Diagnostics are enabled' : 'Diagnostics are disabled'
    }
  } catch (error) {
    return { enabled: false, message: `Failed to check status: ${error}` }
  }
}