/**
 * Tests for Business Hours Defaults
 */

import { describe, it, expect } from 'vitest'
import {
  DEFAULT_BUSINESS_HOURS_TIMEZONE,
  DEFAULT_BUSINESS_HOURS_START,
  DEFAULT_BUSINESS_HOURS_END,
  getBusinessHoursFieldWithDefault
} from '@/lib/out-of-office'

describe('Business Hours Defaults', () => {
  describe('Constants', () => {
    it('should have correct default timezone', () => {
      expect(DEFAULT_BUSINESS_HOURS_TIMEZONE).toBe('America/New_York')
    })

    it('should have correct default start time', () => {
      expect(DEFAULT_BUSINESS_HOURS_START).toBe('09:00')
    })

    it('should have correct default end time', () => {
      expect(DEFAULT_BUSINESS_HOURS_END).toBe('18:00')
    })
  })

  describe('getBusinessHoursFieldWithDefault', () => {
    it('should return default when value is null', () => {
      const result = getBusinessHoursFieldWithDefault(null, DEFAULT_BUSINESS_HOURS_START)
      expect(result).toBe(DEFAULT_BUSINESS_HOURS_START)
    })

    it('should return default when value is undefined', () => {
      const result = getBusinessHoursFieldWithDefault(undefined, DEFAULT_BUSINESS_HOURS_START)
      expect(result).toBe(DEFAULT_BUSINESS_HOURS_START)
    })

    it('should return default when value is empty string', () => {
      const result = getBusinessHoursFieldWithDefault('', DEFAULT_BUSINESS_HOURS_START)
      expect(result).toBe(DEFAULT_BUSINESS_HOURS_START)
    })

    it('should return value when present and non-empty', () => {
      const result = getBusinessHoursFieldWithDefault('08:30', DEFAULT_BUSINESS_HOURS_START)
      expect(result).toBe('08:30')
    })

    it('should return value when different from default', () => {
      const result = getBusinessHoursFieldWithDefault('America/Chicago', DEFAULT_BUSINESS_HOURS_TIMEZONE)
      expect(result).toBe('America/Chicago')
    })

    it('should preserve custom timezone', () => {
      const result = getBusinessHoursFieldWithDefault('America/Los_Angeles', DEFAULT_BUSINESS_HOURS_TIMEZONE)
      expect(result).toBe('America/Los_Angeles')
    })

    it('should preserve custom start time', () => {
      const result = getBusinessHoursFieldWithDefault('07:00', DEFAULT_BUSINESS_HOURS_START)
      expect(result).toBe('07:00')
    })

    it('should preserve custom end time', () => {
      const result = getBusinessHoursFieldWithDefault('19:00', DEFAULT_BUSINESS_HOURS_END)
      expect(result).toBe('19:00')
    })
  })
})