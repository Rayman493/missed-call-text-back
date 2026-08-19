/**
 * Native App Settings Helper
 *
 * Provides a cross-platform API to open the app's native settings screen.
 * Used for permission recovery (e.g., when notification permission is denied/blocked).
 */

import { Capacitor } from '@capacitor/core'

let NativeSettingsModule: any = null

/**
 * Dynamically import the NativeSettings plugin
 * Only loads on native platforms to avoid web errors
 */
async function getNativeSettings() {
  if (NativeSettingsModule) {
    return NativeSettingsModule
  }

  if (!Capacitor.isNativePlatform()) {
    return null
  }

  try {
    const module = await import('capacitor-native-settings')
    NativeSettingsModule = module
    return module
  } catch (error) {
    console.error('[Native Settings] Failed to load capacitor-native-settings:', error)
    return null
  }
}

/**
 * Open the app's native settings screen
 * Opens Application Details on Android
 * Opens App Settings on iOS (officially supported by Apple)
 *
 * @returns Promise<{ success: boolean; platform: string }>
 */
export async function openAppSettings(): Promise<{ success: boolean; platform: string }> {
  const platform = Capacitor.getPlatform()

  // Web: not supported
  if (!Capacitor.isNativePlatform()) {
    console.log('[Native Settings] Web platform, app settings not available')
    return { success: false, platform: 'web' }
  }

  const NativeSettings = await getNativeSettings()

  if (!NativeSettings) {
    console.error('[Native Settings] NativeSettings plugin not available')
    return { success: false, platform }
  }

  try {
    console.log('[Native Settings] Opening app settings for platform:', platform)

    if (platform === 'android') {
      const result = await NativeSettings.openAndroid({
        option: 'application_details'
      })
      console.log('[Native Settings] Android settings opened:', result)
      return { success: result.status === true, platform: 'android' }
    }

    if (platform === 'ios') {
      // Use App settings (officially supported by Apple)
      // For iOS 15.4+, we could use 'app_notification' for direct notification settings
      // but 'app' is the safest and most broadly compatible option
      const result = await NativeSettings.openIOS({
        option: 'app'
      })
      console.log('[Native Settings] iOS settings opened:', result)
      return { success: result.status === true, platform: 'ios' }
    }

    return { success: false, platform }
  } catch (error) {
    console.error('[Native Settings] Failed to open app settings:', error)
    return { success: false, platform }
  }
}

/**
 * Check if native app settings are available
 */
export function isNativeSettingsAvailable(): boolean {
  return Capacitor.isNativePlatform()
}