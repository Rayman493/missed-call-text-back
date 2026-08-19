import { describe, it, expect } from 'vitest'
import { getInitialsFromName, getLeadDisplayName } from '@/lib/utils'

describe('Customer Avatar Initials in Lead Detail', () => {
  describe('Phone-only customer avatar safety', () => {
    it('should return empty string for phone number that would previously show "(3"', () => {
      const phone = '(312) 555-1234'
      const initials = getInitialsFromName(phone)
      expect(initials).toBe('')
    })

    it('should return empty string for formatted phone number', () => {
      const phone = '(555) 123-4567'
      const initials = getInitialsFromName(phone)
      expect(initials).toBe('')
    })

    it('should return empty string for phone with country code', () => {
      const phone = '+1 (555) 123-4567'
      const initials = getInitialsFromName(phone)
      expect(initials).toBe('')
    })

    it('should return empty string for phone starting with digit', () => {
      const phone = '312-555-1234'
      const initials = getInitialsFromName(phone)
      expect(initials).toBe('')
    })
  })

  describe('Real customer names generate sensible initials', () => {
    it('should generate "JS" for "John Smith"', () => {
      const initials = getInitialsFromName('John Smith')
      expect(initials).toBe('JS')
    })

    it('should generate "J" for single-word name', () => {
      const initials = getInitialsFromName('John')
      expect(initials).toBe('J')
    })

    it('should handle names with special characters safely', () => {
      const initials = getInitialsFromName("John O'Brien")
      expect(initials).toBe('JO')
    })
  })

  describe('Placeholder names do not generate initials', () => {
    it('should return empty string for "Unknown"', () => {
      const initials = getInitialsFromName('Unknown')
      expect(initials).toBe('')
    })

    it('should return empty string for "Unknown Caller"', () => {
      const initials = getInitialsFromName('Unknown Caller')
      expect(initials).toBe('')
    })

    it('should return empty string for "Not collected"', () => {
      const initials = getInitialsFromName('Not collected')
      expect(initials).toBe('')
    })

    it('should return empty string for "Service Request"', () => {
      const initials = getInitialsFromName('Service Request')
      expect(initials).toBe('')
    })
  })

  describe('Integration with getLeadDisplayName', () => {
    it('should safely handle phone numbers from getLeadDisplayName', () => {
      const lead = {
        caller_phone: '555-1234',
        raw_metadata: {}
      }
      const displayName = getLeadDisplayName(lead)
      const initials = getInitialsFromName(displayName)
      // getLeadDisplayName returns formatted phone, but getInitialsFromName should reject it
      expect(initials).toBe('')
    })
  })
})