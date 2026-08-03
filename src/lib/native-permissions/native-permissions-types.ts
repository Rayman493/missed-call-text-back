/**
 * Canonical Native Permissions Types
 * 
 * Single source of truth for permission state representation across the entire application.
 * All permission implementations must use these types.
 */

/**
 * Normalized permission status values
 * 
 * These values are used consistently across:
 * - Location permissions
 * - Notification permissions
 * - All platforms (web, Android, iOS)
 */
export type PermissionStatus =
  | 'checking'       // Currently checking permission state
  | 'granted'        // Permission granted
  | 'denied'         // Permission denied but can ask again
  | 'blocked'        // Permission permanently denied (cannot ask again)
  | 'limited'        // Partial permission granted (platform-specific)
  | 'provisional'    // Provisional permission granted (iOS notifications only)
  | 'unavailable'    // Permission not available on this platform
  | 'unknown'        // Unknown state (should be transient)

/**
 * Platform type
 */
export type Platform = 'web' | 'android' | 'ios'

/**
 * Location permission state
 */
export interface LocationPermissionState {
  status: PermissionStatus
  canAskAgain: boolean | null      // null if unknown/unsupported
  servicesEnabled: boolean | null   // GPS/location services enabled
  lastCheckedAt: number | null     // timestamp of last check
  error: string | null             // error message if check failed
}

/**
 * Notification permission state
 */
export interface NotificationPermissionState {
  status: PermissionStatus
  canAskAgain: boolean | null      // null if unknown/unsupported
  lastCheckedAt: number | null     // timestamp of last check
  error: string | null             // error message if check failed
}

/**
 * Complete native permissions state
 */
export interface NativePermissionState {
  platform: Platform
  isNative: boolean
  
  location: LocationPermissionState
  notifications: NotificationPermissionState
  
  isInitialized: boolean    // Store has been initialized
  lastRefreshedAt: number | null // timestamp of last refresh (e.g., app resume)
}

/**
 * Options for permission check operations
 */
export interface CheckPermissionOptions {
  forceRefresh?: boolean   // Bypass cache and force fresh check
  silent?: boolean         // Suppress logging/diagnostics
}

/**
 * Options for permission request operations
 */
export interface RequestPermissionOptions {
  silent?: boolean         // Suppress logging/diagnostics
}

/**
 * Result of a permission check operation
 */
export interface CheckPermissionResult {
  status: PermissionStatus
  canAskAgain: boolean | null
  servicesEnabled?: boolean | null  // Location only
  error?: string | null
  timestamp: number
}

/**
 * Result of a permission request operation
 */
export interface RequestPermissionResult {
  status: PermissionStatus
  canAskAgain: boolean | null
  servicesEnabled?: boolean | null  // Location only
  error?: string | null
  timestamp: number
}

/**
 * Permission type for locking/coordinating requests
 */
export type PermissionType = 'location' | 'notification' | 'other'

/**
 * Subscriber for permission state changes
 */
export type PermissionStateSubscriber = (state: NativePermissionState) => void

/**
 * Unsubscribe function returned by subscribe
 */
export type UnsubscribeFunction = () => void

/**
 * Diagnostic event names
 */
export enum PermissionDiagnosticEvent {
  STORE_INITIALIZED = 'NATIVE_PERMISSION_STORE_INITIALIZED',
  CHECK_STARTED = 'NATIVE_PERMISSION_CHECK_STARTED',
  CHECK_RESOLVED = 'NATIVE_PERMISSION_CHECK_RESOLVED',
  REQUEST_STARTED = 'NATIVE_PERMISSION_REQUEST_STARTED',
  REQUEST_RESOLVED = 'NATIVE_PERMISSION_REQUEST_RESOLVED',
  REQUEST_DEDUPED = 'NATIVE_PERMISSION_REQUEST_DEDUPED',
  RESUME_REFRESH = 'NATIVE_PERMISSION_RESUME_REFRESH',
  SUBSCRIBER_COUNT = 'NATIVE_PERMISSION_SUBSCRIBER_COUNT',
  CACHE_HIT = 'NATIVE_PERMISSION_CACHE_HIT',
  CACHE_BYPASS = 'NATIVE_PERMISSION_CACHE_BYPASS',
}
