/**
 * Native Permissions Store
 * 
 * Shared permission state management with caching and subscriber support.
 * 
 * Responsibilities:
 * - Current permission state cached in memory
 * - One active listener per app process
 * - One location check in flight at a time
 * - One notification check in flight at a time
 * - One location request in flight at a time
 * - One notification request in flight at a time
 * - Duplicate callers share the same Promise
 * - Subscribers receive updates
 * - No polling
 * - No repeated mount-triggered native calls
 */

import type {
  Platform,
  PermissionStatus,
  NativePermissionState,
  LocationPermissionState,
  NotificationPermissionState,
  CheckPermissionOptions,
  RequestPermissionOptions,
  PermissionStateSubscriber,
  UnsubscribeFunction,
} from './native-permissions-types'
import {
  getPlatform,
  isNativePlatform,
  checkLocationPermissionNative,
  requestLocationPermissionNative,
  checkNotificationPermissionNative,
  requestNotificationPermissionNative,
  addAppResumeListener,
} from './native-permissions-service'

// Cache duration: 10 seconds
const CACHE_DURATION_MS = 10000

/**
 * Initial permission state
 */
function getInitialState(): NativePermissionState {
  const platform = getPlatform()
  return {
    platform,
    isNative: isNativePlatform(),
    location: {
      status: 'checking',
      canAskAgain: null,
      servicesEnabled: null,
      lastCheckedAt: null,
      error: null,
    },
    notifications: {
      status: 'checking',
      canAskAgain: null,
      lastCheckedAt: null,
      error: null,
    },
    isInitialized: false,
    lastRefreshedAt: null,
  }
}

/**
 * Native Permissions Store (Singleton)
 */
class NativePermissionsStore {
  private state: NativePermissionState = getInitialState()
  private subscribers: Set<PermissionStateSubscriber> = new Set()
  private locationCheckPromise: Promise<void> | null = null
  private notificationCheckPromise: Promise<void> | null = null
  private locationRequestPromise: Promise<void> | null = null
  private notificationRequestPromise: Promise<void> | null = null
  private isInitialized = false
  private resumeListenerRemover: (() => Promise<void>) | null = null

  /**
   * Initialize the store
   * Should be called once during app initialization
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Initializing')
    }

    this.isInitialized = true
    this.state.isInitialized = true

    // Perform initial permission checks
    await this.refreshAllPermissions({ silent: true })

    // Set up app resume listener (only on native)
    if (isNativePlatform()) {
      this.resumeListenerRemover = await this.setupResumeListener()
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Initialized', {
        platform: this.state.platform,
        location: this.state.location.status,
        notifications: this.state.notifications.status,
        subscriberCount: this.subscribers.size,
      })
    }
  }

  /**
   * Set up app resume listener
   */
  private async setupResumeListener(): Promise<() => Promise<void>> {
    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Setting up resume listener')
    }

