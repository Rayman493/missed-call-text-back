'use client'

import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/contexts/AuthContext'
import { pushService } from '@/lib/push-service'
import { permissionLock } from '@/lib/permission-lock'

/**
 * Requests native notification permission once, at the first eligible
 * authenticated app-shell mount, on native Android/iOS only.
 *
 * This component does not render UI. It is intended to be mounted inside the
 * authenticated app shell (after auth and business are loaded) so the OS prompt
 * clearly belongs to ReplyFlow startup, not to a later feature action such as
 * payment, Tap to Pay, or modal close.
 */
export function NotificationStartupPermission() {
  const { authHydrated, user } = useAuth()
  const hasRequestedRef = useRef(false)

  useEffect(() => {
    // Only run in native Capacitor builds.
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Wait until the authenticated shell is ready.
    if (!authHydrated || !user) {
      return
    }

    // Guard against duplicate requests from rerenders or React Strict Mode.
    if (hasRequestedRef.current) {
      return
    }
    hasRequestedRef.current = true

    // Coordinate with other native permission requests (location, Tap to Pay).
    if (!permissionLock.requestPermission('notification')) {
      return
    }

    let lockReleased = false

    // Defer one animation frame so the app shell is painted before the OS prompt.
    const raf = requestAnimationFrame(async () => {
      try {
        await pushService.requestPermission()
      } catch (error) {
        console.error('[NotificationStartupPermission] Permission request failed:', error)
      } finally {
        lockReleased = true
        permissionLock.releasePermission('notification')
      }
    })

    return () => {
      cancelAnimationFrame(raf)
      if (!lockReleased) {
        permissionLock.releasePermission('notification')
        lockReleased = true
      }
    }
  }, [authHydrated, user])

  return null
}
