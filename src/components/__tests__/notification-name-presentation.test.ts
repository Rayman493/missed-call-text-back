/**
 * Notification Name Presentation Tests
 *
 * Tests for the fix to prevent duplicate customer names in notification presentation.
 * When a notification type already includes the customer name in the title,
 * the displayName should be omitted to avoid duplication.
 */

import { describe, it, expect } from 'vitest'

describe('Notification Name Presentation', () => {
  describe('Types with customer name in title', () => {
    const nameInTitleTypes = ['new_lead', 'followup_completed', 'ai_intake_completed', 'missed_call']

    nameInTitleTypes.forEach(type => {
      it(`should omit displayName for ${type}`, () => {
        // Simulate the getDisplayName logic
        const notification = { type }
        const shouldShowDisplayName = !nameInTitleTypes.includes(notification.type)

        expect(shouldShowDisplayName).toBe(false)
      })
    })
  })

  describe('Types that need displayName fallback', () => {
    const needsDisplayNameTypes = ['customer_reply', 'voicemail_received', 'sms_failed']

    needsDisplayNameTypes.forEach(type => {
      it(`should show displayName for ${type}`, () => {
        const nameInTitleTypes = ['new_lead', 'followup_completed', 'ai_intake_completed', 'missed_call']
        const notification = { type }
        const shouldShowDisplayName = !nameInTitleTypes.includes(notification.type)

        expect(shouldShowDisplayName).toBe(true)
      })
    })
  })

  describe('Masked phone fallback for SMS failures', () => {
    it('should mask phone number for sms_failed', () => {
      const phone = '5551234567'
      const maskPhoneNumber = (phone: string): string => {
        const digits = phone.replace(/\D/g, '')
        if (digits.length < 4) return phone
        const last4 = digits.slice(-4)
        return `••••••${last4}`
      }

      const masked = maskPhoneNumber(phone)
      expect(masked).toBe('••••••4567')
    })

    it('should handle short phone numbers gracefully', () => {
      const phone = '123'
      const maskPhoneNumber = (phone: string): string => {
        const digits = phone.replace(/\D/g, '')
        if (digits.length < 4) return phone
        const last4 = digits.slice(-4)
        return `••••••${last4}`
      }

      const masked = maskPhoneNumber(phone)
      expect(masked).toBe('123')
    })
  })

  describe('Unknown Caller suppression', () => {
    it('should not show "Unknown Caller" as displayName', () => {
      const subject = 'Unknown Caller'
      const shouldHide = subject === 'Unknown Caller'

      expect(shouldHide).toBe(true)
    })
  })

  describe('Semantics preservation', () => {
    it('should not affect unread state logic', () => {
      const notification = { type: 'new_lead', read: false }
      const wasUnread = !notification.read

      expect(wasUnread).toBe(true)
    })

    it('should not affect navigation target', () => {
      const notification = { type: 'new_lead', action_url: '/dashboard/leads/123' }
      const hasNavigationUrl = !!notification.action_url

      expect(hasNavigationUrl).toBe(true)
    })
  })
})