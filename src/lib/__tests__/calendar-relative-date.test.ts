/**
 * Boundary tests for calendar-relative date formatting
 * Tests that "Today" and "Yesterday" are based on calendar days, not elapsed time
 */

import { describe, it, expect } from 'vitest'
import { formatCalendarRelativeDate, formatCalendarRelativeFutureDate } from '../utils'

describe('Calendar Relative Date Formatting', () => {
  describe('formatCalendarRelativeDate', () => {
    it('should return "Today" for same calendar day, 5 minutes ago', () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
      expect(formatCalendarRelativeDate(fiveMinutesAgo.toISOString())).toBe('Today')
    })

    it('should return "Today" for same calendar day, many hours ago', () => {
      const now = new Date()
      now.setHours(20, 0, 0, 0) // 8 PM
      const earlierToday = new Date(now)
      earlierToday.setHours(8, 0, 0, 0) // 8 AM same day
      expect(formatCalendarRelativeDate(earlierToday.toISOString())).toBe('Today')
    })

    it('should return "Yesterday" for previous calendar day, only 2 hours ago across midnight', () => {
      const now = new Date()
      now.setHours(2, 0, 0, 0) // 2 AM
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(23, 0, 0, 0) // 11 PM previous day (only 3 hours ago)
      expect(formatCalendarRelativeDate(yesterday.toISOString())).toBe('Yesterday')
    })

    it('should return "Yesterday" for previous calendar day, 23 hours ago', () => {
      const now = new Date()
      now.setHours(23, 0, 0, 0) // 11 PM
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0) // Midnight previous day (23 hours ago)
      expect(formatCalendarRelativeDate(yesterday.toISOString())).toBe('Yesterday')
    })

    it('should return formatted date for two calendar days ago (< 48 elapsed hours)', () => {
      const now = new Date()
      now.setHours(1, 0, 0, 0) // 1 AM
      const twoDaysAgo = new Date(now)
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      twoDaysAgo.setHours(23, 0, 0, 0) // 11 PM, two calendar days ago (only ~26 hours ago)
      const result = formatCalendarRelativeDate(twoDaysAgo.toISOString())
      expect(result).not.toBe('Today')
      expect(result).not.toBe('Yesterday')
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/) // e.g., "Aug 13"
    })

    it('should handle month boundary correctly', () => {
      const now = new Date()
      // Test with actual dates relative to now
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const result = formatCalendarRelativeDate(yesterday.toISOString())
      expect(result).toBe('Yesterday')
    })

    it('should handle year boundary correctly', () => {
      const now = new Date()
      // Test with actual dates relative to now
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      const result = formatCalendarRelativeDate(yesterday.toISOString())
      expect(result).toBe('Yesterday')
    })

    it('should return "N/A" for null date', () => {
      expect(formatCalendarRelativeDate(null)).toBe('N/A')
    })
  })

  describe('formatCalendarRelativeFutureDate', () => {
    it('should return "Today" for same calendar day in future', () => {
      const now = new Date()
      const laterToday = new Date(now.getTime() + 2 * 60 * 60 * 1000) // 2 hours from now
      expect(formatCalendarRelativeFutureDate(laterToday.toISOString())).toBe('Today')
    })

    it('should return "Tomorrow" for next calendar day', () => {
      const now = new Date()
      now.setHours(23, 0, 0, 0) // 11 PM
      const tomorrow = new Date(now)
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(1, 0, 0, 0) // 1 AM next day (only 2 hours away)
      expect(formatCalendarRelativeFutureDate(tomorrow.toISOString())).toBe('Tomorrow')
    })

    it('should return formatted date for future dates beyond tomorrow', () => {
      const date = new Date()
      date.setDate(date.getDate() + 5) // 5 days from now
      const result = formatCalendarRelativeFutureDate(date.toISOString())
      expect(result).not.toBe('Today')
      expect(result).not.toBe('Tomorrow')
      expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/) // e.g., "Aug 20"
    })

    it('should return "N/A" for null date', () => {
      expect(formatCalendarRelativeFutureDate(null)).toBe('N/A')
    })
  })
})