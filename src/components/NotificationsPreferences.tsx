'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCircle, AlertCircle, ArrowRight } from 'lucide-react'
import { useNativePermissions } from '@/hooks/useNativePermissions'
import { useBusiness } from '@/contexts/BusinessContext'
import { isNativeMobilePlatform } from '@/lib/settings-config'

interface NotificationPreference {
  key: string
  label: string
  description: string
  enabled: boolean
}

export function NotificationsPreferences() {
  const router = useRouter()
  const { business } = useBusiness()
  const { notifications, platform, isNative } = useNativePermissions()
  
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

  const handleReviewPermissions = () => {
    router.push('/dashboard/settings#permissions')
  }

  return (
    <div id="notifications" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Notifications</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Choose which ReplyFlow alerts you want to receive.
        </p>
      </div>

      {/* OS Permission Status Banner - Native mobile only */}
      {isNativeMobilePlatform() && (
        <div className={`mb-5 p-4 rounded-lg border ${
          notifications.status === 'granted' 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}>
          <div className="flex items-start gap-3">
            {notifications.status === 'granted' ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground mb-1">
                {notifications.status === 'granted' 
                  ? 'Device notifications are enabled.'
                  : 'Device notifications are not enabled.'
                }
              </div>
              {notifications.status !== 'granted' && (
                <button
                  onClick={handleReviewPermissions}
                  className="mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                >
                  Review Permissions
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Notification Preferences */}
      <div className="space-y-3">
        {preferences.map((pref) => (
          <div
            key={pref.key}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border border-border/20 rounded-lg"
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
              disabled={isUpdating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-200 flex-shrink-0 ${
                pref.enabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-600 hover:bg-slate-500'
              } ${isUpdating ? 'opacity-50 cursor-not-allowed' : ''}`}
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
