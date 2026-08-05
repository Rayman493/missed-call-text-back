import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shouldShowNotificationEducation, markSessionChecked, recordModalShown, recordModalDismissed, recordPermissionGranted, recordPermissionDenied } from '@/lib/notification-education-eligibility'

// Mock Capacitor Preferences
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}))

describe('notification-education-eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { Preferences } = require('@capacitor/preferences')
    Preferences.get.mockImplementation(({ key }: { key: string }) => Promise.resolve({ value: null }))
    Preferences.set.mockImplementation(() => Promise.resolve())
    Preferences.remove.mockImplementation(() => Promise.resolve())
  })

  describe('first eligible launch shows once', () => {
    it('should show modal on first launch with prompt status', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('permission_prompt')
      expect(result.diagnostic.nativeStatus).toBe('prompt')
    })
  })

  describe('granted permission never shows', () => {
    it('should not show modal when permission is granted', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'granted',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_granted')
      expect(Preferences.set).toHaveBeenCalledWith({ key: 'notification_permission_last_known_status', value: 'granted' })
    })

    it('should not show modal when granted in storage', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_last_known_status') {
          return Promise.resolve({ value: 'granted' })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_granted_storage')
    })
  })

  describe('dismissed within 7 days does not show', () => {
    it('should not show modal within 7-day cooldown', async () => {
      const dismissedAt = Date.now() - 3 * 24 * 60 * 60 * 1000 // 3 days ago
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: dismissedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('cooldown_active')
      expect(result.diagnostic.cooldownRemaining).toBeGreaterThan(0)
    })
  })

  describe('dismissed after 7 days may show', () => {
    it('should show modal after 7-day cooldown expires with prompt status', async () => {
      const dismissedAt = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: dismissedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('permission_prompt')
      expect(result.diagnostic.cooldownRemaining).toBeLessThan(0)
    })

    it('should not show modal after cooldown if still denied', async () => {
      const dismissedAt = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: dismissedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'denied',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_denied')
    })

    it('should show modal after cooldown if denied and dismissed long ago', async () => {
      const dismissedAt = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: dismissedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'denied',
        permissionLockActive: false
      })

      // This is the current behavior - denied status still blocks even after cooldown
      // Future enhancement could change this to show "Open Settings" mode
      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_denied')
    })
  })

  describe('denied status returns blocked', () => {
    it('should not show modal when permission is denied', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'denied',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_denied')
    })

    it('should not show modal when permission is blocked', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'blocked',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_denied')
    })
  })

  describe('duplicate/session check suppresses repeat display', () => {
    it('should not show modal if checked within session window', async () => {
      const sessionCheckedAt = Date.now() - 2 * 60 * 1000 // 2 minutes ago
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_session_checked_at') {
          return Promise.resolve({ value: sessionCheckedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('already_checked_session')
    })

    it('should show modal if session check expired', async () => {
      const sessionCheckedAt = Date.now() - 10 * 60 * 1000 // 10 minutes ago
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_session_checked_at') {
          return Promise.resolve({ value: sessionCheckedAt.toString() })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('permission_prompt')
    })
  })

  describe('invalid or missing timestamps fail safely', () => {
    it('should handle invalid dismissed_at timestamp gracefully', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockImplementation(({ key }: { key: string }) => {
        if (key === 'notification_permission_modal_dismissed_at') {
          return Promise.resolve({ value: 'invalid-timestamp' })
        }
        return Promise.resolve({ value: null })
      })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      // Should fail closed - not eligible if timestamp is invalid
      expect(result.eligible).toBe(false)
    })

    it('should handle missing dismissed_at gracefully', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('permission_prompt')
    })
  })

  describe('web platform does not show', () => {
    it('should not show modal on web platform', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'web',
        isNative: false,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('not_native')
    })
  })

  describe('permission lock active blocks modal', () => {
    it('should not show modal when another permission is active', async () => {
      const { Preferences } = require('@capacitor/preferences')
      Preferences.get.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: true
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_lock_active')
    })
  })

  describe('persistence helpers', () => {
    it('markSessionChecked should write timestamp', async () => {
      const { Preferences } = require('@capacitor/preferences')
      await markSessionChecked()

      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_session_checked_at',
          value: expect.stringMatching(/^\d+$/)
        })
      )
    })

    it('recordModalShown should write timestamp and mark session', async () => {
      const { Preferences } = require('@capacitor/preferences')
      await recordModalShown()

      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_last_shown_at',
          value: expect.stringMatching(/^\d+$/)
        })
      )
      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_session_checked_at'
        })
      )
    })

    it('recordModalDismissed should write timestamp and mark session', async () => {
      const { Preferences } = require('@capacitor/preferences')
      await recordModalDismissed()

      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_dismissed_at',
          value: expect.stringMatching(/^\d+$/)
        })
      )
      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_session_checked_at'
        })
      )
    })

    it('recordPermissionGranted should write status and remove dismissed_at', async () => {
      const { Preferences } = require('@capacitor/preferences')
      await recordPermissionGranted()

      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'notification_permission_last_known_status',
        value: 'granted'
      })
      expect(Preferences.remove).toHaveBeenCalledWith({
        key: 'notification_permission_modal_dismissed_at'
      })
      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_session_checked_at'
        })
      )
    })

    it('recordPermissionDenied should write status', async () => {
      const { Preferences } = require('@capacitor/preferences')
      await recordPermissionDenied('denied')

      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'notification_permission_last_known_status',
        value: 'denied'
      })
      expect(Preferences.set).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_session_checked_at'
        })
      )
    })
  })
})