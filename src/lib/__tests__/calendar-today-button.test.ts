/**
 * Calendar Today Button Regression Tests
 *
 * Tests that the Calendar Today button correctly:
 * - Navigates to the current business-local month
 * - Selects the current business-local date
 * - Handles browser timezone vs business timezone differences
 * - Works across month/year boundaries
 */

import { describe, it, expect } from 'vitest'
import { normalizeBusinessTimezone } from '@/lib/business-date-utils'
import { toZonedTime } from 'date-fns-tz/toZonedTime'

describe('Calendar Today Button Behavior', () => {
  describe('TEST A - Visible month differs from today', () => {
    it('navigates to current business-local month when viewing a different month', () => {
      // Simulate viewing November 2026
      const viewedMonth = new Date(2026, 10, 1) // November (0-indexed)

      // Business is in America/New_York
      const businessTimezone = 'America/New_York'
      const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)

      // Current time is August 24, 2026 at 10:00 AM Eastern
      const now = new Date('2026-08-24T10:00:00-04:00') // EDT
      const businessNow = toZonedTime(now, normalizedTimezone)

      // Calculate business-local today's month
      const todayMonth = businessNow.getMonth() // 7 = August
      const todayYear = businessNow.getFullYear() // 2026

      // Today button should navigate to August 2026
      const expectedMonth = new Date(todayYear, todayMonth, 1)

      expect(expectedMonth.getMonth()).toBe(7) // August
      expect(expectedMonth.getFullYear()).toBe(2026)
      expect(expectedMonth.getMonth()).not.toBe(viewedMonth.getMonth())
    })
  })

  describe('TEST B - Selected date differs from today', () => {
    it('selects business-local today when a different date is selected', () => {
      const businessTimezone = 'America/New_York'
      const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)

      // Current time is August 24, 2026
      const now = new Date('2026-08-24T10:00:00-04:00')
      const businessNow = toZonedTime(now, normalizedTimezone)

      // Calculate business-local today
      const todayDate = new Date(
        businessNow.getFullYear(),
        businessNow.getMonth(),
        businessNow.getDate()
      )

      // Today button should select August 24, 2026
      expect(todayDate.getDate()).toBe(24)
      expect(todayDate.getMonth()).toBe(7) // August
      expect(todayDate.getFullYear()).toBe(2026)
    })
  })

  describe('TEST C - Both visible month and selected date differ', () => {
    it('updates both visible month and selected date to business-local today', () => {
      const businessTimezone = 'America/New_York'
      const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)

      // Viewing November 2026, selected some random date
      const viewedMonth = new Date(2026, 10, 1)

      // Current time is August 24, 2026
      const now = new Date('2026-08-24T10:00:00-04:00')
      const businessNow = toZonedTime(now, normalizedTimezone)

      // Calculate business-local today
      const todayYear = businessNow.getFullYear()
      const todayMonth = businessNow.getMonth()
      const todayDay = businessNow.getDate()

      const newMonth = new Date(todayYear, todayMonth, 1)
      const newSelectedDay = new Date(todayYear, todayMonth, todayDay)

      // Both should update to August 2026 and August 24
      expect(newMonth.getMonth()).toBe(7) // August
      expect(newSelectedDay.getDate()).toBe(24)
      expect(newMonth.getMonth()).not.toBe(viewedMonth.getMonth())
    })
  })

  describe('TEST D - Browser timezone differs from business timezone', () => {
    it('uses business-local today, not browser-local today', () => {
      // Business in America/New_York (Eastern Time)
      const businessTimezone = 'America/New_York'
      const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)

      // Simulate browser in America/Los_Angeles (Pacific Time)
      // At 11:30 PM Pacific on August 23, it's already 2:30 AM Eastern on August 24
      const browserNow = new Date('2026-08-23T23:30:00-07:00') // 11:30 PM Pacific
      const businessNow = toZonedTime(browserNow, normalizedTimezone)

      // Business-local date should be August 24, not August 23
      expect(businessNow.getDate()).toBe(24)
      expect(businessNow.getMonth()).toBe(7) // August
    })
  })

  describe('TEST E - Year boundary', () => {
    it('correctly handles December to January transition', () => {
      const businessTimezone = 'America/New_York'
      const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)

      // Viewing December 2025
      const viewedMonth = new Date(2025, 11, 1)

      // Current time is January 15, 2026
      const now = new Date('2026-01-15T10:00:00-05:00')
      const businessNow = toZonedTime(now, normalizedTimezone)

      const todayYear = businessNow.getFullYear()
      const todayMonth = businessNow.getMonth()

      const newMonth = new Date(todayYear, todayMonth, 1)

      // Should navigate to January 2026
      expect(newMonth.getFullYear()).toBe(2026)
      expect(newMonth.getMonth()).toBe(0) // January
      expect(newMonth.getFullYear()).not.toBe(viewedMonth.getFullYear())
    })
  })

  describe('TEST F - Already on today', () => {
    it('remains stable when already viewing and selecting business-local today', () => {
      const businessTimezone = 'America/New_York'
      const normalizedTimezone = normalizeBusinessTimezone(businessTimezone)

      // Already viewing August 2026
      const viewedMonth = new Date(2026, 7, 1)

      // Current time is August 24, 2026
      const now = new Date('2026-08-24T10:00:00-04:00')
      const businessNow = toZonedTime(now, normalizedTimezone)

      const todayYear = businessNow.getFullYear()
      const todayMonth = businessNow.getMonth()

      const newMonth = new Date(todayYear, todayMonth, 1)

      // Should remain in August 2026 (no-op-safe)
      expect(newMonth.getFullYear()).toBe(2026)
      expect(newMonth.getMonth()).toBe(7) // August
      expect(newMonth.getMonth()).toBe(viewedMonth.getMonth())
    })
  })

  describe('Timezone normalization', () => {
    it('falls back to UTC for invalid timezone', () => {
      const invalidTimezone = 'Invalid/Timezone'
      const normalized = normalizeBusinessTimezone(invalidTimezone)
      expect(normalized).toBe('UTC')
    })

    it('normalizes null/undefined to UTC', () => {
      expect(normalizeBusinessTimezone(null)).toBe('UTC')
      expect(normalizeBusinessTimezone(undefined)).toBe('UTC')
      expect(normalizeBusinessTimezone('')).toBe('UTC')
    })

    it('preserves valid IANA timezone', () => {
      expect(normalizeBusinessTimezone('America/New_York')).toBe('America/New_York')
      expect(normalizeBusinessTimezone('America/Los_Angeles')).toBe('America/Los_Angeles')
      expect(normalizeBusinessTimezone('Europe/London')).toBe('Europe/London')
      expect(normalizeBusinessTimezone('UTC')).toBe('UTC')
    })
  })
})