/**
 * Push Service Action Routing Safety Tests
 *
 * Regression tests for push notification tap routing.
 * Verifies that only safe internal relative URLs are navigated to,
 * and that malformed or external payloads fall back to /dashboard.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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

// Mock App plugin
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(() => ({ remove: vi.fn() }))
  }
}))

// Mock native permissions store
vi.mock('@/lib/native-permissions/native-permissions-store', () => ({
  nativePermissionsStore: {
    getState: vi.fn(),
    requestNotificationPermission: vi.fn(),
    subscribe: vi.fn(() => vi.fn())
  }
}))

import { pushService } from '@/lib/push-service'

describe('Push Service Action Routing', () => {
  let hrefValue = 'http://localhost'
  const mockLocation = {
    get href() { return hrefValue },
    set href(value: string) { hrefValue = value }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    hrefValue = 'http://localhost'
    vi.stubGlobal('location', mockLocation)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should navigate to safe internal lead actionUrl', () => {
    ;(pushService as any).handleNotificationActionPerformed({
      actionId: '',
      notification: {
        data: {
          actionUrl: '/dashboard/leads/lead-123',
          leadId: 'lead-123'
        }
      }
    })

    expect(window.location.href).toBe('/dashboard/leads/lead-123')
  })

  it('should navigate to safe internal calendar actionUrl', () => {
    ;(pushService as any).handleNotificationActionPerformed({
      actionId: '',
      notification: {
        data: {
          actionUrl: '/dashboard/calendar'
        }
      }
    })

    expect(window.location.href).toBe('/dashboard/calendar')
  })

  it('should reject external https URL and fall back to /dashboard', () => {
    ;(pushService as any).handleNotificationActionPerformed({
      actionId: '',
      notification: {
        data: {
          actionUrl: 'https://evil.com/phish'
        }
      }
    })

    expect(window.location.href).toBe('/dashboard')
  })

  it('should reject protocol-relative URL and fall back to /dashboard', () => {
    ;(pushService as any).handleNotificationActionPerformed({
      actionId: '',
      notification: {
        data: {
          actionUrl: '//evil.com/phish'
        }
      }
    })

    expect(window.location.href).toBe('/dashboard')
  })

  it('should reject javascript: URL and fall back to /dashboard', () => {
    ;(pushService as any).handleNotificationActionPerformed({
      actionId: '',
      notification: {
        data: {
          actionUrl: 'javascript:alert(1)'
        }
      }
    })

    expect(window.location.href).toBe('/dashboard')
  })

  it('should fall back to /dashboard when actionUrl is missing', () => {
    ;(pushService as any).handleNotificationActionPerformed({
      actionId: '',
      notification: {}
    })

    expect(window.location.href).toBe('/dashboard')
  })

  it('should not crash on malformed notification payload and fall back to /dashboard', () => {
    ;(pushService as any).handleNotificationActionPerformed(null)
    expect(window.location.href).toBe('/dashboard')

    hrefValue = 'http://localhost'
    ;(pushService as any).handleNotificationActionPerformed(undefined)
    expect(window.location.href).toBe('/dashboard')

    hrefValue = 'http://localhost'
    ;(pushService as any).handleNotificationActionPerformed({})
    expect(window.location.href).toBe('/dashboard')
  })
})
