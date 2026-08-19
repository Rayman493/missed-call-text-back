/**
 * Push Service Native Permission Lifecycle Tests
 *
 * Focused tests for automatic notification permission request behavior
 * triggered from AuthContext after authentication.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => 'ios')
  }
}))

// Mock PushNotifications plugin
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    register: vi.fn(),
    addListener: vi.fn(() => ({ remove: vi.fn() }))
  }
}))

// Mock native permissions store
vi.mock('@/lib/native-permissions/native-permissions-store', () => ({
  nativePermissionsStore: {
    getState: vi.fn(),
    requestNotificationPermission: vi.fn()
  }
}))

import { pushService } from '@/lib/push-service'
import { Capacitor } from '@capacitor/core'
import { nativePermissionsStore } from '@/lib/native-permissions/native-permissions-store'

describe('Push Service Native Permission Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset push service state
    ;(pushService as any).currentToken = null
    ;(pushService as any).accessToken = null
    ;(pushService as any).registrationStatus = 'none'
  })

  describe('Native + promptable → calls permission request', () => {
    it('should request permission when status is prompt', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'ios',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'prompt', canAskAgain: true, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      ;(nativePermissionsStore.requestNotificationPermission as any).mockResolvedValue(undefined)

      const result = await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).toHaveBeenCalledTimes(1)
    })
  })

  describe('Native + permission granted → does not request again', () => {
    it('should skip request when already granted', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'ios',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'granted', canAskAgain: true, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      const result = await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).not.toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('Native + permission denied → does not repeatedly request', () => {
    it('should skip request when denied', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'ios',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'denied', canAskAgain: false, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      const result = await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })

    it('should skip request when blocked', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'ios',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'blocked', canAskAgain: false, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      const result = await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })

  describe('Web → no native permission request', () => {
    it('should skip request on web platform', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(false)

      const result = await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).not.toHaveBeenCalled()
      expect(result).toBe(false)
    })
  })

  describe('Platform consistency', () => {
    it('should use shared native permissions store on Android', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(Capacitor.getPlatform as any).mockReturnValue('android')
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'android',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'prompt', canAskAgain: true, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).toHaveBeenCalledTimes(1)
    })

    it('should use shared native permissions store on iOS', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(Capacitor.getPlatform as any).mockReturnValue('ios')
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'ios',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'prompt', canAskAgain: true, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      await pushService.requestPermission()

      expect(nativePermissionsStore.requestNotificationPermission).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error handling', () => {
    it('should handle permission request errors gracefully', async () => {
      (Capacitor.isNativePlatform as any).mockReturnValue(true)
      ;(nativePermissionsStore.getState as any).mockReturnValue({
        platform: 'ios',
        isNative: true,
        location: { status: 'unavailable', canAskAgain: null, servicesEnabled: null, lastCheckedAt: null, error: null },
        notifications: { status: 'prompt', canAskAgain: true, lastCheckedAt: null, error: null },
        isInitialized: true,
        lastRefreshedAt: null
      })

      ;(nativePermissionsStore.requestNotificationPermission as any).mockRejectedValue(new Error('Permission failed'))

      const result = await pushService.requestPermission()

      expect(result).toBe(false)
    })
  })
})