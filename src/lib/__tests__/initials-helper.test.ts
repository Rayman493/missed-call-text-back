import { describe, it, expect } from 'vitest'
import { getInitialsFromName } from '../utils'

describe('getInitialsFromName', () => {
  describe('Full real name → expected initials', () => {
    it('should generate "JS" from "John Smith"', () => {
      expect(getInitialsFromName('John Smith')).toBe('JS')
    })

    it('should generate "JD" from "Jane Doe"', () => {
      expect(getInitialsFromName('Jane Doe')).toBe('JD')
    })

    it('should generate "MJ" from "Mary Johnson"', () => {
      expect(getInitialsFromName('Mary Johnson')).toBe('MJ')
    })

    it('should handle three-part names', () => {
      expect(getInitialsFromName('John A. Smith')).toBe('JS')
    })

    it('should handle names with middle names', () => {
      expect(getInitialsFromName('Michael James Johnson')).toBe('MJ')
    })
  })

  describe('One-word real name → one initial', () => {
    it('should generate "J" from "John"', () => {
      expect(getInitialsFromName('John')).toBe('J')
    })

    it('should generate "M" from "Mary"', () => {
      expect(getInitialsFromName('Mary')).toBe('M')
    })

    it('should generate "S" from "Smith"', () => {
      expect(getInitialsFromName('Smith')).toBe('S')
    })
  })

  describe('Phone-only customer → generic avatar', () => {
    it('should return empty string for E.164 phone number', () => {
      expect(getInitialsFromName('+15551234567')).toBe('')
    })

    it('should return empty string for formatted phone number', () => {
      expect(getInitialsFromName('(555) 123-4567')).toBe('')
    })

    it('should return empty string for phone with spaces', () => {
      expect(getInitialsFromName('555 123 4567')).toBe('')
    })

    it('should return empty string for phone starting with +1', () => {
      expect(getInitialsFromName('+1 (555) 123-4567')).toBe('')
    })
  })

  describe('Parentheses/digits cannot become initials', () => {
    it('should return empty string for "(3"', () => {
      expect(getInitialsFromName('(3')).toBe('')
    })

    it('should return empty string for phone-like string', () => {
      expect(getInitialsFromName('312-555-1234')).toBe('')
    })

    it('should return empty string for string starting with digit', () => {
      expect(getInitialsFromName('123ABC')).toBe('')
    })

    it('should return empty string for string with only digits and parentheses', () => {
      expect(getInitialsFromName('(123)')).toBe('')
    })
  })

  describe('Placeholder names → generic avatar', () => {
    it('should return empty string for "Unknown"', () => {
      expect(getInitialsFromName('Unknown')).toBe('')
    })

    it('should return empty string for "Unknown Caller"', () => {
      expect(getInitialsFromName('Unknown Caller')).toBe('')
    })

    it('should return empty string for "Not collected"', () => {
      expect(getInitialsFromName('Not collected')).toBe('')
    })

    it('should return empty string for "Not Provided"', () => {
      expect(getInitialsFromName('Not Provided')).toBe('')
    })

    it('should return empty string for "N/A"', () => {
      expect(getInitialsFromName('N/A')).toBe('')
    })

    it('should return empty string for "Caller"', () => {
      expect(getInitialsFromName('Caller')).toBe('')
    })

    it('should return empty string for "Customer"', () => {
      expect(getInitialsFromName('Customer')).toBe('')
    })

    it('should return empty string for "Service Request"', () => {
      expect(getInitialsFromName('Service Request')).toBe('')
    })

    it('should return empty string for "General Service"', () => {
      expect(getInitialsFromName('General Service')).toBe('')
    })
  })

  describe('Edge cases', () => {
    it('should return empty string for null', () => {
      expect(getInitialsFromName(null)).toBe('')
    })

    it('should return empty string for undefined', () => {
      expect(getInitialsFromName(undefined)).toBe('')
    })

    it('should return empty string for empty string', () => {
      expect(getInitialsFromName('')).toBe('')
    })

    it('should return empty string for whitespace only', () => {
      expect(getInitialsFromName('   ')).toBe('')
    })

    it('should handle names with special characters in the middle', () => {
      expect(getInitialsFromName('John O\'Brien')).toBe('JO')
    })

    it('should handle names with hyphens', () => {
      expect(getInitialsFromName('Mary-Jane Smith')).toBe('MS')
    })

    it('should filter out non-alphabetic words', () => {
      expect(getInitialsFromName('John 123 Smith')).toBe('JS')
    })

    it('should be case-insensitive for placeholders', () => {
      expect(getInitialsFromName('UNKNOWN')).toBe('')
      expect(getInitialsFromName('unknown')).toBe('')
      expect(getInitialsFromName('Unknown')).toBe('')
    })
  })
})