'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { permissionLock } from '@/lib/permission-lock'
import { useNativePermissions } from '@/hooks/useNativePermissions'
import {
  shouldShowNotificationEducation,
  markSessionChecked,
  recordModalShown,
  recordModalDismissed,
  recordPermissionGranted,
  recordPermissionDenied
} from '@/lib/notification-education-eligibility'

interface NotificationPermissionEducationProps {
  onComplete?: () => void
}

let isCheckingEligibility = false // Single-flight guard for the entire app

export function NotificationPermissionEducation({ onComplete }: NotificationPermissionEducationProps) {
  const { notifications, checkNotificationPermission, requestNotificationPermission } = useNativePermissions()
  const [show, setShow] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const hasShownRef = useRef(false)

  useEffect(() => {
    checkEligibility()
  }, [])

  const checkEligibility = async () => {
    console.log('[NOTIFICATION_EDUCATION] ===== STARTING ELIGIBILITY CHECK =====')
    
    // Single-flight guard - prevent multiple checks across app
    if (isCheckingEligibility) {
      console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=already_checking_app_wide')
      return
    }
    isCheckingEligibility = true

    try {
      // Check native permission state first
      console.log('[NOTIFICATION_PERMISSION_CHECK] Checking permission state via shared hook')
      await checkNotificationPermission()
      console.log('[NOTIFICATION_PERMISSION_CHECK] Current state:', notifications.status)

      // Use centralized eligibility function
      const eligibility = await shouldShowNotificationEducation({
        platform: Capacitor.getPlatform(),
        isNative: Capacitor.isNativePlatform(),
        nativePermissionStatus: notifications.status,
        permissionLockActive: permissionLock.isAnyPermissionActive()
      })

      console.log('[NOTIFICATION_EDUCATION] Eligibility result:', {
        eligible: eligibility.eligible,
        reason: eligibility.reason,
        diagnostic: eligibility.diagnostic
      })

      if (eligibility.eligible) {
        console.log('[NOTIFICATION_EDUCATION_SHOWN] Showing education modal')
        hasShownRef.current = true
        await recordModalShown()
        setShow(true)
      } else {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=', eligibility.reason)
        setShow(false)
        // Mark session as checked to prevent re-checking
        await markSessionChecked()
        onComplete?.()
      }
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to check eligibility:', error)
      // On error, mark session as checked to prevent infinite retry loops
      await markSessionChecked()
    } finally {
      isCheckingEligibility = false
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

    // Immediately dismiss the modal before triggering native prompt
    setShow(false)
    setIsLoading(true)
    console.log('[NOTIFICATION_EDUCATION] User clicked Enable Notifications - modal dismissed')

    try {
      await requestNotificationPermission()
      console.log('[NOTIFICATION_EDUCATION] Permission requested')
      
      // Check status after request
      await checkNotificationPermission(true)
      console.log('[NOTIFICATION_EDUCATION] Current status after request:', notifications.status)

      if (notifications.status === 'granted') {
        console.log('[NOTIFICATION_EDUCATION] Permission granted')
        await recordPermissionGranted()
        onComplete?.()
      } else {
        console.log('[NOTIFICATION_EDUCATION] Permission denied or blocked')
        await recordPermissionDenied(notifications.status)
      }
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to request permission:', error)
    } finally {
      setIsLoading(false)
      permissionLock.releasePermission('notification')
    }
  }

  const handleNotNow = async () => {
    console.log('[NOTIFICATION_EDUCATION_DISMISSED] User clicked Not Now')
    await recordModalDismissed()
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