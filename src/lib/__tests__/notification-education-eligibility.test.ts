/**
 * Notification Education Eligibility Tests
 *
 * Tests for notification education modal eligibility under the new automatic permission lifecycle.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  shouldShowNotificationEducation,
  resetSessionGuard,
  type EligibilityInput
} from '@/lib/notification-education-eligibility'

describe('Notification Education Eligibility', () => {
  beforeEach(() => {
    resetSessionGuard()
  })

  describe('Automatic permission handling for promptable states', () => {
    it('should NOT show modal when permission is prompt (automatic handling covers this)', async () => {
      const input: EligibilityInput = {
        platform: 'ios',
        isNative: true,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('automatic_handling_covers_prompt')
    })

    it('should NOT show modal when permission is unknown (automatic handling covers this)', async () => {
      const input: EligibilityInput = {
        platform: 'android',
        isNative: true,
        nativePermissionStatus: 'unknown',
        permissionLockActive: false
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('automatic_handling_covers_prompt')
    })
  })

  describe('Recovery UX for denied/blocked states', () => {
    it('should show modal when permission is denied (recovery UX)', async () => {
      const input: EligibilityInput = {
        platform: 'ios',
        isNative: true,
        nativePermissionStatus: 'denied',
        permissionLockActive: false
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('permission_denied_recovery')
    })

    it('should show modal when permission is blocked (recovery UX)', async () => {
      const input: EligibilityInput = {
        platform: 'ios',
        isNative: true,
        nativePermissionStatus: 'blocked',
        permissionLockActive: false
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(true)
      expect(result.reason).toBe('permission_denied_recovery')
    })
  })

  describe('Granted permission', () => {
    it('should NOT show modal when permission is granted', async () => {
      const input: EligibilityInput = {
        platform: 'ios',
        isNative: true,
        nativePermissionStatus: 'granted',
        permissionLockActive: false
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_granted')
    })
  })

  describe('Platform guards', () => {
    it('should NOT show modal on web platform', async () => {
      const input: EligibilityInput = {
        platform: 'web',
        isNative: false,
        nativePermissionStatus: 'prompt',
        permissionLockActive: false
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('not_native')
    })

    it('should NOT show modal when another permission is active', async () => {
      const input: EligibilityInput = {
        platform: 'ios',
        isNative: true,
        nativePermissionStatus: 'denied',
        permissionLockActive: true
      }

      const result = await shouldShowNotificationEducation(input)

      expect(result.eligible).toBe(false)
      expect(result.reason).toBe('permission_lock_active')
    })
  })
})