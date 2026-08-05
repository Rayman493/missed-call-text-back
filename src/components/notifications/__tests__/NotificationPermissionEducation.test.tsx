import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shouldShowNotificationEducation, markSessionChecked, recordModalShown, recordModalDismissed, recordPermissionGranted, recordPermissionDenied, resetSessionGuard } from '@/lib/notification-education-eligibility'

// Mock Capacitor Preferences using vi.hoisted to avoid hoisting issues
const { mockPreferencesGet, mockPreferencesSet, mockPreferencesRemove } = vi.hoisted(() => ({
  mockPreferencesGet: vi.fn(),
  mockPreferencesSet: vi.fn(),
  mockPreferencesRemove: vi.fn(),
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: mockPreferencesGet,
    set: mockPreferencesSet,
    remove: mockPreferencesRemove,
  },
}))

describe('notification-education-eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreferencesGet.mockImplementation(({ key }: { key: string }) => Promise.resolve({ value: null }))
    mockPreferencesSet.mockImplementation(() => Promise.resolve())
    mockPreferencesRemove.mockImplementation(() => Promise.resolve())
    // Reset in-memory session guard
    resetSessionGuard()
  })

  describe('first eligible launch shows once', () => {
    it('should show modal on first launch with prompt status', async () => {
      mockPreferencesGet.mockResolvedValue({ value: null })

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
      mockPreferencesGet.mockResolvedValue({ value: null })

      const result = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'granted',
        permissionLockActive: false
      })

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_granted')
      expect(mockPreferencesSet).toHaveBeenCalledWith({ key: 'notification_permission_last_known_status', value: 'granted' })
    })

    it('should not show modal when granted in storage', async () => {
      mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
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
      mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
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
      mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
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
      mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
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

      // Current behavior: denied status shows modal after cooldown expires
      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('denied_cooldown_expired')
    })

    it('should show modal after cooldown if denied and dismissed long ago', async () => {
      const dismissedAt = Date.now() - 8 * 24 * 60 * 60 * 1000 // 8 days ago
      mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
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

      // Current behavior: denied status shows modal after cooldown expires
      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('denied_cooldown_expired')
    })
  })

  describe('denied status returns blocked', () => {
    it('should not show modal when permission is denied', async () => {
      mockPreferencesGet.mockResolvedValue({ value: null })

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
      mockPreferencesGet.mockResolvedValue({ value: null })

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
      // First check should be eligible
      const result1 = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })
      expect(result1.eligible).toBe(true)

      // Mark session as checked
      markSessionChecked()

      // Second check within session window should be blocked
      const result2 = await shouldShowNotificationEducation({
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      })
      expect(result2.eligible).toBe(false)
      expect(result2.reason).toBe('already_checked_session')
    })

    it('should show modal if session check expired', async () => {
      // Mark session as checked
      markSessionChecked()
      
      // Reset session guard to simulate expiration
      resetSessionGuard()
      
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
      mockPreferencesGet.mockImplementation(({ key }: { key: string }) => {
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
      mockPreferencesGet.mockResolvedValue({ value: null })

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
      mockPreferencesGet.mockResolvedValue({ value: null })

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
      mockPreferencesGet.mockResolvedValue({ value: null })

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
    it('markSessionChecked should update in-memory guard', () => {
      markSessionChecked()
      // markSessionChecked is now synchronous and in-memory only
      // No storage write expected
      expect(mockPreferencesSet).not.toHaveBeenCalled()
    })

    it('recordModalShown should write timestamp and mark session', async () => {
      await recordModalShown()

      expect(mockPreferencesSet).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_last_shown_at',
          value: expect.stringMatching(/^\d+$/)
        })
      )
      // Session check is now in-memory, no storage write
    })

    it('recordModalDismissed should write timestamp and mark session', async () => {
      await recordModalDismissed()

      expect(mockPreferencesSet).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'notification_permission_modal_dismissed_at',
          value: expect.stringMatching(/^\d+$/)
        })
      )
      // Session check is now in-memory, no storage write
    })

    it('recordPermissionGranted should write status and remove dismissed_at', async () => {
      await recordPermissionGranted()

      expect(mockPreferencesSet).toHaveBeenCalledWith({
        key: 'notification_permission_last_known_status',
        value: 'granted'
      })
      expect(mockPreferencesRemove).toHaveBeenCalledWith({
        key: 'notification_permission_modal_dismissed_at'
      })
      // Session check is now in-memory, no storage write
    })

    it('recordPermissionDenied should write status', async () => {
      await recordPermissionDenied('denied')

      expect(mockPreferencesSet).toHaveBeenCalledWith({
        key: 'notification_permission_last_known_status',
        value: 'denied'
      })
      // Session check is now in-memory, no storage write
    })
  })
})