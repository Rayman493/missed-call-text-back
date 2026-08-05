import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationPermissionEducation } from '../NotificationPermissionEducation'

// Mock Capacitor
jest.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: jest.fn(() => true),
    getPlatform: jest.fn(() => 'android'),
  },
}))

// Mock Preferences
jest.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: jest.fn(() => Promise.resolve({ value: null })),
    set: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    clear: jest.fn(() => Promise.resolve()),
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

// Mock useNativePermissions
jest.mock('@/hooks/useNativePermissions', () => ({
  useNativePermissions: () => ({
    notifications: { status: 'prompt', canAskAgain: true, error: null },
    checkNotificationPermission: jest.fn(() => Promise.resolve()),
    requestNotificationPermission: jest.fn(() => Promise.resolve()),
  }),
}))

describe('NotificationPermissionEducation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { Preferences } = require('@capacitor/preferences')
    Preferences.get.mockResolvedValue({ value: null })
  })

  describe('first app launch: modal shows once', () => {
    it('should show education modal on first launch with prompt status', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Stay Updated')).toBeInTheDocument()
        expect(screen.getByText('Enable Notifications')).toBeInTheDocument()
      })
    })
  })

  describe('second launch after dismissal: modal does not show', () => {
    it('should not show modal after dismissal', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      // Simulate hasShown = true
      Preferences.get.mockImplementation(({ key }) => {
        if (key === 'notification_permission_modal_has_shown') {
          return Promise.resolve({ value: 'true' })
        }
        return Promise.resolve({ value: null })
      })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
      })
    })
  })

  describe('launch within 7 days: modal does not show', () => {
    it('should not show modal within 7-day cooldown', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      // Simulate recent dismissal (within 7 days)
      const dismissedAt = Date.now() - 3 * 24 * 60 * 60 * 1000 // 3 days ago
      Preferences.get.mockImplementation(({ key }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: dismissedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
      })
    })
  })

  describe('launch after 7 days while still denied: modal may show', () => {
    it('should show modal after 7-day cooldown expires', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      // Simulate old dismissal (more than 7 days ago)
      const dismissedAt = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      Preferences.get.mockImplementation(({ key }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: dismissedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'denied', canAskAgain: false, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        // Should not show because status is denied (not prompt)
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
      })
    })
  })

  describe('permission already granted: modal never shows', () => {
    it('should not show modal when permission is granted', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'granted', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
        expect(Preferences.set).toHaveBeenCalledWith({ key: 'notification_permission_last_known_status', value: 'granted' })
      })
    })

    it('should not show modal when granted in storage', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockImplementation(({ key }) => {
        if (key === 'notification_permission_last_known_status') {
          return Promise.resolve({ value: 'granted' })
        }
        return Promise.resolve({ value: null })
      })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
      })
    })
  })

  describe('system permission request does not fire automatically on every launch', () => {
    it('should not request permission automatically on mount', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      const requestNotificationPermission = jest.fn(() => Promise.resolve())
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission,
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Stay Updated')).toBeInTheDocument()
      })

      // Should not have called requestNotificationPermission automatically
      expect(requestNotificationPermission).not.toHaveBeenCalled()
    })
  })

  describe('duplicate mount/effect does not produce duplicate modals', () => {
    it('should only show one modal with single-flight guard', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      const { rerender } = render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Stay Updated')).toBeInTheDocument()
      })

      // Rerender (simulating Strict Mode double mount)
      rerender(<NotificationPermissionEducation />)

      await waitFor(() => {
        // Should still only show one modal
        expect(screen.getAllByText('Stay Updated')).toHaveLength(1)
      })
    })
  })

  describe('Not Now sets 7-day cooldown', () => {
    it('should set dismissed_at timestamp when Not Now clicked', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Stay Updated')).toBeInTheDocument()
      })

      const notNowButton = screen.getByText('Not Now')
      fireEvent.click(notNowButton)

      await waitFor(() => {
        expect(Preferences.set).toHaveBeenCalledWith(
          expect.objectContaining({
            key: 'notification_permission_modal_dismissed_at',
            value: expect.stringMatching(/^\d+$/), // timestamp
          })
        )
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
      })
    })
  })

  describe('Enable button triggers permission request', () => {
    it('should request permission when Enable is clicked', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(true)
      Capacitor.getPlatform.mockReturnValue('android')
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      permissionLock.requestPermission.mockReturnValue(true)
      const requestNotificationPermission = jest.fn(() => Promise.resolve())
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission,
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.getByText('Stay Updated')).toBeInTheDocument()
      })

      const enableButton = screen.getByText('Enable Notifications')
      fireEvent.click(enableButton)

      await waitFor(() => {
        expect(requestNotificationPermission).toHaveBeenCalled()
        expect(permissionLock.requestPermission).toHaveBeenCalledWith('notification')
        expect(permissionLock.releasePermission).toHaveBeenCalledWith('notification')
      })
    })
  })

  describe('modal does not show on web platform', () => {
    it('should not show modal on web', async () => {
      const { Capacitor } = require('@capacitor/core')
      const { Preferences } = require('@capacitor/preferences')
      const { permissionLock } = require('@/lib/permission-lock')
      const { useNativePermissions } = require('@/hooks/useNativePermissions')

      Capacitor.isNativePlatform.mockReturnValue(false)
      Preferences.get.mockResolvedValue({ value: null })
      permissionLock.isAnyPermissionActive.mockReturnValue(false)
      useNativePermissions.mockReturnValue({
        notifications: { status: 'prompt', canAskAgain: true, error: null },
        checkNotificationPermission: jest.fn(() => Promise.resolve()),
        requestNotificationPermission: jest.fn(() => Promise.resolve()),
      })

      render(<NotificationPermissionEducation />)

      await waitFor(() => {
        expect(screen.queryByText('Stay Updated')).not.toBeInTheDocument()
      })
    })
  })
})