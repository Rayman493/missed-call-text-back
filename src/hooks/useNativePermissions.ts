'use client'

import { useState, useEffect, useCallback } from 'react'
import { nativePermissionsStore } from '@/lib/native-permissions/native-permissions-store'
import type {
  NativePermissionState,
  PermissionStatus,
} from '@/lib/native-permissions/native-permissions-types'

export interface LocationPermissionState {
  status: PermissionStatus
  canAskAgain: boolean | null
  servicesEnabled: boolean | null
}

export interface NotificationPermissionState {
  status: PermissionStatus
  canAskAgain: boolean | null
}

export interface NativePermissionsState {
  platform: 'web' | 'android' | 'ios'
  isNative: boolean
  location: LocationPermissionState
  notifications: NotificationPermissionState
}

export interface NativePermissionsActions {
  checkLocationPermission: () => Promise<void>
  requestLocationPermission: () => Promise<void>
  checkNotificationPermission: () => Promise<void>
  requestNotificationPermission: () => Promise<void>
}

/**
 * React hook for native permissions
 * 
 * This hook subscribes to the shared permission store and provides
 * permission state and actions to React components.
 * 
 * All permission checking and requesting is handled by the shared store,
 * ensuring no duplicate native calls and consistent state across the app.
 */
export function useNativePermissions(): NativePermissionsState & NativePermissionsActions {
  const [state, setState] = useState<NativePermissionState>(() => nativePermissionsStore.getState())

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = nativePermissionsStore.subscribe((newState) => {
      setState(newState)
    })

    return unsubscribe
  }, [])

  // Initialize store on first mount
  useEffect(() => {
    nativePermissionsStore.initialize()
  }, [])

  // Location permission check
  const checkLocationPermission = useCallback(async () => {
    await nativePermissionsStore.checkLocationPermission()
  }, [])

  // Location permission request
  const requestLocationPermission = useCallback(async () => {
    await nativePermissionsStore.requestLocationPermission()
  }, [])

  // Notification permission check
  const checkNotificationPermission = useCallback(async () => {
    await nativePermissionsStore.checkNotificationPermission()
  }, [])

  // Notification permission request
  const requestNotificationPermission = useCallback(async () => {
    await nativePermissionsStore.requestNotificationPermission()
  }, [])

  return {
    platform: state.platform,
    isNative: state.isNative,
    location: {
      status: state.location.status,
      canAskAgain: state.location.canAskAgain,
      servicesEnabled: state.location.servicesEnabled,
    },
    notifications: {
      status: state.notifications.status,
      canAskAgain: state.notifications.canAskAgain,
    },
    checkLocationPermission,
    requestLocationPermission,
    checkNotificationPermission,
    requestNotificationPermission,
  }
}
