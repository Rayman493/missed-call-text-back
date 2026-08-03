import { renderHook, act, waitFor } from '@testing-library/react'
import { useNativePermissions } from '../useNativePermissions'

// Mock Capacitor
jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => false),
    getPlatform: jest.fn(() => 'web'),
  },
}))

// Mock App plugin
jest.mock('@capacitor/app', () => ({
  App: {
    addListener: jest.fn(() => Promise.resolve({ remove: jest.fn() })),
  },
}))

// Mock PushNotifications
jest.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: jest.fn(() => Promise.resolve({ receive: 'granted' })),
    requestPermissions: jest.fn(() => Promise.resolve({ receive: 'granted' })),
  },
}))

// Mock Device
jest.mock('@capacitor/device', () => ({
  Device: {
    getInfo: jest.fn(() => Promise.resolve({ osVersion: '13' })),
  },
}))

// Mock TerminalBridgeService
jest.mock('@/lib/terminal/service', () => ({
  TerminalBridgeService: {
    getInstance: jest.fn(() => ({
      checkLocationPermission: jest.fn(() => Promise.resolve({ granted: true, locationEnabled: true, canAskAgain: true })),
      requestLocationPermission: jest.fn(() => Promise.resolve({ granted: true, locationEnabled: true, canAskAgain: true })),
    })),
  },
}))

describe('useNativePermissions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should initialize with web platform', () => {
    const { result } = renderHook(() => useNativePermissions())
    
    expect(result.current.platform).toBe('web')
    expect(result.current.isNative).toBe(false)
  })

  it('should check location permission on mount', async () => {
    const { result } = renderHook(() => useNativePermissions())
    
    await waitFor(() => {
      expect(result.current.location.status).not.toBe('checking')
    })
  })

  it('should check notification permission on mount', async () => {
    const { result } = renderHook(() => useNativePermissions())
    
    await waitFor(() => {
      expect(result.current.notifications.status).not.toBe('checking')
    })
  })

  it('should handle location permission check for web platform', async () => {
    const { result } = renderHook(() => useNativePermissions())
    
    await waitFor(() => {
      expect(result.current.location.status).toBe('unavailable')
    })
  })

  it('should handle notification permission check for web platform', async () => {
    const { result } = renderHook(() => useNativePermissions())
    
    await waitFor(() => {
      expect(result.current.notifications.status).toBe('unavailable')
    })
  })

  it('should provide checkLocationPermission function', () => {
    const { result } = renderHook(() => useNativePermissions())
    
    expect(typeof result.current.checkLocationPermission).toBe('function')
  })

  it('should provide requestLocationPermission function', () => {
    const { result } = renderHook(() => useNativePermissions())
    
    expect(typeof result.current.requestLocationPermission).toBe('function')
  })

  it('should provide checkNotificationPermission function', () => {
    const { result } = renderHook(() => useNativePermissions())
    
    expect(typeof result.current.checkNotificationPermission).toBe('function')
  })

  it('should provide requestNotificationPermission function', () => {
    const { result } = renderHook(() => useNativePermissions())
    
    expect(typeof result.current.requestNotificationPermission).toBe('function')
  })
})
