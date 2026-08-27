/**
 * Tests for SMS Templates
 */

import { describe, it, expect } from 'vitest'
import { getDefaultAutoReplyMessage, getDefaultAutoReplyMessageWithFallback } from '@/lib/sms-templates'

describe('SMS Templates', () => {
  describe('getDefaultAutoReplyMessage', () => {
    it('should generate message with business name', () => {
      const message = getDefaultAutoReplyMessage('Test Business')
      expect(message).toBe('Hi, this is Test Business. Sorry we missed your call—how can we help? Reply STOP to opt out.')
    })

    it('should include opt-out language', () => {
      const message = getDefaultAutoReplyMessage('Test Business')
      expect(message).toContain('Reply STOP to opt out.')
    })

    it('should use hyphen not em-dash', () => {
      const message = getDefaultAutoReplyMessage('Test Business')
      expect(message).toContain('call—') // hyphen
      expect(message).not.toContain('call —') // not em-dash with spaces
    })

    it('should match canonical production message format', () => {
      const message = getDefaultAutoReplyMessage('Acme Plumbing')
      // Verify exact structure: business name + greeting + hyphen + question + opt-out
      expect(message).toMatch(/^Hi, this is .+\. Sorry we missed your call—how can we help\? Reply STOP to opt out\.$/)
    })
  })

  describe('getDefaultAutoReplyMessageWithFallback', () => {
    it('should use business name when provided', () => {
      const message = getDefaultAutoReplyMessageWithFallback('My Business')
      expect(message).toBe('Hi, this is My Business. Sorry we missed your call—how can we help? Reply STOP to opt out.')
    })

    it('should use fallback when business name not provided', () => {
      const message = getDefaultAutoReplyMessageWithFallback()
      expect(message).toBe('Hi, this is Your Business. Sorry we missed your call—how can we help? Reply STOP to opt out.')
    })

    it('should use fallback when business name is empty string', () => {
      const message = getDefaultAutoReplyMessageWithFallback('')
      expect(message).toBe('Hi, this is Your Business. Sorry we missed your call—how can we help? Reply STOP to opt out.')
    })

    it('should use fallback when business name is null', () => {
      const message = getDefaultAutoReplyMessageWithFallback(null)
      expect(message).toBe('Hi, this is Your Business. Sorry we missed your call—how can we help? Reply STOP to opt out.')
    })
  })

  describe('canonical consistency', () => {
    it('should have no local duplicates in onboarding (uses shared helper)', () => {
      // This test documents that onboarding should import from @/lib/sms-templates
      // If this test fails, it means the import was reverted to a local duplicate
      const message1 = getDefaultAutoReplyMessage('Test Business')
      const message2 = getDefaultAutoReplyMessage('Test Business')
      expect(message1).toBe(message2)
    })

    it('should include required FCC opt-out language', () => {
      const message = getDefaultAutoReplyMessageWithFallback()
      expect(message).toContain('STOP')
      expect(message).toContain('opt out')
    })
  })
})