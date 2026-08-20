import { describe, it, expect } from 'vitest'
import {
  getBusinessDayStart,
  getBusinessLocalDateString,
  getBusinessDaysAgo,
  getBusinessDaysAgoRelative,
  getBusinessMonthStart,
  normalizeBusinessTimezone
} from '../business-date-utils'

describe('Business Date Utils', () => {
  describe('getBusinessDayStart - Exact UTC Outputs', () => {
    it('UTC midnight: 2026-01-15T00:00:00Z', () => {
      const date = new Date('2026-01-15T00:00:00Z')
      const result = getBusinessDayStart('UTC', date)
      expect(result).toBe('2026-01-15T00:00:00.000Z')
    })

    it('NY winter midnight: 2026-01-15T05:00:00Z (EST)', () => {
      const date = new Date('2026-01-15T10:00:00Z') // 5:00 AM EST
      const result = getBusinessDayStart('America/New_York', date)
      expect(result).toBe('2026-01-15T05:00:00.000Z')
    })

    it('LA winter midnight: 2026-01-15T08:00:00Z (PST)', () => {
      const date = new Date('2026-01-15T16:00:00Z') // 8:00 AM PST
      const result = getBusinessDayStart('America/Los_Angeles', date)
      expect(result).toBe('2026-01-15T08:00:00.000Z')
    })

    it('NY summer midnight: 2026-07-15T04:00:00Z (EDT)', () => {
      const date = new Date('2026-07-15T08:00:00Z') // 4:00 AM EDT
      const result = getBusinessDayStart('America/New_York', date)
      expect(result).toBe('2026-07-15T04:00:00.000Z')
    })

    it('LA summer midnight: 2026-07-15T07:00:00Z (PDT)', () => {
      const date = new Date('2026-07-15T14:00:00Z') // 7:00 AM PDT
      const result = getBusinessDayStart('America/Los_Angeles', date)
      expect(result).toBe('2026-07-15T07:00:00.000Z')
    })
  })

  describe('DST Spring Forward - 23-Hour Day', () => {
    it('NY spring-forward: 2026-03-08 start at 05:00:00Z', () => {
      const date = new Date('2026-03-08T12:00:00Z')
      const result = getBusinessDayStart('America/New_York', date)
      expect(result).toBe('2026-03-08T05:00:00.000Z')
    })

    it('NY spring-forward: next day starts at 04:00:00Z (23-hour day)', () => {
      const date = new Date('2026-03-08T12:00:00Z')
      const nextDay = new Date('2026-03-09T12:00:00Z')
      const result = getBusinessDayStart('America/New_York', nextDay)
      expect(result).toBe('2026-03-09T04:00:00.000Z')
    })
  })

  describe('DST Fall Back - 25-Hour Day', () => {
    it('NY fall-back: 2026-11-01 start at 04:00:00Z', () => {
      const date = new Date('2026-11-01T12:00:00Z')
      const result = getBusinessDayStart('America/New_York', date)
      expect(result).toBe('2026-11-01T04:00:00.000Z')
    })

    it('NY fall-back: next day starts at 05:00:00Z (25-hour day)', () => {
      const date = new Date('2026-11-01T12:00:00Z')
      const nextDay = new Date('2026-11-02T12:00:00Z')
      const result = getBusinessDayStart('America/New_York', nextDay)
      expect(result).toBe('2026-11-02T05:00:00.000Z')
    })
  })

  describe('getBusinessLocalDateString - Date-Only Fields', () => {
    it('UTC: 2026-01-15T04:30:00Z -> 2026-01-15', () => {
      const date = new Date('2026-01-15T04:30:00Z')
      const result = getBusinessLocalDateString('UTC', date)
      expect(result).toBe('2026-01-15')
    })

    it('NY winter: 2026-01-15T04:30:00Z -> 2026-01-14 (11:30 PM previous day)', () => {
      const date = new Date('2026-01-15T04:30:00Z')
      const result = getBusinessLocalDateString('America/New_York', date)
      expect(result).toBe('2026-01-14')
    })

    it('LA winter: 2026-01-15T04:30:00Z -> 2026-01-14 (8:30 PM previous day)', () => {
      const date = new Date('2026-01-15T04:30:00Z')
      const result = getBusinessLocalDateString('America/Los_Angeles', date)
      expect(result).toBe('2026-01-14')
    })

    it('NY summer: 2026-07-15T04:30:00Z -> 2026-07-15 (12:30 AM same day)', () => {
      const date = new Date('2026-07-15T04:30:00Z')
      const result = getBusinessLocalDateString('America/New_York', date)
      expect(result).toBe('2026-07-15')
    })
  })

  describe('User Travel Scenario - Exact Dates', () => {
    it('NY business, 2026-08-21T02:30:00Z -> 2026-08-20 (10:30 PM NY)', () => {
      const date = new Date('2026-08-21T02:30:00Z') // Aug 20 10:30 PM NY
      const result = getBusinessLocalDateString('America/New_York', date)
      expect(result).toBe('2026-08-20')
    })

    it('NY business, 2026-08-21T04:30:00Z -> 2026-08-21 (12:30 AM NY)', () => {
      const date = new Date('2026-08-21T04:30:00Z') // Aug 21 12:30 AM NY
      const result = getBusinessLocalDateString('America/New_York', date)
      expect(result).toBe('2026-08-21')
    })
  })

  describe('getBusinessMonthStart - Exact UTC Outputs', () => {
    it('UTC month start: 2026-08-01T00:00:00Z', () => {
      const date = new Date('2026-08-15T12:00:00Z')
      const result = getBusinessMonthStart('UTC', date)
      expect(result).toBe('2026-08-01T00:00:00.000Z')
    })

    it('NY summer month start: 2026-08-01T04:00:00Z (EDT)', () => {
      const date = new Date('2026-08-15T12:00:00Z')
      const result = getBusinessMonthStart('America/New_York', date)
      expect(result).toBe('2026-08-01T04:00:00.000Z')
    })
  })

  describe('getBusinessDaysAgo - Calendar Day Semantics', () => {
    it('UTC: 7 days ago from 2026-01-15 -> 2026-01-08T00:00:00Z', () => {
      const date = new Date('2026-01-15T12:00:00Z')
      const result = getBusinessDaysAgo('UTC', 7, date)
      expect(result).toBe('2026-01-08T00:00:00.000Z')
    })
  })

  describe('getBusinessDaysAgoRelative - Rolling Time Semantics', () => {
    it('UTC: 7 days ago from 2026-01-15T14:30:00Z -> 2026-01-08T14:30:00Z', () => {
      const date = new Date('2026-01-15T14:30:00Z')
      const result = getBusinessDaysAgoRelative('UTC', 7, date)
      expect(result).toBe('2026-01-08T14:30:00.000Z')
    })
  })

  describe('Invalid Timezone Fallback', () => {
    it('normalizeBusinessTimezone: undefined -> UTC', () => {
      expect(normalizeBusinessTimezone(undefined)).toBe('UTC')
    })

    it('normalizeBusinessTimezone: null -> UTC', () => {
      expect(normalizeBusinessTimezone(null)).toBe('UTC')
    })

    it('normalizeBusinessTimezone: empty string -> UTC', () => {
      expect(normalizeBusinessTimezone('')).toBe('UTC')
    })

    it('normalizeBusinessTimezone: malformed "America/NewYork" -> UTC', () => {
      expect(normalizeBusinessTimezone('America/NewYork')).toBe('UTC')
    })

    it('normalizeBusinessTimezone: invalid "Not/A_Timezone" -> UTC', () => {
      expect(normalizeBusinessTimezone('Not/A_Timezone')).toBe('UTC')
    })

    it('normalizeBusinessTimezone: valid "America/New_York" -> unchanged', () => {
      expect(normalizeBusinessTimezone('America/New_York')).toBe('America/New_York')
    })

    it('getBusinessDayStart: invalid timezone produces UTC output', () => {
      const date = new Date('2026-01-15T10:00:00Z')
      const result = getBusinessDayStart('Not/A_Timezone', date)
      expect(result).toBe('2026-01-15T00:00:00.000Z')
    })

    it('getBusinessLocalDateString: invalid timezone produces UTC output', () => {
      const date = new Date('2026-01-15T04:30:00Z')
      const result = getBusinessLocalDateString('Not/A_Timezone', date)
      expect(result).toBe('2026-01-15')
    })

    it('getBusinessMonthStart: invalid timezone produces UTC output', () => {
      const date = new Date('2026-08-15T12:00:00Z')
      const result = getBusinessMonthStart('America/NewYork', date)
      expect(result).toBe('2026-08-01T00:00:00.000Z')
    })

    it('getBusinessDaysAgo: invalid timezone produces UTC output', () => {
      const date = new Date('2026-01-15T12:00:00Z')
      const result = getBusinessDaysAgo('ESTT', 7, date)
      expect(result).toBe('2026-01-08T00:00:00.000Z')
    })
  })
})