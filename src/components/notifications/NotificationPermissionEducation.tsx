'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, Bell } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { pushService } from '@/lib/push-service'

interface NotificationPermissionEducationProps {
  onComplete?: () => void
}

export function NotificationPermissionEducation({ onComplete }: NotificationPermissionEducationProps) {
  const [show, setShow] = useState(false)
  const [permissionState, setPermissionState] = useState<'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unknown'>('unknown')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    checkPermissionState()
  }, [])

  const checkPermissionState = async () => {
    if (!Capacitor.isNativePlatform()) {
      console.log('[NOTIFICATION_EDUCATION] Web platform, skipping')
      return
    }

    try {
      console.log('[NOTIFICATION_EDUCATION] Checking permission state')
      const result = await PushNotifications.checkPermissions()
      console.log('[NOTIFICATION_EDUCATION] Current state:', result.receive)
      setPermissionState(result.receive)

      // If already granted or denied, don't show education
      if (result.receive === 'granted') {
        console.log('[NOTIFICATION_EDUCATION] Already granted, skipping education')
        setShow(false)
        onComplete?.()
      } else if (result.receive === 'denied') {
        console.log('[NOTIFICATION_EDUCATION] Previously denied, showing settings option')
        setShow(true)
      } else {
        // Check if user has seen education before
        const hasSeenEducation = localStorage.getItem('notification_education_shown')
        if (hasSeenEducation) {
          console.log('[NOTIFICATION_EDUCATION] Already shown education, skipping')
          setShow(false)
          onComplete?.()
        } else {
          setShow(true)
        }
      }
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to check permission state:', error)
    }
  }

  const handleEnable = async () => {
    if (!Capacitor.isNativePlatform()) {
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
        localStorage.setItem('notification_education_shown', 'true')
        onComplete?.()
      } else {
        console.log('[NOTIFICATION_EDUCATION] Permission denied')
        setPermissionState('denied')
      }
    } catch (error) {
      console.error('[NOTIFICATION_EDUCATION] Failed to request permission:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleNotNow = () => {
    console.log('[NOTIFICATION_EDUCATION] User clicked Not Now')
    localStorage.setItem('notification_education_shown', 'true')
    setShow(false)
    onComplete?.()
  }

  const handleOpenSettings = async () => {
    console.log('[NOTIFICATION_EDUCATION] User clicked Open Settings - not implemented yet')
    // TODO: Implement settings opening for denied permissions
  }

  if (!show) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Bell className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Enable notifications</h2>
          </div>
        </div>

        <p className="text-gray-600 mb-6">
          Receive alerts for new customer replies, AI intake calls, appointments, payments, and personal voicemails.
        </p>

        {permissionState === 'denied' && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-amber-800">
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
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
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
                className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
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