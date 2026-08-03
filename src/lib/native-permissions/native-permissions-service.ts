/**
 * Native Permissions Service
 * 
 * This is the ONLY file that may directly call:
 * - Terminal plugin location permission methods
 * - TerminalBridgeService location methods
 * - PushNotifications.checkPermissions()
 * - PushNotifications.requestPermissions()
 * - App.addListener('resume') for permission refresh
 * 
 * All other files must use the shared store/hook.
 */

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { App } from '@capacitor/app'
import { TerminalBridgeService } from '@/lib/terminal/service'
import type {
  Platform,
  PermissionStatus,
  CheckPermissionResult,
  RequestPermissionResult,
  CheckPermissionOptions,
  RequestPermissionOptions,
} from './native-permissions-types'

/**
 * Get the current platform
 */
export function getPlatform(): Platform {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios') return 'ios'
  if (platform === 'android') return 'android'
  return 'web'
}

/**
 * Check if running on native platform
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

/**
 * Emit a diagnostic event
 */
function emitDiagnostic(event: string, data?: any) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[NativePermissionsService] ${event}`, data || '')
  }
}

/**
 * Create a timeout promise that rejects after specified milliseconds
 */
export function createTimeoutPromise<T>(ms: number, operation: string): Promise<T> {
  return new Promise<T>((_, reject) => {
    const timeoutId = setTimeout(() => {
      const error = new Error(`${operation} timeout after ${ms}ms`)
      error.name = 'TimeoutError'
      reject(error)
    }, ms)
    
    // Don't leak timer if promise is somehow cancelled
    if (typeof timeoutId.unref === 'function') {
      timeoutId.unref()
    }
  })
}

/**
 * Normalize Capacitor notification permission status to canonical status
 */
function normalizeNotificationStatus(
  capacitorStatus: string,
  canAskAgain: boolean | null
): PermissionStatus {
  switch (capacitorStatus) {
    case 'granted':
      return 'granted'
    case 'denied':
      // Only mark as blocked if we know for sure it can't be asked again
      return canAskAgain === false ? 'blocked' : 'denied'
    case 'prompt':
    case 'prompt-with-rationale':
      return 'checking'
    default:
      return 'unknown'
  }
}

/**
 * Normalize Terminal location permission result to canonical status
 */
function normalizeLocationStatus(
  granted: boolean,
  canAskAgain: boolean | null,
  locationEnabled: boolean | null
): { status: PermissionStatus; canAskAgain: boolean | null } {
  if (!granted) {
    // Permission not granted
    if (canAskAgain === false) {
      return { status: 'blocked', canAskAgain: false }
    }
    return { status: 'denied', canAskAgain: canAskAgain ?? true }
  }

  // Permission granted
  if (locationEnabled === false) {
    // Permission granted but services disabled
    return { status: 'denied', canAskAgain: true }
  }

  return { status: 'granted', canAskAgain: true }
}

/**
 * Check location permission (direct native bridge call)
 */
export async function checkLocationPermissionNative(
  options?: CheckPermissionOptions
): Promise<CheckPermissionResult> {
  const platform = getPlatform()
  const timestamp = Date.now()

  // Web: location permission is not applicable
  if (!isNativePlatform()) {
    emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'location', platform, status: 'unavailable' })
    return {
      status: 'unavailable',
      canAskAgain: null,
      servicesEnabled: null,
      error: null,
      timestamp,
    }
  }

  // iOS: location permission is not supported for Tap to Pay
  if (platform === 'ios') {
    emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'location', platform, status: 'unavailable' })
    return {
      status: 'unavailable',
      canAskAgain: null,
      servicesEnabled: null,
      error: null,
      timestamp,
    }
  }

  if (!options?.silent) {
    emitDiagnostic('NATIVE_PERMISSION_CHECK_STARTED', { type: 'location', platform })
  }

  try {
    const terminalService = TerminalBridgeService.getInstance()
    const result = await terminalService.checkLocationPermission()

    const { status, canAskAgain } = normalizeLocationStatus(
      result.granted,
      result.canAskAgain ?? null,
      result.locationEnabled ?? null
    )

    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'location', platform, status, canAskAgain })
    }

    return {
      status,
      canAskAgain,
      servicesEnabled: result.locationEnabled ?? null,
      error: null,
      timestamp,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'location', platform, error: errorMessage })
    }

    return {
      status: 'unknown',
      canAskAgain: null,
      servicesEnabled: null,
      error: errorMessage,
      timestamp,
    }
  }
}

/**
 * Request location permission (direct native bridge call)
 */
export async function requestLocationPermissionNative(
  options?: RequestPermissionOptions
): Promise<RequestPermissionResult> {
  const platform = getPlatform()
  const timestamp = Date.now()

  // Web: location permission is not applicable
  if (!isNativePlatform()) {
    return {
      status: 'unavailable',
      canAskAgain: null,
      servicesEnabled: null,
      error: null,
      timestamp,
    }
  }

  // iOS: location permission is not supported for Tap to Pay
  if (platform === 'ios') {
    return {
      status: 'unavailable',
      canAskAgain: null,
      servicesEnabled: null,
      error: null,
      timestamp,
    }
  }

  if (!options?.silent) {
    emitDiagnostic('NATIVE_PERMISSION_REQUEST_STARTED', { type: 'location', platform })
  }

  try {
    const terminalService = TerminalBridgeService.getInstance()
    const result = await terminalService.requestLocationPermission()

    // After requesting, check location services
    let servicesEnabled = null
    if (result.granted) {
      const checkResult = await terminalService.checkLocationPermission()
      servicesEnabled = checkResult.locationEnabled ?? null
    }

    const { status, canAskAgain } = normalizeLocationStatus(
      result.granted,
      result.canAskAgain ?? null,
      servicesEnabled
    )

    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_REQUEST_RESOLVED', { type: 'location', platform, status, canAskAgain })
    }

    return {
      status,
      canAskAgain,
      servicesEnabled,
      error: null,
      timestamp,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_REQUEST_RESOLVED', { type: 'location', platform, error: errorMessage })
    }

    return {
      status: 'unknown',
      canAskAgain: null,
      servicesEnabled: null,
      error: errorMessage,
      timestamp,
    }
  }
}

/**
 * Check notification permission (direct native bridge call)
 */
export async function checkNotificationPermissionNative(
  options?: CheckPermissionOptions
): Promise<CheckPermissionResult> {
  const platform = getPlatform()
  const timestamp = Date.now()

  // Web: notification permission is not applicable
  if (!isNativePlatform()) {
    emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'notification', platform, status: 'unavailable' })
    return {
      status: 'unavailable',
      canAskAgain: null,
      error: null,
      timestamp,
    }
  }

  if (!options?.silent) {
    emitDiagnostic('NATIVE_PERMISSION_CHECK_STARTED', { type: 'notification', platform })
  }

  try {
    const result = await PushNotifications.checkPermissions()
    const receiveStatus = result.receive
    
    // Determine canAskAgain from the status
    let canAskAgain: boolean | null = null
    if (receiveStatus === 'denied') {
      // Capacitor doesn't provide canAskAgain for notifications
      // We'll assume it's false for now, but this could be platform-specific
      canAskAgain = false
    } else if (receiveStatus === 'granted') {
      canAskAgain = true
    }

    const status = normalizeNotificationStatus(receiveStatus, canAskAgain)

    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'notification', platform, status, receiveStatus })
    }

    return {
      status,
      canAskAgain,
      error: null,
      timestamp,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_CHECK_RESOLVED', { type: 'notification', platform, error: errorMessage })
    }

    return {
      status: 'unknown',
      canAskAgain: null,
      error: errorMessage,
      timestamp,
    }
  }
}

/**
 * Request notification permission (direct native bridge call)
 */
export async function requestNotificationPermissionNative(
  options?: RequestPermissionOptions
): Promise<RequestPermissionResult> {
  const platform = getPlatform()
  const timestamp = Date.now()

  // Web: notification permission is not applicable
  if (!isNativePlatform()) {
    return {
      status: 'unavailable',
      canAskAgain: null,
      error: null,
      timestamp,
    }
  }

  if (!options?.silent) {
    emitDiagnostic('NATIVE_PERMISSION_REQUEST_STARTED', { type: 'notification', platform })
  }

  try {
    // First check current state
    const currentResult = await PushNotifications.checkPermissions()
    
    // If already granted, return early
    if (currentResult.receive === 'granted') {
      if (!options?.silent) {
        emitDiagnostic('NATIVE_PERMISSION_REQUEST_RESOLVED', { type: 'notification', platform, status: 'granted', already: true })
      }
      return {
        status: 'granted',
        canAskAgain: true,
        error: null,
        timestamp,
      }
    }

    // If denied, don't request again
    if (currentResult.receive === 'denied') {
      if (!options?.silent) {
        emitDiagnostic('NATIVE_PERMISSION_REQUEST_RESOLVED', { type: 'notification', platform, status: 'blocked', already: true })
      }
      return {
        status: 'blocked',
        canAskAgain: false,
        error: null,
        timestamp,
      }
    }

    // Request permission
    const result = await PushNotifications.requestPermissions()
    const receiveStatus = result.receive
    
    let canAskAgain: boolean | null = null
    if (receiveStatus === 'denied') {
      canAskAgain = false
    } else if (receiveStatus === 'granted') {
      canAskAgain = true
    }

    const status = normalizeNotificationStatus(receiveStatus, canAskAgain)

    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_REQUEST_RESOLVED', { type: 'notification', platform, status, receiveStatus })
    }

    return {
      status,
      canAskAgain,
      error: null,
      timestamp,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!options?.silent) {
      emitDiagnostic('NATIVE_PERMISSION_REQUEST_RESOLVED', { type: 'notification', platform, error: errorMessage })
    }

    return {
      status: 'unknown',
      canAskAgain: null,
      error: errorMessage,
      timestamp,
    }
  }
}

/**
 * Add app resume listener for permission refresh
 * This should only be called once in the store initialization
 */
export async function addAppResumeListener(
  callback: () => void
): Promise<{ remove: () => Promise<void> }> {
  if (!isNativePlatform()) {
    // Return no-op for web
    return { remove: async () => {} }
  }

  const listener = await App.addListener('resume', callback)
  return { remove: async () => listener.remove() }
}
