/**
 * Out of Office Timezone Tests
 *
 * Tests for timezone handling in Out of Office datetime values
 * Ensures that datetime values are correctly converted between business timezone and UTC
 */

import { describe, it, expect } from 'vitest'
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

describe('Out of Office Timezone Handling', () => {
  describe('Eastern Timezone (America/New_York)', () => {
    it('should convert Eastern datetime to UTC correctly', () => {
      // User enters: 08/28/2026 05:00 PM Eastern (EDT, UTC-4)
      const businessTimezone = 'America/New_York'
      const easternDate = new Date('2026-08-28T17:00:00')

      // Convert to UTC
      const utcDate = fromZonedTime(easternDate, businessTimezone)

      // Expected: 08/28/2026 09:00 PM UTC (UTC+0)
      expect(utcDate.toISOString()).toBe('2026-08-28T21:00:00.000Z')
    })

    it('should convert UTC back to Eastern datetime correctly', () => {
      // Database stores: 2026-08-28T21:00:00.000Z (UTC)
      const businessTimezone = 'America/New_York'
      const utcDate = new Date('2026-08-28T21:00:00.000Z')

      // Convert to Eastern
      const easternDate = toZonedTime(utcDate, businessTimezone)

      // Expected: 08/28/2026 05:00 PM Eastern
      expect(easternDate.getFullYear()).toBe(2026)
      expect(easternDate.getMonth()).toBe(7) // August (0-indexed)
      expect(easternDate.getDate()).toBe(28)
      expect(easternDate.getHours()).toBe(17)
      expect(easternDate.getMinutes()).toBe(0)
    })

    it('should handle Eastern Standard Time (EST, UTC-5)', () => {
      // Winter date: 01/15/2026 05:00 PM Eastern (EST, UTC-5)
      const businessTimezone = 'America/New_York'
      const easternDate = new Date('2026-01-15T17:00:00')

      const utcDate = fromZonedTime(easternDate, businessTimezone)

      // Expected: 01/15/2026 10:00 PM UTC (UTC+0)
      expect(utcDate.toISOString()).toBe('2026-01-15T22:00:00.000Z')
    })
  })

  describe('Pacific Timezone (America/Los_Angeles)', () => {
    it('should convert Pacific datetime to UTC correctly', () => {
      // User enters: 08/28/2026 05:00 PM Pacific (PDT, UTC-7)
      const businessTimezone = 'America/Los_Angeles'
      const pacificDate = new Date('2026-08-28T17:00:00')

      const utcDate = fromZonedTime(pacificDate, businessTimezone)

      // Expected: 08/29/2026 12:00 AM UTC (UTC+0)
      expect(utcDate.toISOString()).toBe('2026-08-29T00:00:00.000Z')
    })

    it('should convert UTC back to Pacific datetime correctly', () => {
      // Database stores: 2026-08-29T00:00:00.000Z (UTC)
      const businessTimezone = 'America/Los_Angeles'
      const utcDate = new Date('2026-08-29T00:00:00.000Z')

      const pacificDate = toZonedTime(utcDate, businessTimezone)

      // Expected: 08/28/2026 05:00 PM Pacific
      expect(pacificDate.getFullYear()).toBe(2026)
      expect(pacificDate.getMonth()).toBe(7) // August (0-indexed)
      expect(pacificDate.getDate()).toBe(28)
      expect(pacificDate.getHours()).toBe(17)
      expect(pacificDate.getMinutes()).toBe(0)
    })

    it('should handle Pacific Standard Time (PST, UTC-8)', () => {
      // Winter date: 01/15/2026 05:00 PM Pacific (PST, UTC-8)
      const businessTimezone = 'America/Los_Angeles'
      const pacificDate = new Date('2026-01-15T17:00:00')

      const utcDate = fromZonedTime(pacificDate, businessTimezone)

      // Expected: 01/16/2026 01:00 AM UTC (UTC+0)
      expect(utcDate.toISOString()).toBe('2026-01-16T01:00:00.000Z')
    })
  })

  describe('DST Transition Dates', () => {
    it('should handle spring forward (DST start) correctly', () => {
      // DST starts second Sunday in March (March 8, 2026 at 2:00 AM)
      // Before DST: 2026-03-08T01:30:00 EST (UTC-5)
      const businessTimezone = 'America/New_York'
      const beforeDST = new Date('2026-03-08T01:30:00')

      const utcBeforeDST = fromZonedTime(beforeDST, businessTimezone)
      expect(utcBeforeDST.toISOString()).toBe('2026-03-08T06:30:00.000Z')

      // After DST: 2026-03-08T03:30:00 EDT (UTC-4) - clocks jumped forward
      const afterDST = new Date('2026-03-08T03:30:00')

      const utcAfterDST = fromZonedTime(afterDST, businessTimezone)
      expect(utcAfterDST.toISOString()).toBe('2026-03-08T07:30:00.000Z')
    })

    it('should handle fall back (DST end) correctly', () => {
      // DST ends first Sunday in November (November 1, 2026 at 2:00 AM)
      // Before DST end: 2026-11-01T01:30:00 EDT (UTC-4)
      const businessTimezone = 'America/New_York'
      const beforeDSTEnd = new Date('2026-11-01T01:30:00')

      const utcBeforeDSTEnd = fromZonedTime(beforeDSTEnd, businessTimezone)
      expect(utcBeforeDSTEnd.toISOString()).toBe('2026-11-01T05:30:00.000Z')

      // After DST end: 2026-11-01T01:30:00 EST (UTC-5) - clocks fell back
      const afterDSTEnd = new Date('2026-11-01T01:30:00')

      const utcAfterDSTEnd = fromZonedTime(afterDSTEnd, businessTimezone)
      expect(utcAfterDSTEnd.toISOString()).toBe('2026-11-01T05:30:00.000Z')
    })
  })

  describe('Round-Trip Preservation', () => {
    it('should preserve Eastern datetime through round-trip', () => {
      const businessTimezone = 'America/New_York'
      const originalEasternDate = new Date('2026-08-28T17:00:00')

      // Convert to UTC (save)
      const utcDate = fromZonedTime(originalEasternDate, businessTimezone)

      // Convert back to Eastern (load)
      const restoredEasternDate = toZonedTime(utcDate, businessTimezone)

      // Should match original
      expect(restoredEasternDate.getFullYear()).toBe(originalEasternDate.getFullYear())
      expect(restoredEasternDate.getMonth()).toBe(originalEasternDate.getMonth())
      expect(restoredEasternDate.getDate()).toBe(originalEasternDate.getDate())
      expect(restoredEasternDate.getHours()).toBe(originalEasternDate.getHours())
      expect(restoredEasternDate.getMinutes()).toBe(originalEasternDate.getMinutes())
    })

    it('should preserve Pacific datetime through round-trip', () => {
      const businessTimezone = 'America/Los_Angeles'
      const originalPacificDate = new Date('2026-08-28T17:00:00')

      const utcDate = fromZonedTime(originalPacificDate, businessTimezone)
      const restoredPacificDate = toZonedTime(utcDate, businessTimezone)

      expect(restoredPacificDate.getFullYear()).toBe(originalPacificDate.getFullYear())
      expect(restoredPacificDate.getMonth()).toBe(originalPacificDate.getMonth())
      expect(restoredPacificDate.getDate()).toBe(originalPacificDate.getDate())
      expect(restoredPacificDate.getHours()).toBe(originalPacificDate.getHours())
      expect(restoredPacificDate.getMinutes()).toBe(originalPacificDate.getMinutes())
    })

    it('should preserve datetime across DST boundary', () => {
      const businessTimezone = 'America/New_York'
      const originalDate = new Date('2026-03-08T12:00:00') // Noon on DST start day

      const utcDate = fromZonedTime(originalDate, businessTimezone)
      const restoredDate = toZonedTime(utcDate, businessTimezone)

      expect(restoredDate.getFullYear()).toBe(originalDate.getFullYear())
      expect(restoredDate.getMonth()).toBe(originalDate.getMonth())
      expect(restoredDate.getDate()).toBe(originalDate.getDate())
      expect(restoredDate.getHours()).toBe(originalDate.getHours())
      expect(restoredDate.getMinutes()).toBe(originalDate.getMinutes())
    })
  })

  describe('Other Timezones', () => {
    it('should handle Central Timezone (America/Chicago)', () => {
      const businessTimezone = 'America/Chicago'
      const centralDate = new Date('2026-08-28T17:00:00')

      const utcDate = fromZonedTime(centralDate, businessTimezone)
      const restoredCentralDate = toZonedTime(utcDate, businessTimezone)

      expect(restoredCentralDate.getHours()).toBe(17)
    })

    it('should handle Mountain Timezone (America/Denver)', () => {
      const businessTimezone = 'America/Denver'
      const mountainDate = new Date('2026-08-28T17:00:00')

      const utcDate = fromZonedTime(mountainDate, businessTimezone)
      const restoredMountainDate = toZonedTime(utcDate, businessTimezone)

      expect(restoredMountainDate.getHours()).toBe(17)
    })
  })
})