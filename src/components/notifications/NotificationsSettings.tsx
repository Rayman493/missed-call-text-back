'use client'

import { useState, useEffect } from 'react'
import { Bell, BellOff, Settings as SettingsIcon, CheckCircle } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { Device } from '@capacitor/device'
import { pushService } from '@/lib/push-service'

type PermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unknown'

export function NotificationsSettings() {
  const [permissionState, setPermissionState] = useState<PermissionState>('unknown')
  const [isLoading, setIsLoading] = useState(false)
  const [isAndroid13Plus, setIsAndroid13Plus] = useState(false)

  useEffect(() => {
    checkPermissionState()
  }, [])

  const checkPermissionState = async () => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    const platform = Capacitor.getPlatform()
    if (platform !== 'android') {
      return
    }

    // Check Android version
    const info = await Device.getInfo()
    const androidVersion = parseInt(info.osVersion || '0', 10)
    const isAndroid13 = androidVersion >= 33
    setIsAndroid13Plus(isAndroid13)

    if (!isAndroid13) {
      return
    }

    // Check permission state
    console.log('[NOTIFICATION_SETTINGS] Checking permission state')
    const result = await PushNotifications.checkPermissions()
    console.log('[NOTIFICATION_SETTINGS] Current state:', result.receive)
    setPermissionState(result.receive)
  }

  const handleEnable = async () => {
    setIsLoading(true)
    console.log('[NOTIFICATION_SETTINGS] User clicked Enable Notifications')

    try {
      const granted = await pushService.requestPermission()
      console.log('[NOTIFICATION_SETTINGS] Permission result:', granted)
      if (granted) {
        setPermissionState('granted')
      } else {
        setPermissionState('denied')
      }
    } catch (error) {
      console.error('[NOTIFICATION_SETTINGS] Failed to request permission:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenSettings = async () => {
    console.log('[NOTIFICATION_SETTINGS_OPENED] User clicked Open Settings')
    try {
      // Use window.location to open app settings on Android
      window.location.href = 'app-settings:'
    } catch (error) {
      console.error('[NOTIFICATION_SETTINGS] Failed to open settings:', error)
    }
  }

  if (!isAndroid13Plus) {
    return null
  }

  return (
    <div id="notifications" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Notifications</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Receive alerts for new customer replies, AI intake calls, appointments, payments, and personal voicemails.
        </p>
      </div>

      <div className="space-y-3">
        {permissionState === 'granted' && (
          <div className="flex items-center justify-between p-4 border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-green-900 dark:text-green-100">Enabled</div>
                <div className="text-xs text-green-700 dark:text-green-300">Push notifications are active</div>
              </div>
            </div>
          </div>
        )}

        {(permissionState === 'prompt' || permissionState === 'prompt-with-rationale') && (
          <button
            onClick={handleEnable}
            disabled={isLoading}
            className="w-full flex items-center justify-between p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center">
                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-blue-900 dark:text-blue-100">Enable Notifications</div>
                <div className="text-xs text-blue-700 dark:text-blue-300">Receive alerts for important updates</div>
              </div>
            </div>
            <div className="text-blue-600 dark:text-blue-400">
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
          </button>
        )}

        {permissionState === 'denied' && (
          <button
            onClick={handleOpenSettings}
            className="w-full flex items-center justify-between p-4 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center">
                <BellOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-left">
                <div className="text-sm font-medium text-amber-900 dark:text-amber-100">Disabled</div>
                <div className="text-xs text-amber-700 dark:text-amber-300">Notifications are blocked</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <SettingsIcon className="w-5 h-5" />
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        )}

        {permissionState === 'unknown' && (
          <div className="p-4 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Checking notification status...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}