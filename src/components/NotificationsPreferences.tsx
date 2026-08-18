'use client'

import { useState, useEffect } from 'react'
import { Bell, ExternalLink } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import { useNativePermissions } from '@/hooks/useNativePermissions'
import { pushService } from '@/lib/push-service'
import { permissionLock } from '@/lib/permission-lock'

interface NotificationPreference {
  key: string
  label: string
  description: string
  enabled: boolean
}

export function NotificationsPreferences() {
  const { business } = useBusiness()
  const { notifications, checkNotificationPermission, requestNotificationPermission } = useNativePermissions()
  const [isRequesting, setIsRequesting] = useState(false)
  
  const [preferences, setPreferences] = useState<NotificationPreference[]>([
    {
      key: 'new_ai_intake',
      label: 'New AI intake',
      description: 'When an AI intake call is completed',
      enabled: true
    },
    {
      key: 'customer_reply',
      label: 'Customer reply',
      description: 'When a customer replies to your message',
      enabled: true
    },
    {
      key: 'payment_requested',
      label: 'Payment requested',
      description: 'When a payment is requested',
      enabled: true
    },
    {
      key: 'payment_completed',
      label: 'Payment completed',
      description: 'When a payment is successfully completed',
      enabled: true
    },
    {
      key: 'calendar_connected',
      label: 'Calendar connected or disconnected',
      description: 'When your Google Calendar is connected or disconnected',
      enabled: true
    },
    {
      key: 'appointment_created',
      label: 'Appointment created or deleted',
      description: 'When an appointment is scheduled or cancelled',
      enabled: true
    },
    {
      key: 'personal_voicemail',
      label: 'Personal voicemail',
      description: 'When a voicemail is left on your personal phone',
      enabled: true
    }
  ])

  const [isUpdating, setIsUpdating] = useState(false)

  // Check notification permission silently on mount (native only)
  // This ensures we have current state without prompting
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      checkNotificationPermission(true)
    }
  }, [checkNotificationPermission])

  // Refresh permission status when app regains visibility (e.g., after returning from system settings)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to ensure system has updated permission state
        setTimeout(() => {
          checkNotificationPermission(true)
        }, 500)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [checkNotificationPermission])

  const handleDeviceNotificationToggle = async (enabled: boolean) => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    // Only request permission if turning on and status is not already granted
    if (enabled && notifications.status !== 'granted') {
      if (!permissionLock.requestPermission('notification')) {
        return
      }

      setIsRequesting(true)
      try {
        await requestNotificationPermission()
        // Check status after request to update UI
        await checkNotificationPermission(true)
      } catch (error) {
        console.error('[NOTIFICATIONS] Failed to request permission:', error)
      } finally {
        setIsRequesting(false)
        permissionLock.releasePermission('notification')
      }
    }
  }

  const handleOpenDeviceSettings = async () => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    try {
      await Browser.open({ url: 'app-settings:' })
    } catch (error) {
      console.error('[NOTIFICATIONS] Failed to open device settings:', error)
    }
  }

  // Load preferences from business settings if available
  useEffect(() => {
    if (business && (business as any).notification_preferences) {
      setPreferences(prev => 
        prev.map(pref => ({
          ...pref,
          enabled: (business as any).notification_preferences[pref.key] ?? pref.enabled
        }))
      )
    }
  }, [business])

  const handleToggle = async (key: string) => {
    setPreferences(prev =>
      prev.map(pref =>
        pref.key === key ? { ...pref, enabled: !pref.enabled } : pref
      )
    )

    // In a real implementation, this would save to the database
    // For now, we'll just update local state
    setIsUpdating(true)
    setTimeout(() => setIsUpdating(false), 300)
  }

  return (
    <div id="notifications" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Notifications</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Choose which ReplyFlow alerts you want to receive.
        </p>
      </div>

      {/* Device Notification Toggle - Native Only */}
      {Capacitor.isNativePlatform() && (
        <div className="mb-5 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <div className="text-sm font-medium text-foreground mb-0.5">
                Enable notifications on this device
              </div>
              <div className="text-xs text-muted-foreground">
                Allow ReplyFlow to send push notifications.
              </div>
              {(notifications.status === 'denied' || notifications.status === 'blocked') && (
                <div className="mt-2">
                  <div className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                    Notifications are disabled in your device settings.
                  </div>
                  <button
                    onClick={handleOpenDeviceSettings}
                    className="text-xs flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open Device Settings
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => handleDeviceNotificationToggle(notifications.status !== 'granted')}
              disabled={isRequesting || notifications.status === 'denied' || notifications.status === 'blocked'}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 flex-shrink-0 ${
                notifications.status === 'granted' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
              } ${isRequesting || notifications.status === 'denied' || notifications.status === 'blocked' ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label={notifications.status === 'granted' ? 'Disable notifications' : 'Enable notifications'}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-200 shadow-sm ${
                  notifications.status === 'granted' ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      <div className="space-y-3">
        {preferences.map((pref) => (
          <div
            key={pref.key}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-border/20 rounded-lg ${
              Capacitor.isNativePlatform() && notifications.status !== 'granted' ? 'opacity-50' : ''
            }`}
          >
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground mb-0.5">
                {pref.label}
              </div>
              <div className="text-xs text-muted-foreground">
                {pref.description}
              </div>
            </div>
            <button
              onClick={() => handleToggle(pref.key)}
              disabled={isUpdating || (Capacitor.isNativePlatform() && notifications.status !== 'granted')}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 flex-shrink-0 ${
                pref.enabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
              } ${isUpdating || (Capacitor.isNativePlatform() && notifications.status !== 'granted') ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label={pref.enabled ? `Disable ${pref.label}` : `Enable ${pref.label}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-200 shadow-sm ${
                  pref.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
