'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Settings } from 'lucide-react'
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

  const handleDismiss = async () => {
    console.log('[NOTIFICATION_EDUCATION_DISMISSED] User dismissed modal')
    await recordModalDismissed()
    setShow(false)
    onComplete?.()
  }

  const handleOpenSettings = async () => {
    console.log('[NOTIFICATION_EDUCATION] User clicked Open Settings')
    await handleDismiss()
    // Note: Opening device settings is platform-specific and may require additional implementation
    // For now, just dismiss the modal
  }

  if (!show) {
    return null
  }

  const isDenied = notifications.status === 'denied' || notifications.status === 'blocked'

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
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            {isDenied ? 'Notifications are turned off' : 'Stay on top of new customers'}
          </h2>
        </div>

        <p 
          id="notification-modal-description"
          className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed"
        >
          {isDenied 
            ? 'To receive notifications about new calls, customer replies, appointments, and payments, enable notifications in your device settings.'
            : 'Get notified about new calls, customer replies, appointments, and payments so you never miss an opportunity.'
          }
        </p>

        <div className="flex gap-3">
          {isDenied ? (
            <button
              ref={firstButtonRef}
              onClick={handleOpenSettings}
              className="flex-1 h-11 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800"
            >
              Open Settings
            </button>
          ) : (
            <>
              <button
                ref={firstButtonRef}
                onClick={handleDismiss}
                disabled={isLoading}
                className="flex-1 h-11 px-4 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Not Now
              </button>
              <button
                onClick={handleEnable}
                disabled={isLoading}
                className="flex-1 h-11 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Enabling...' : 'Enable Notifications'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}