    const { remove } = await addAppResumeListener(async () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] App resumed, refreshing permissions')
      }

      await this.refreshAllPermissions({ forceRefresh: true, silent: true })

      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Resume refresh complete')
      }
    })

    return remove
  }

  /**
   * Get current permission state
   */
  getState(): NativePermissionState {
    return { ...this.state }
  }

  /**
   * Subscribe to permission state changes
   */
  subscribe(subscriber: PermissionStateSubscriber): UnsubscribeFunction {
    this.subscribers.add(subscriber)

    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Subscriber added', { count: this.subscribers.size })
    }

    // Immediately call with current state
    subscriber(this.getState())

    // Return unsubscribe function
    return () => {
      this.subscribers.delete(subscriber)
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Subscriber removed', { count: this.subscribers.size })
      }
    }
  }

  /**
   * Notify all subscribers of state change
   */
  private notifySubscribers(): void {
    const state = this.getState()
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(state)
      } catch (error) {
        console.error('[NativePermissionsStore] Subscriber error:', error)
      }
    })

    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Notified subscribers', { count: this.subscribers.size })
    }
  }

  /**
   * Update location state
   */
  private updateLocationState(updates: Partial<LocationPermissionState>): void {
    this.state.location = { ...this.state.location, ...updates }
    this.notifySubscribers()
  }

  /**
   * Update notification state
   */
  private updateNotificationState(updates: Partial<NotificationPermissionState>): void {
    this.state.notifications = { ...this.state.notifications, ...updates }
    this.notifySubscribers()
  }

  /**
   * Check if cache is still valid
   */
  private isCacheValid(lastCheckedAt: number | null): boolean {
    if (!lastCheckedAt) return false
    const now = Date.now()
    return now - lastCheckedAt < CACHE_DURATION_MS
  }

  /**
   * Check location permission (with caching and deduplication)
   */
  async checkLocationPermission(options?: CheckPermissionOptions): Promise<void> {
    // If a check is already in flight, wait for it
    if (this.locationCheckPromise) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Location check deduped')
      }
      return this.locationCheckPromise
    }

    // Check cache if not forcing refresh
    if (!options?.forceRefresh && this.isCacheValid(this.state.location.lastCheckedAt)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Location check cache hit')
      }
      return
    }

    // Start new check
    this.locationCheckPromise = (async () => {
      try {
        this.updateLocationState({ status: 'checking', error: null })

        const result = await checkLocationPermissionNative(options)

        this.updateLocationState({
          status: result.status,
          canAskAgain: result.canAskAgain,
          servicesEnabled: result.servicesEnabled ?? null,
          lastCheckedAt: result.timestamp,
          error: result.error,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[NativePermissionsStore] Location check failed:', error)
        this.updateLocationState({
          status: 'unknown',
          error: errorMessage,
        })
      } finally {
        this.locationCheckPromise = null
      }
    })()

    return this.locationCheckPromise
  }

  /**
   * Request location permission (with deduplication)
   */
  async requestLocationPermission(options?: RequestPermissionOptions): Promise<void> {
    // If a request is already in flight, wait for it
    if (this.locationRequestPromise) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Location request deduped')
      }
      return this.locationRequestPromise
    }

    // Start new request
    this.locationRequestPromise = (async () => {
      try {
        this.updateLocationState({ status: 'checking', error: null })

        const result = await requestLocationPermissionNative(options)

        this.updateLocationState({
          status: result.status,
          canAskAgain: result.canAskAgain,
          servicesEnabled: result.servicesEnabled ?? null,
          lastCheckedAt: result.timestamp,
          error: result.error,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[NativePermissionsStore] Location request failed:', error)
        this.updateLocationState({
          status: 'unknown',
          error: errorMessage,
        })
      } finally {
        this.locationRequestPromise = null
      }
    })()

    return this.locationRequestPromise
  }

  /**
   * Check notification permission (with caching and deduplication)
   */
  async checkNotificationPermission(options?: CheckPermissionOptions): Promise<void> {
    // If a check is already in flight, wait for it
    if (this.notificationCheckPromise) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Notification check deduped')
      }
      return this.notificationCheckPromise
    }

    // Check cache if not forcing refresh
    if (!options?.forceRefresh && this.isCacheValid(this.state.notifications.lastCheckedAt)) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Notification check cache hit')
      }
      return
    }

    // Start new check
    this.notificationCheckPromise = (async () => {
      try {
        this.updateNotificationState({ status: 'checking', error: null })

        const result = await checkNotificationPermissionNative(options)

        this.updateNotificationState({
          status: result.status,
          canAskAgain: result.canAskAgain,
          lastCheckedAt: result.timestamp,
          error: result.error,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[NativePermissionsStore] Notification check failed:', error)
        this.updateNotificationState({
          status: 'unknown',
          error: errorMessage,
        })
      } finally {
        this.notificationCheckPromise = null
      }
    })()

    return this.notificationCheckPromise
  }

  /**
   * Request notification permission (with deduplication)
   */
  async requestNotificationPermission(options?: RequestPermissionOptions): Promise<void> {
    // If a request is already in flight, wait for it
    if (this.notificationRequestPromise) {
      if (process.env.NODE_ENV === 'development') {
        console.log('[NativePermissionsStore] Notification request deduped')
      }
      return this.notificationRequestPromise
    }

    // Start new request
    this.notificationRequestPromise = (async () => {
      try {
        this.updateNotificationState({ status: 'checking', error: null })

        const result = await requestNotificationPermissionNative(options)

        this.updateNotificationState({
          status: result.status,
          canAskAgain: result.canAskAgain,
          lastCheckedAt: result.timestamp,
          error: result.error,
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error('[NativePermissionsStore] Notification request failed:', error)
        this.updateNotificationState({
          status: 'unknown',
          error: errorMessage,
        })
      } finally {
        this.notificationRequestPromise = null
      }
    })()

    return this.notificationRequestPromise
  }

  /**
   * Refresh all permissions (e.g., on app resume)
   */
  async refreshAllPermissions(options?: CheckPermissionOptions): Promise<void> {
    this.state.lastRefreshedAt = Date.now()

    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Refreshing all permissions')
    }

    // Refresh both permissions in parallel
    await Promise.all([
      this.checkLocationPermission({ ...options, forceRefresh: true }),
      this.checkNotificationPermission({ ...options, forceRefresh: true }),
    ])
  }

  /**
   * Cleanup (for testing or app shutdown)
   */
  async cleanup(): Promise<void> {
    if (this.resumeListenerRemover) {
      await this.resumeListenerRemover()
      this.resumeListenerRemover = null
    }
    this.subscribers.clear()
    this.isInitialized = false

    if (process.env.NODE_ENV === 'development') {
      console.log('[NativePermissionsStore] Cleaned up')
    }
  }
}

// Singleton instance
const store = new NativePermissionsStore()

/**
 * Public API for the permissions store
 */
export const nativePermissionsStore = {
  /**
   * Initialize the store
   */
  initialize: () => store.initialize(),

  /**
   * Get current permission state
   */
  getState: () => store.getState(),

  /**
   * Subscribe to permission state changes
   */
  subscribe: (subscriber: PermissionStateSubscriber) => store.subscribe(subscriber),

  /**
   * Check location permission
   */
  checkLocationPermission: (options?: CheckPermissionOptions) => 
    store.checkLocationPermission(options),

  /**
   * Request location permission
   */
  requestLocationPermission: (options?: RequestPermissionOptions) => 
    store.requestLocationPermission(options),

  /**
   * Check notification permission
   */
  checkNotificationPermission: (options?: CheckPermissionOptions) => 
    store.checkNotificationPermission(options),

  /**
   * Request notification permission
   */
  requestNotificationPermission: (options?: RequestPermissionOptions) => 
    store.requestNotificationPermission(options),

  /**
   * Refresh all permissions
   */
  refreshAllPermissions: (options?: CheckPermissionOptions) => 
    store.refreshAllPermissions(options),

  /**
   * Cleanup (for testing)
   */
  cleanup: () => store.cleanup(),
}
