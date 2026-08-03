'use client'

import { Bell, MapPin, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { useNativePermissions } from '@/hooks/useNativePermissions'

export function PermissionsSettings() {
  const {
    platform,
    isNative,
    location,
    notifications,
    checkLocationPermission,
    requestLocationPermission,
    checkNotificationPermission,
    requestNotificationPermission
  } = useNativePermissions()

  const isLoadingLocation = location.status === 'checking'
  const isLoadingNotifications = notifications.status === 'checking'

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'granted':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full"><CheckCircle className="w-3 h-3" />Allowed</span>
      case 'denied':
      case 'blocked':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full"><XCircle className="w-3 h-3" />Not Allowed</span>
      case 'unavailable':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full">Not Available</span>
      case 'limited':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">Limited</span>
      case 'unknown':
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-full"><AlertCircle className="w-3 h-3" />Error</span>
      default:
        return <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-full">Checking…</span>
    }
  }

  return (
    <div id="permissions" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Permissions</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Manage device access used by ReplyFlow features.
        </p>
      </div>

      <div className="space-y-4">
        {/* Location Row */}
        <div className="border border-border/20 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-sm font-medium text-foreground">Location</div>
                {getStatusBadge(location.status)}
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Required on Android while preparing Tap to Pay. ReplyFlow does not use your location for advertising or customer tracking.
              </div>
              {location.status === 'unavailable' && (
                <div className="text-xs text-muted-foreground mt-1">
                  {platform === 'web' ? 'Location permission is only available on the mobile app.' : 'Location permission is only available on Android.'}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 gap-3">
            {location.status === 'granted' && (
              <button
                onClick={() => checkLocationPermission(true)}
                disabled={isLoadingLocation}
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Check Again
              </button>
            )}

            {(location.status === 'denied' || location.status === 'limited') && (
              <>
                {location.canAskAgain !== false && (
                  <button
                    onClick={() => requestLocationPermission()}
                    disabled={isLoadingLocation}
                    className="px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Allow Location
                  </button>
                )}
                <button
                  onClick={() => checkLocationPermission(true)}
                  disabled={isLoadingLocation}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Again
                </button>
              </>
            )}

            {(location.status === 'blocked' || (location.status === 'denied' && location.canAskAgain === false)) && (
              <div className="flex-1">
                <button
                  onClick={() => checkLocationPermission(true)}
                  disabled={isLoadingLocation}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Again
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Location permission is disabled for ReplyFlow. Update it in your device settings, then return and tap Check Again.
                </p>
              </div>
            )}

            {location.status === 'granted' && location.servicesEnabled === false && (
              <div className="flex-1">
                <button
                  onClick={() => checkLocationPermission(true)}
                  disabled={isLoadingLocation}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Again
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Location Services are disabled. Enable them in your device settings, then return and tap Check Again.
                </p>
              </div>
            )}

            {location.status === 'unavailable' && (
              <div className="text-xs text-muted-foreground">
                {platform === 'web' ? 'Mobile App Required' : 'Not Available on this platform'}
              </div>
            )}

            {isLoadingLocation && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking…</span>
              </div>
            )}
          </div>
        </div>

        {/* Notifications Row */}
        <div className="border border-border/20 rounded-lg p-4">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-sm font-medium text-foreground">Notifications</div>
                {getStatusBadge(notifications.status)}
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Allow ReplyFlow to send alerts for new leads, messages, payments, appointments, and voicemail.
              </div>
              {notifications.status === 'unavailable' && (
                <div className="text-xs text-muted-foreground mt-1">
                  {platform === 'web' ? 'Push notifications require the mobile app.' : 'Notifications are not available on this platform.'}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 gap-3">
            {notifications.status === 'granted' && (
              <button
                onClick={() => checkNotificationPermission(true)}
                disabled={isLoadingNotifications}
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Check Again
              </button>
            )}

            {(notifications.status === 'denied' || notifications.status === 'limited') && (
              <>
                {notifications.canAskAgain !== false && (
                  <button
                    onClick={() => requestNotificationPermission()}
                    disabled={isLoadingNotifications}
                    className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Allow Notifications
                  </button>
                )}
                <button
                  onClick={() => checkNotificationPermission(true)}
                  disabled={isLoadingNotifications}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Again
                </button>
              </>
            )}

            {(notifications.status === 'blocked' || (notifications.status === 'denied' && notifications.canAskAgain === false)) && (
              <div className="flex-1">
                <button
                  onClick={() => checkNotificationPermission(true)}
                  disabled={isLoadingNotifications}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Check Again
                </button>
                <p className="text-xs text-muted-foreground mt-2">
                  Notifications are disabled for ReplyFlow. Update it in your device settings, then return and tap Check Again.
                </p>
              </div>
            )}

            {notifications.status === 'unavailable' && (
              <div className="text-xs text-muted-foreground">
                {platform === 'web' ? 'Mobile App Required' : 'Not Available on this platform'}
              </div>
            )}

            {notifications.error && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {notifications.error}
              </div>
            )}

            {isLoadingNotifications && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Checking…</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}