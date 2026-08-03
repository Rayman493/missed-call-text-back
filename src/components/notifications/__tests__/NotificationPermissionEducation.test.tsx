import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationPermissionEducation } from '../NotificationPermissionEducation'

// Mock Capacitor
jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => true),
    getPlatform: jest.fn(() => 'android'),
  },
}))

// Mock Device
jest.mock('@capacitor/device', () => ({
  Device: {
    getInfo: jest.fn(() => Promise.resolve({ osVersion: '33' })),
  },
}))

// Mock PushNotifications
jest.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: jest.fn(() => Promise.resolve({ receive: 'prompt' })),
    requestPermissions: jest.fn(() => Promise.resolve({ receive: 'granted' })),
  },
}))

// Mock pushService
jest.mock('@/lib/push-service', () => ({
  pushService: {
    requestPermission: jest.fn(() => Promise.resolve(true)),
    register: jest.fn(() => Promise.resolve()),
  },
}))

// Mock permissionLock
jest.mock('@/lib/permission-lock', () => ({
  permissionLock: {
    requestPermission: jest.fn(() => true),
    releasePermission: jest.fn(() => {}),
    isAnyPermissionActive: jest.fn(() => false),
  },
}))

describe('NotificationPermissionEducation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
  })

  describe('fresh authenticated Android user', () => {
    it('should show education modal when permission is prompt', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })
    })
  })

  describe('education does not show before authentication', () => {
    it('should not show on web platform', async () => {
      const { Capacitor } = require('@capacitor/core')
      Capacitor.isNativePlatform.mockReturnValue(false)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
      })
    })

    it('should not show on iOS', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('ios')
      Device.getInfo.mockResolvedValue({ osVersion: '17' })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
      })
    })
  })

  describe('Enable triggers one permission request', () => {
    it('should request permission when Enable is clicked', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')
      const { pushService } = require('@/lib/push-service')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      permissionLock.requestPermission.mockReturnValue(true)
      pushService.requestPermission.mockResolvedValue(true)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })

      const enableButton = screen.getByText('Enable Notifications')
      fireEvent.click(enableButton)

      await waitFor(() => {
        expect(pushService.requestPermission).toHaveBeenCalledTimes(1)
        expect(permissionLock.requestPermission).toHaveBeenCalledWith('notification')
        expect(permissionLock.releasePermission).toHaveBeenCalledWith('notification')
      })
    })
  })

  describe('granted result registers push', () => {
    it('should register push when permission is granted', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')
      const { pushService } = require('@/lib/push-service')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      permissionLock.requestPermission.mockReturnValue(true)
      pushService.requestPermission.mockResolvedValue(true)
      pushService.register.mockResolvedValue()

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })

      const enableButton = screen.getByText('Enable Notifications')
      fireEvent.click(enableButton)

      await waitFor(() => {
        expect(pushService.register).toHaveBeenCalled()
      })
    })
  })

  describe('denied result shows Settings recovery', () => {
    it('should show Settings button when permission is denied', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')
      const { pushService } = require('@/lib/push-service')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      permissionLock.requestPermission.mockReturnValue(true)
      pushService.requestPermission.mockResolvedValue(false)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })

      const enableButton = screen.getByText('Enable Notifications')
      fireEvent.click(enableButton)

      await waitFor(() => {
        expect(screen.getByText('Open Settings')).toBeInTheDocument()
      })
    })
  })

  describe('Not Now dismisses without requesting', () => {
    it('should dismiss without requesting when Not Now is clicked', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')
      const { pushService } = require('@/lib/push-service')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })

      const notNowButton = screen.getByText('Not Now')
      fireEvent.click(notNowButton)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
        expect(pushService.requestPermission).not.toHaveBeenCalled()
      })
    })
  })

  describe('Not Now does not permanently block Settings enablement', () => {
    it('should allow enabling after Not Now', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)

      // First render - show education
      const { rerender } = render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })

      // Click Not Now
      const notNowButton = screen.getByText('Not Now')
      fireEvent.click(notNowButton)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
      })

      // Clear cooldown to simulate time passing
      localStorage.removeItem('notification_education_cooldown')

      // Second render - should show again (simulating new session)
      rerender(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
      })
    })
  })

  describe('already granted skips education and registers', () => {
    it('should not show education when already granted', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')
      const { pushService } = require('@/lib/push-service')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'granted' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      pushService.register.mockResolvedValue()

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
        expect(pushService.register).toHaveBeenCalled()
      })
    })
  })

  describe('no overlap with Tap to Pay location permission', () => {
    it('should not show education when Tap to Pay is active', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { permissionLock } = require('@/lib/permission-lock')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      permissionLock.isAnyPermissionActive.mockReturnValue(true)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
      })
    })
  })

  describe('rerenders/navigation do not show duplicate education', () => {
    it('should only show education once per session', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)

      const { rerender } = render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })

      // Rerender
      rerender(<NotificationPermissionEducation />)

      await waitFor(() => {
        // Should still show because it's the same component instance
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })
    })
  })

  describe('install-over still checks native permission', () => {
    it('should check native permission state even with cooldown', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')

      // Set cooldown
      const cooldownEnd = Date.now() + 24 * 60 * 60 * 1000
      localStorage.setItem('notification_education_cooldown', cooldownEnd.toString())

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'granted' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(PushNotifications.checkPermissions).toHaveBeenCalled()
        expect(screen.queryByText('Enable notifications')).not.toBeInTheDocument()
      })
    })
  })

  describe('true fresh install behaves like first run', () => {
    it('should show education on fresh install', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Device } = require('@capacitor/device')
      const { PushNotifications } = require('@capacitor/push-notifications')
      const { permissionLock } = require('@/lib/permission-lock')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Device.getInfo.mockResolvedValue({ osVersion: '33' })
      PushNotifications.checkPermissions.mockResolvedValue({ receive: 'prompt' })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Enable notifications')).toBeInTheDocument()
      })
    })
  })
})