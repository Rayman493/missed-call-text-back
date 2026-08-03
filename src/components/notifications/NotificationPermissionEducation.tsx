'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { pushService } from '@/lib/push-service'
import { permissionLock } from '@/lib/permission-lock'
import { useNativePermissions } from '@/hooks/useNativePermissions'

interface NotificationPermissionEducationProps {
  onComplete?: () => void
}

const COOLDOWN_KEY = 'notification_education_cooldown'
const COOLDOWN_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

export function NotificationPermissionEducation({ onComplete }: NotificationPermissionEducationProps) {
  const { notifications, checkNotificationPermission } = useNativePermissions()
  const [show, setShow] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const hasShownRef = useRef(false)
  const isCheckingRef = useRef(false)

  useEffect(() => {
    checkEligibility()
  }, [])

  const checkEligibility = async () => {
    console.log('[NOTIFICATION_EDUCATION_EVALUATED] Starting eligibility check')
    
    // Prevent multiple checks
    if (isCheckingRef.current) {
      console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=already_checking')
      return
    }
    isCheckingRef.current = true

    try {
      // Only on native platforms (Android and iOS)
      if (!Capacitor.isNativePlatform()) {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=not_native')
        return
      }

      // Check cooldown
      const cooldownEnd = localStorage.getItem(COOLDOWN_KEY)
      if (cooldownEnd) {
        const now = Date.now()
        if (now < parseInt(cooldownEnd, 10)) {
          console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=cooldown_active')
          return
        }
      }

      // Check if permission is currently active (Tap to Pay, etc.)
      if (permissionLock.isAnyPermissionActive()) {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=another_permission_active')
        return
      }

      // Check native permission state
      console.log('[NOTIFICATION_PERMISSION_CHECK] Checking permission state via shared hook')
      await checkNotificationPermission()
      console.log('[NOTIFICATION_PERMISSION_CHECK] Current state:', notifications.status)

      // If already granted, register and don't show education
      if (notifications.status === 'granted') {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=permission_already_granted')
        console.log('[NOTIFICATION_PERMISSION_CHECK] Already granted, registering push')
        await pushService.register()
        setShow(false)
        onComplete?.()
        return
      }

      // If denied or blocked, don't show education
      if (notifications.status === 'denied' || notifications.status === 'blocked') {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=permission_denied')
        setShow(false)
        onComplete?.()
        return
      }

      // Check if already shown in this session
      if (hasShownRef.current) {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=already_shown_this_session')
        return
      }

      // Show education
      console.log('[NOTIFICATION_EDUCATION_SHOWN] Showing education modal')
      hasShownRef.current = true
      setShow(true)
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to check eligibility:', error)
    } finally {
      isCheckingRef.current = false
    }
  }

  const handleEnable = async () => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Request permission lock
    if (!permissionLock.requestPermission('notification')) {
      console.log('[NOTIFICATION_EDUCATION] Permission request blocked by lock')
      return
    }

    setIsLoading(true)
    console.log('[NOTIFICATION_EDUCATION] User clicked Enable Notifications')

    try {
      const granted = await pushService.requestPermission()
      console.log('[NOTIFICATION_EDUCATION] Permission result:', granted)

      if (granted) {
        console.log('[NOTIFICATION_EDUCATION] Permission granted')
        setShow(false)
        localStorage.removeItem(COOLDOWN_KEY)
        onComplete?.()
      } else {
        console.log('[NOTIFICATION_EDUCATION] Permission denied')
      }
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to request permission:', error)
    } finally {
      setIsLoading(false)
      permissionLock.releasePermission('notification')
    }
  }

  const handleNotNow = () => {
    console.log('[NOTIFICATION_EDUCATION_DISMISSED] User clicked Not Now')
    // Set cooldown for 24 hours
    const cooldownEnd = Date.now() + COOLDOWN_DURATION
    localStorage.setItem(COOLDOWN_KEY, cooldownEnd.toString())
    console.log(`[NOTIFICATION_EDUCATION] Cooldown set until ${new Date(cooldownEnd).toISOString()}`)
    setShow(false)
    onComplete?.()
  }

  if (!show) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center shrink-0">
            <Bell className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Stay Updated</h2>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
          Get notified about new calls, customer replies, appointments, and payments.
        </p>

        <div className="flex gap-2.5">
          <button
            onClick={handleNotNow}
            disabled={isLoading}
            className="flex-1 h-11 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Not Now
          </button>
          <button
            onClick={handleEnable}
            disabled={isLoading}
            className="flex-1 h-11 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Enabling...' : 'Enable Notifications'}
          </button>
        </div>
      </div>
    </div>
  )
}