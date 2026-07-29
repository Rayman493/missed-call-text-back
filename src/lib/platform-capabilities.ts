import { Capacitor } from '@capacitor/core'
import { useState, useEffect } from 'react'

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

/**
 * React hook that provides reactive platform detection.
 * This is necessary because Capacitor.isNativePlatform() may not be available
 * during SSR or initial render, so we use useEffect to detect the platform
 * once the client is hydrated.
 */
export function useSupportsBusinessNumber(): boolean {
  const [supportsBusiness, setSupportsBusiness] = useState(false)

  useEffect(() => {
    const checkPlatform = async () => {
      try {
        const mod = await import('@capacitor/core')
        const { Capacitor } = mod as any
        setSupportsBusiness(Capacitor.isNativePlatform())
      } catch {
        setSupportsBusiness(false)
      }
    }
    checkPlatform()
  }, [])

  return supportsBusiness
}
