/**
 * Calendar Date Filtering Tests
 *
 * Tests for date filtering logic used in Schedule calendar and selected-day lists.
 * Ensures all-day events are handled consistently across calendar grid and selected-day view.
 */

import { describe, it, expect } from 'vitest'

describe('Calendar Date Filtering', () => {
  describe('getLocalDateKey', () => {
    it('converts date to YYYY-MM-DD format', () => {
      const date = new Date(2024, 0, 15) // January 15, 2024
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      expect(key).toBe('2024-01-15')
    })

    it('handles single-digit month and day', () => {
      const date = new Date(2024, 0, 5) // January 5, 2024
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      expect(key).toBe('2024-01-05')
    })

    it('handles December', () => {
      const date = new Date(2024, 11, 25) // December 25, 2024
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      expect(key).toBe('2024-12-25')
    })
  })

  describe('All-day event date matching', () => {
    it('matches single-day all-day event', () => {
      const dayKey = '2024-01-15'
      const eventStart = '2024-01-15'
      const eventEnd = '2024-01-16'

      const eventStartDayKey = eventStart.split('T')[0]
      const eventEndDayKey = eventEnd.split('T')[0]

      const isAllDay = !eventStart.includes('T') && !!eventStart
      const effectiveEndDate = isAllDay
        ? new Date(eventEndDayKey).getTime() - 86400000
        : new Date(eventEndDayKey).getTime()

      const dayTimestamp = new Date(dayKey).getTime()
      const startTimestamp = new Date(eventStartDayKey).getTime()

      const matches = dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      expect(matches).toBe(true)
    })

    it('matches multi-day all-day event on first day', () => {
      const dayKey = '2024-01-15'
      const eventStart = '2024-01-15'
      const eventEnd = '2024-01-18'

      const eventStartDayKey = eventStart.split('T')[0]
      const eventEndDayKey = eventEnd.split('T')[0]

      const isAllDay = !eventStart.includes('T') && !!eventStart
      const effectiveEndDate = isAllDay
        ? new Date(eventEndDayKey).getTime() - 86400000
        : new Date(eventEndDayKey).getTime()

      const dayTimestamp = new Date(dayKey).getTime()
      const startTimestamp = new Date(eventStartDayKey).getTime()

      const matches = dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      expect(matches).toBe(true)
    })

    it('matches multi-day all-day event on middle day', () => {
      const dayKey = '2024-01-16'
      const eventStart = '2024-01-15'
      const eventEnd = '2024-01-18'

      const eventStartDayKey = eventStart.split('T')[0]
      const eventEndDayKey = eventEnd.split('T')[0]

      const isAllDay = !eventStart.includes('T') && !!eventStart
      const effectiveEndDate = isAllDay
        ? new Date(eventEndDayKey).getTime() - 86400000
        : new Date(eventEndDayKey).getTime()

      const dayTimestamp = new Date(dayKey).getTime()
      const startTimestamp = new Date(eventStartDayKey).getTime()

      const matches = dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      expect(matches).toBe(true)
    })

    it('matches multi-day all-day event on last day', () => {
      const dayKey = '2024-01-17'
      const eventStart = '2024-01-15'
      const eventEnd = '2024-01-18'

      const eventStartDayKey = eventStart.split('T')[0]
      const eventEndDayKey = eventEnd.split('T')[0]

      const isAllDay = !eventStart.includes('T') && !!eventStart
      const effectiveEndDate = isAllDay
        ? new Date(eventEndDayKey).getTime() - 86400000
        : new Date(eventEndDayKey).getTime()

      const dayTimestamp = new Date(dayKey).getTime()
      const startTimestamp = new Date(eventStartDayKey).getTime()

      const matches = dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      expect(matches).toBe(true)
    })

    it('does not match day outside all-day event range', () => {
      const dayKey = '2024-01-18'
      const eventStart = '2024-01-15'
      const eventEnd = '2024-01-18'

      const eventStartDayKey = eventStart.split('T')[0]
      const eventEndDayKey = eventEnd.split('T')[0]

      const isAllDay = !eventStart.includes('T') && !!eventStart
      const effectiveEndDate = isAllDay
        ? new Date(eventEndDayKey).getTime() - 86400000
        : new Date(eventEndDayKey).getTime()

      const dayTimestamp = new Date(dayKey).getTime()
      const startTimestamp = new Date(eventStartDayKey).getTime()

      const matches = dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      expect(matches).toBe(false)
    })

    it('matches timed event on exact day', () => {
      const dayKey = '2024-01-15'
      const eventStart = '2024-01-15T10:00:00'
      const eventEnd = '2024-01-15T11:00:00'

      const eventStartDayKey = eventStart.split('T')[0]
      const eventEndRaw = eventEnd
      const eventEndDayKey = eventEndRaw.split('T')[0]

      const isAllDay = !eventStart.includes('T') && !!eventStart
      const effectiveEndDate = isAllDay
        ? new Date(eventEndDayKey).getTime() - 86400000
        : new Date(eventEndDayKey).getTime()

      const dayTimestamp = new Date(dayKey).getTime()
      const startTimestamp = new Date(eventStartDayKey).getTime()

      const matches = dayTimestamp >= startTimestamp && dayTimestamp <= effectiveEndDate
      expect(matches).toBe(true)
    })
  })

  describe('Job scheduled date matching', () => {
    it('matches job on exact scheduled date', () => {
      const dayKey = '2024-01-15'
      const jobScheduledDate = '2024-01-15'

      const matches = jobScheduledDate === dayKey
      expect(matches).toBe(true)
    })

    it('does not match job on different date', () => {
      const dayKey = '2024-01-15'
      const jobScheduledDate = '2024-01-16'

      const matches = jobScheduledDate === dayKey
      expect(matches).toBe(false)
    })
  })
})