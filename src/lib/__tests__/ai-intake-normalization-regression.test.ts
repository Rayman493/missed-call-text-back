/**
 * AI Intake Normalization Regression Tests
 *
 * Tests for specific display normalization issues:
 * 1. Spoken ZIP codes displaying as words
 * 2. Malformed punctuation like "The. AC is not working"
 */

import { describe, it, expect } from 'vitest'
import { normalizeAddress, normalizeAdditionalDetails } from '../ai-intake-formatter'

describe('AI Intake Normalization Regression Tests', () => {
  describe('SPOKEN ZIP CODE NORMALIZATION', () => {
    it('should normalize standalone spoken ZIP "one five one two nine" to "15129"', () => {
      const input = 'one five one two nine'
      const result = normalizeAddress(input)
      expect(result).toBe('15129')
    })

    it('should normalize standalone spoken ZIP "one five two oh seven" to "15207"', () => {
      const input = 'one five two oh seven'
      const result = normalizeAddress(input)
      expect(result).toBe('15207')
    })

    it('should normalize standalone spoken ZIP "oh two one three nine" to "02139"', () => {
      const input = 'oh two one three nine'
      const result = normalizeAddress(input)
      expect(result).toBe('02139')
    })

    it('should normalize spoken ZIP in address context with comma', () => {
      const input = '123 Main Street, one five one two nine'
      const result = normalizeAddress(input)
      expect(result).toBe('123 Main Street, 15129')
    })

    it('should normalize "oh" to zero in ZIP codes', () => {
      const input = '123 Main Street, one five two oh seven'
      const result = normalizeAddress(input)
      expect(result).toBe('123 Main Street, 15207')
    })

    it('should preserve already-correct ZIP "15129"', () => {
      const input = '15129'
      const result = normalizeAddress(input)
      expect(result).toBe('15129')
    })

    it('should NOT convert four spoken digits "one two three four"', () => {
      const input = 'one two three four'
      const result = normalizeAddress(input)
      // Not a valid ZIP (only 4 digits), should not be converted
      expect(result).not.toBe('1234')
    })

    it('should NOT convert six spoken digits "one two three four five six"', () => {
      const input = 'one two three four five six'
      const result = normalizeAddress(input)
      // Not a valid ZIP (6 digits), should not be converted
      expect(result).not.toBe('123456')
    })
  })

  describe('MALFORMED PUNCTUATION NORMALIZATION', () => {
    it('should repair "The. AC is not working" to "The AC is not working"', () => {
      const input = 'The. AC is not working'
      const result = normalizeAdditionalDetails(input)
      expect(result).toBe('The AC is not working')
    })

    it('should preserve legitimate "Yes. The AC is not working."', () => {
      const input = 'Yes. The AC is not working.'
      const result = normalizeAdditionalDetails(input)
      expect(result).toBe('Yes. The AC is not working.')
    })

    it('should preserve legitimate "No. The breaker is fine."', () => {
      const input = 'No. The breaker is fine.'
      const result = normalizeAdditionalDetails(input)
      expect(result).toBe('No. The breaker is fine.')
    })

    it('should preserve AC abbreviation without inserting period', () => {
      const input = 'The AC unit is not cooling'
      const result = normalizeAdditionalDetails(input)
      expect(result).toBe('The AC unit is not cooling')
    })

    it('should preserve HVAC abbreviation without inserting period', () => {
      const input = 'The HVAC system needs repair'
      const result = normalizeAdditionalDetails(input)
      expect(result).toBe('The HVAC system needs repair')
    })

    it('should preserve normal multi-sentence text', () => {
      const input = 'The AC is broken. The breaker is fine.'
      const result = normalizeAdditionalDetails(input)
      expect(result).toBe('The AC is broken. The breaker is fine.')
    })
  })
})