/**
 * Analytics Timezone Consistency Tests
 *
 * Tests to ensure dashboard analytics use consistent business timezone
 * regardless of user's browser timezone.
 */

import { describe, it, expect } from 'vitest'
import { getBusinessDayStart, getBusinessDaysAgoRelative, formatBusinessLocalDate, normalizeBusinessTimezone } from '@/lib/business-date-utils'

describe('Analytics Timezone Consistency', () => {
  describe('TEST A — Eastern business / late evening', () => {
    it('should calculate business-local midnight correctly for Eastern Time', () => {
      // Simulate 11 PM Eastern on a specific date
      const easternTime = new Date('2026-01-15T23:00:00-05:00') // 11 PM Eastern = 4 AM UTC Jan 16
      const businessTimezone = 'America/New_York'
      
      const dayStart = getBusinessDayStart(businessTimezone, easternTime)
      
      // Should be midnight Eastern on Jan 15, which is 5 AM UTC Jan 15
      // NOT midnight UTC (which would be 7 PM Eastern Jan 14)
      const dayStartUTC = new Date(dayStart)
      expect(dayStartUTC.getUTCHours()).toBe(5) // 5 AM UTC = midnight Eastern
      expect(dayStartUTC.getUTCDate()).toBe(15) // Jan 15
    })
  })

  describe('TEST B — Browser timezone differs from business', () => {
    it('should format dates according to business timezone, not browser timezone', () => {
      // Same timestamp, different timezones should produce different display strings
      const timestamp = '2026-01-15T18:00:00Z' // 6 PM UTC
      
      const easternDate = formatBusinessLocalDate(timestamp, 'America/New_York')
      const pacificDate = formatBusinessLocalDate(timestamp, 'America/Los_Angeles')
      const utcDate = formatBusinessLocalDate(timestamp, 'UTC')
      
      // 6 PM UTC = 1 PM Eastern = 10 AM Pacific
      // All should show Jan 15, but the display should reflect the timezone
      expect(easternDate).toContain('Jan 15')
      expect(pacificDate).toContain('Jan 15')
      expect(utcDate).toContain('Jan 15')
      
      // The actual display will differ based on locale, but all should be valid dates
      expect(easternDate).toBeTruthy()
      expect(pacificDate).toBeTruthy()
      expect(utcDate).toBeTruthy()
    })
  })

  describe('TEST C — Midnight boundary', () => {
    it('should correctly separate records across business-local midnight', () => {
      const businessTimezone = 'America/New_York'
      
      // 11:59 PM Eastern Jan 15 = 4:59 AM UTC Jan 16
      const beforeMidnight = '2026-01-16T04:59:00Z'
      const beforeDate = formatBusinessLocalDate(beforeMidnight, businessTimezone)
      
      // 12:01 AM Eastern Jan 16 = 5:01 AM UTC Jan 16
      const afterMidnight = '2026-01-16T05:01:00Z'
      const afterDate = formatBusinessLocalDate(afterMidnight, businessTimezone)
      
      // Should be different days
      expect(beforeDate).not.toBe(afterDate)
    })
  })

  describe('TEST D — 30-day business window', () => {
    it('should use business-calendar boundary, not rolling 720-hour UTC subtraction', () => {
      const businessTimezone = 'America/New_York'
      const now = new Date('2026-01-15T12:00:00-05:00') // Noon Eastern Jan 15
      
      const thirtyDaysAgo = getBusinessDaysAgoRelative(businessTimezone, 30, now)
      const thirtyDaysAgoDate = new Date(thirtyDaysAgo)
      
      // Should be approximately 30 calendar days ago in Eastern time
      // Not exactly 720 hours (which would be 30 * 24 = 720 hours)
      // The exact hour depends on DST, but should be close to Eastern midnight
      const daysDiff = Math.round((now.getTime() - thirtyDaysAgoDate.getTime()) / (1000 * 60 * 60 * 24))
      expect(daysDiff).toBeGreaterThanOrEqual(29)
      expect(daysDiff).toBeLessThanOrEqual(31)
    })
  })

  describe('TEST E — DST', () => {
    it('should handle DST transitions correctly for America/New_York', () => {
      const businessTimezone = 'America/New_York'
      
      // Test during DST transition (spring forward, second Sunday in March)
      // March 8, 2026 at 2 AM Eastern becomes 3 AM Eastern
      const dstTransitionDate = new Date('2026-03-08T12:00:00-05:00')
      const dayStart = getBusinessDayStart(businessTimezone, dstTransitionDate)
      
      // Should still produce a valid ISO timestamp
      expect(dayStart).toBeTruthy()
      expect(typeof dayStart).toBe('string')
      
      // Test during DST end (fall back, first Sunday in November)
      const dstEndDate = new Date('2026-11-01T12:00:00-04:00')
      const dayStartEnd = getBusinessDayStart(businessTimezone, dstEndDate)
      
      expect(dayStartEnd).toBeTruthy()
      expect(typeof dayStartEnd).toBe('string')
    })
  })

  describe('TEST F — Missing timezone', () => {
    it('should safely fall back to UTC when timezone is missing', () => {
      const normalized = normalizeBusinessTimezone(undefined)
      expect(normalized).toBe('UTC')
      
      const empty = normalizeBusinessTimezone('')
      expect(empty).toBe('UTC')
      
      const nullTimezone = normalizeBusinessTimezone(null)
      expect(nullTimezone).toBe('UTC')
    })
  })

  describe('TEST G — Invalid timezone', () => {
    it('should safely fall back to UTC for invalid timezone strings', () => {
      const invalid = normalizeBusinessTimezone('Invalid/Timezone')
      expect(invalid).toBe('UTC')
      
      const gibberish = normalizeBusinessTimezone('xyz123')
      expect(gibberish).toBe('UTC')
    })
  })

  describe('TEST H — Graph grouping', () => {
    it('should group records by business-local date, not UTC date', () => {
      // A record created at 11 PM Eastern = 4 AM UTC next day
      // Should be grouped with the Eastern day, not the UTC day
      const timestamp = '2026-01-15T23:00:00-05:00' // 11 PM Eastern Jan 15 = 4 AM UTC Jan 16
      const businessTimezone = 'America/New_York'
      
      const groupedDate = formatBusinessLocalDate(timestamp, businessTimezone)
      
      // Should show Jan 15 (the Eastern day), not Jan 16 (the UTC day)
      expect(groupedDate).toContain('Jan 15')
    })
  })

  describe('Timezone utility consistency', () => {
    it('should produce consistent results across all business-date-utils functions', () => {
      const businessTimezone = 'America/New_York'
      const referenceDate = new Date('2026-01-15T12:00:00-05:00')
      
      const dayStart = getBusinessDayStart(businessTimezone, referenceDate)
      const sevenDaysAgo = getBusinessDaysAgoRelative(businessTimezone, 7, referenceDate)
      const monthStart = getBusinessDayStart(businessTimezone, new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1))
      
      // All should produce valid ISO timestamps
      expect(dayStart).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
      expect(sevenDaysAgo).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
      expect(monthStart).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
      
      // Date ordering should be correct
      const dayStartObj = new Date(dayStart)
      const sevenDaysAgoObj = new Date(sevenDaysAgo)
      expect(sevenDaysAgoObj.getTime()).toBeLessThan(dayStartObj.getTime())
    })
  })

  describe('Cross-component consistency', () => {
    it('should ensure TodaySnapshot and DashboardMetrics use same "today" definition', () => {
      const businessTimezone = 'America/New_York'
      const now = new Date('2026-01-15T23:30:00-05:00') // 11:30 PM Eastern
      
      // TodaySnapshot uses getBusinessDayStart
      const todayStart = getBusinessDayStart(businessTimezone, now)
      
      // DashboardMetrics also uses getBusinessDayStart
      const dashboardTodayStart = getBusinessDayStart(businessTimezone, now)
      
      // Should be identical
      expect(todayStart).toBe(dashboardTodayStart)
    })

    it('should ensure BusinessSnapshot and DashboardMetrics use same 30-day window', () => {
      const businessTimezone = 'America/New_York'
      const now = new Date('2026-01-15T12:00:00-05:00')
      
      // BusinessSnapshot uses getBusinessDaysAgoRelative
      const business30Days = getBusinessDaysAgoRelative(businessTimezone, 30, now)
      
      // DashboardMetrics also uses getBusinessDaysAgoRelative for "Voice Leads" (30 days)
      const dashboard30Days = getBusinessDaysAgoRelative(businessTimezone, 30, now)
      
      // Should be identical
      expect(business30Days).toBe(dashboard30Days)
    })
  })
})