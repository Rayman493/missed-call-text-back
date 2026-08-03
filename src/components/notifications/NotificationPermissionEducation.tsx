'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Bell } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { Device } from '@capacitor/device'
import { pushService } from '@/lib/push-service'
import { permissionLock } from '@/lib/permission-lock'

interface NotificationPermissionEducationProps {
  onComplete?: () => void
}

const COOLDOWN_KEY = 'notification_education_cooldown'
const COOLDOWN_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

export function NotificationPermissionEducation({ onComplete }: NotificationPermissionEducationProps) {
  const [show, setShow] = useState(false)
  const [permissionState, setPermissionState] = useState<'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unknown'>('unknown')
  const [isLoading, setIsLoading] = useState(false)
  const [isAndroid13Plus, setIsAndroid13Plus] = useState(false)
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
      // Only on native Android
      if (!Capacitor.isNativePlatform()) {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=not_android')
        return
      }

      const platform = Capacitor.getPlatform()
      if (platform !== 'android') {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=not_android_platform')
        return
      }

      // Check Android version (POST_NOTIFICATIONS required for API 33+)
      const info = await Device.getInfo()
      const androidVersion = parseInt(info.osVersion || '0', 10)
      const isAndroid13 = androidVersion >= 33
      setIsAndroid13Plus(isAndroid13)

      console.log(`[NOTIFICATION_EDUCATION] Android version: ${androidVersion}, Android 13+: ${isAndroid13}`)

      if (!isAndroid13) {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=android_version_below_33')
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
      console.log('[NOTIFICATION_PERMISSION_CHECK] Checking permission state')
      const result = await PushNotifications.checkPermissions()
      console.log('[NOTIFICATION_PERMISSION_CHECK] Current state:', result.receive)
      setPermissionState(result.receive)

      // If already granted, register and don't show education
      if (result.receive === 'granted') {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=permission_already_granted')
        console.log('[NOTIFICATION_PERMISSION_CHECK] Already granted, registering push')
        await pushService.register()
        setShow(false)
        onComplete?.()
        return
      }

      // If denied, don't show education (Settings recovery will handle this)
      if (result.receive === 'denied') {
        console.log('[NOTIFICATION_EDUCATION_BLOCKED] reason=permission_denied')
        console.log('[NOTIFICATION_EDUCATION] Previously denied, not showing education')
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
        setPermissionState('granted')
        setShow(false)
        localStorage.removeItem(COOLDOWN_KEY)
        onComplete?.()
      } else {
        console.log('[NOTIFICATION_EDUCATION] Permission denied')
        setPermissionState('denied')
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

  const handleOpenSettings = async () => {
    console.log('[NOTIFICATION_SETTINGS_OPENED] User clicked Open Settings')
    try {
      // Use window.location to open app settings on Android
      window.location.href = 'app-settings:'
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to open settings:', error)
    }
  }

  if (!show || !isAndroid13Plus) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
            <Bell className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Enable notifications</h2>
          </div>
        </div>

        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Receive alerts for new customer replies, AI intake calls, appointments, payments, and personal voicemails.
        </p>

        {permissionState === 'denied' && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Notifications are disabled. To enable them, go to your device settings.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          {permissionState === 'denied' ? (
            <>
              <button
                onClick={handleNotNow}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleOpenSettings}
                className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Open Settings
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleNotNow}
                disabled={isLoading}
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Not Now
              </button>
              <button
                onClick={handleEnable}
                disabled={isLoading}
                className="flex-1 px-4 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
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