'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { permissionLock } from '@/lib/permission-lock'
import { useNativePermissions } from '@/hooks/useNativePermissions'
import { openAppSettings } from '@/lib/native-settings'
import {
  shouldShowNotificationEducation,
  markSessionChecked,
  recordModalShown,
  recordModalDismissed
} from '@/lib/notification-education-eligibility'

interface NotificationPermissionEducationProps {
  onComplete?: () => void
}

let isCheckingEligibility = false // Single-flight guard for the entire app

export function NotificationPermissionEducation({ onComplete }: NotificationPermissionEducationProps) {
  const { notifications, checkNotificationPermission } = useNativePermissions()
  const [show, setShow] = useState(false)
  const hasShownRef = useRef(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const firstButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    checkEligibility()
  }, [])

  useEffect(() => {
    if (show && firstButtonRef.current) {
      firstButtonRef.current.focus()
    }
  }, [show])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleDismiss()
    }
  }

  const checkEligibility = async () => {
    console.log('[NOTIFICATION_EDUCATION] ===== STARTING ELIGIBILITY CHECK =====')

    // Do not show on web platform
    if (!Capacitor.isNativePlatform()) {
      console.log('[NOTIFICATION_EDUCATION_BLOCKED] not native platform')
      return
    }

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

  const handleOpenSettings = async () => {
    console.log('[NOTIFICATION_EDUCATION] User clicked Open Settings')
    await handleDismiss()

    // Open native app settings
    const result = await openAppSettings()
    console.log('[NOTIFICATION_EDUCATION] Settings open result:', result)

    if (!result.success) {
      console.error('[NOTIFICATION_EDUCATION] Failed to open settings:', result)
    }
  }

  const handleDismiss = async () => {
    console.log('[NOTIFICATION_EDUCATION_DISMISSED] User dismissed modal')
    await recordModalDismissed()
    setShow(false)
    onComplete?.()
  }

  if (!show) {
    return null
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 safe-area-inset-bottom"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-modal-title"
      aria-describedby="notification-modal-description"
    >
      <div 
        ref={modalRef}
        className="bg-card border border-border elevated-surface-border rounded-2xl shadow-2xl max-w-md w-full p-6 transition-all duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <h2
            id="notification-modal-title"
            className="text-lg font-semibold text-foreground"
          >
            Notifications are turned off
          </h2>
        </div>

        <p
          id="notification-modal-description"
          className="text-sm text-muted-foreground mb-6 leading-relaxed"
        >
          To receive notifications about new calls, customer replies, appointments, and payments, enable notifications in your device settings.
        </p>

        <div className="flex gap-3">
          <button
            ref={firstButtonRef}
            onClick={handleDismiss}
            className="flex-1 h-11 px-4 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            Not Now
          </button>
          <button
            onClick={handleOpenSettings}
            className="flex-1 h-11 px-4 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  )
}