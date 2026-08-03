'use client'

import { useState, useEffect } from 'react'
import { Bell, MapPin, CheckCircle, XCircle, AlertCircle, Settings as SettingsIcon } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { Device } from '@capacitor/device'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { pushService } from '@/lib/push-service'

type NotificationPermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' | 'unknown' | 'not_required'
type LocationPermissionState = 'granted' | 'denied' | 'not_enabled' | 'services_off' | 'unknown' | 'not_required'

export function PermissionsSettings() {
  const [notificationState, setNotificationState] = useState<NotificationPermissionState>('unknown')
  const [locationState, setLocationState] = useState<LocationPermissionState>('unknown')
  const [isLoadingNotification, setIsLoadingNotification] = useState(false)
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [isAndroid13Plus, setIsAndroid13Plus] = useState(false)
  const [isNativeAndroid, setIsNativeAndroid] = useState(false)

  useEffect(() => {
    checkAllPermissions()
  }, [])

  const checkAllPermissions = async () => {
    await checkNotificationPermission()
    await checkLocationPermission()
  }

  const checkNotificationPermission = async () => {
    if (!Capacitor.isNativePlatform()) {
      setNotificationState('not_required')
      return
    }

    const platform = Capacitor.getPlatform()
    if (platform !== 'android') {
      setNotificationState('not_required')
      return
    }

    setIsNativeAndroid(true)

    // Check Android version
    const info = await Device.getInfo()
    const androidVersion = parseInt(info.osVersion || '0', 10)
    const isAndroid13 = androidVersion >= 33
    setIsAndroid13Plus(isAndroid13)

    if (!isAndroid13) {
      setNotificationState('not_required')
      return
    }

    // Check permission state
    console.log('[PERMISSIONS_SETTINGS] Checking notification permission state')
    const result = await PushNotifications.checkPermissions()
    console.log('[PERMISSIONS_SETTINGS] Notification state:', result.receive)
    setNotificationState(result.receive)
  }

  const checkLocationPermission = async () => {
    if (!Capacitor.isNativePlatform()) {
      setLocationState('not_required')
      return
    }

    const platform = Capacitor.getPlatform()
    if (platform !== 'android') {
      setLocationState('not_required')
      return
    }

    try {
      const terminalService = TerminalBridgeService.getInstance()
      const result = await terminalService.checkLocationPermission()
      console.log('[PERMISSIONS_SETTINGS] Location state:', result)
      
      if (result.granted && result.locationEnabled) {
        setLocationState('granted')
      } else if (result.granted && !result.locationEnabled) {
        setLocationState('services_off')
      } else if (!result.granted && result.canAskAgain) {
        setLocationState('not_enabled')
      } else {
        setLocationState('denied')
      }
    } catch (error) {
      console.error('[PERMISSIONS_SETTINGS] Failed to check location permission:', error)
      setLocationState('unknown')
    }
  }

  const handleEnableNotifications = async () => {
    setIsLoadingNotification(true)
    console.log('[PERMISSIONS_SETTINGS] User clicked Enable Notifications')

    try {
      const granted = await pushService.requestPermission()
      console.log('[PERMISSIONS_SETTINGS] Notification permission result:', granted)
      if (granted) {
        setNotificationState('granted')
      } else {
        setNotificationState('denied')
      }
    } catch (error) {
      console.error('[PERMISSIONS_SETTINGS] Failed to request notification permission:', error)
    } finally {
      setIsLoadingNotification(false)
    }
  }

  const handleEnableLocation = async () => {
    setIsLoadingLocation(true)
    console.log('[PERMISSIONS_SETTINGS] User clicked Enable Location')

    try {
      const terminalService = TerminalBridgeService.getInstance()
      const result = await terminalService.requestLocationPermission()
      console.log('[PERMISSIONS_SETTINGS] Location permission result:', result)
      
      if (result.granted && result.locationEnabled) {
        setLocationState('granted')
      } else if (result.granted && !result.locationEnabled) {
        setLocationState('services_off')
      } else {
        setLocationState('denied')
      }
    } catch (error) {
      console.error('[PERMISSIONS_SETTINGS] Failed to request location permission:', error)
    } finally {
      setIsLoadingLocation(false)
    }
  }

  const handleOpenAppSettings = async () => {
    console.log('[PERMISSIONS_SETTINGS] User clicked Open App Settings')
    try {
      window.location.href = 'app-settings:'
    } catch (error) {
      console.error('[PERMISSIONS_SETTINGS] Failed to open app settings:', error)
    }
  }

  const handleOpenLocationSettings = async () => {
    console.log('[PERMISSIONS_SETTINGS] User clicked Open Location Settings')
    try {
      // Open Android location settings
      window.location.href = 'app-settings:location'
    } catch (error) {
      console.error('[PERMISSIONS_SETTINGS] Failed to open location settings:', error)
    }
  }

  if (!isNativeAndroid) {
    return null
  }

  return (
    <div id="permissions" className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-lg border border-border/20 shadow-sm p-5 scroll-mt-[64px]">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground mb-1">Permissions</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Manage the permissions ReplyFlow needs to function properly.
        </p>
      </div>

      <div className="space-y-4">
        {/* Notifications Row */}
        {isAndroid13Plus && (
          <div className="border border-border/20 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground mb-1">Notifications</div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  Receive alerts for customer replies, AI intake calls, appointments, payments, and voicemails.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-3">
              {notificationState === 'granted' && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Enabled</span>
                </div>
              )}

              {(notificationState === 'prompt' || notificationState === 'prompt-with-rationale') && (
                <button
                  onClick={handleEnableNotifications}
                  disabled={isLoadingNotification}
                  className="px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingNotification ? 'Enabling...' : 'Enable Notifications'}
                </button>
              )}

              {notificationState === 'denied' && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                    <XCircle className="w-4 h-4" />
                    <span>Disabled</span>
                  </div>
                  <button
                    onClick={handleOpenAppSettings}
                    className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                  >
                    Open Settings
                  </button>
                </div>
              )}

              {notificationState === 'unknown' && (
                <div className="text-sm text-muted-foreground">Checking...</div>
              )}
            </div>
          </div>
        )}

        {/* Location Row */}
        <div className="border border-border/20 rounded-lg p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground mb-1">Location</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                Required only while using Tap to Pay to securely accept in-person payments.
              </div>
              <div className="text-xs text-muted-foreground mt-1 italic">
                Location is only used when preparing Tap to Pay. ReplyFlow does not use it for advertising or customer tracking.
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3">
            {locationState === 'granted' && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <CheckCircle className="w-4 h-4" />
                <span>Enabled</span>
              </div>
            )}

            {locationState === 'not_enabled' && (
              <button
                onClick={handleEnableLocation}
                disabled={isLoadingLocation}
                className="px-3 py-1.5 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingLocation ? 'Enabling...' : 'Enable Location'}
              </button>
            )}

            {locationState === 'denied' && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span>Denied</span>
                </div>
                <button
                  onClick={handleOpenAppSettings}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                >
                  Open Settings
                </button>
              </div>
            )}

            {locationState === 'services_off' && (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>Location Services Off</span>
                </div>
                <button
                  onClick={handleOpenLocationSettings}
                  className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                >
                  Open Location Settings
                </button>
              </div>
            )}

            {locationState === 'unknown' && (
              <div className="text-sm text-muted-foreground">Checking...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}