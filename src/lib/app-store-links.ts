/**
 * Central app-store listing URLs for ReplyFlowHQ public surfaces.
 *
 * Single source of truth so /download and the homepage never diverge.
 * Both can be overridden via NEXT_PUBLIC_* env vars when listings change.
 */

export const IOS_APP_STORE_URL = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || null

export const GOOGLE_PLAY_STORE_URL =
  process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL ||
  'https://play.google.com/store/apps/details?id=com.replyflowhq.app&hl=en_US'

// Validate iOS App Store URL
export function isValidAppStoreURL(url: string | null): boolean {
  if (!url) return false
  try {
    const urlObj = new URL(url)
    // Must be an Apple App Store domain
    return urlObj.hostname === 'apps.apple.com' || urlObj.hostname === 'appstore.com'
  } catch {
    return false
  }
}

// Validate Google Play URL
export function isValidGooglePlayURL(url: string | null): boolean {
  if (!url) return false
  try {
    const urlObj = new URL(url)
    // Must be a Google Play domain
    return urlObj.hostname === 'play.google.com'
  } catch {
    return false
  }
}
