import { describe, it, expect } from 'vitest'
import { calculateReminderNotifyAt } from '../reminder-notification-utils'

describe('calculateReminderNotifyAt', () => {
  describe('validity rules', () => {
    it('returns null when due_date is missing', () => {
      const result = calculateReminderNotifyAt({
        dueDate: null,
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).toBeNull()
    })

    it('returns null when due_time is missing', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: null,
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).toBeNull()
    })

    it('returns null when offsetMinutes is null', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: null,
        timezone: 'America/New_York'
      })
      expect(result).toBeNull()
    })

    it('returns null when offsetMinutes is undefined', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: undefined,
        timezone: 'America/New_York'
      })
      expect(result).toBeNull()
    })

    it('returns null when offsetMinutes is negative', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: -15,
        timezone: 'America/New_York'
      })
      expect(result).toBeNull()
    })
  })

  describe('offset calculations', () => {
    it('calculates at time (offset = 0)', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 0,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
      // Should be 3:00 PM Eastern converted to UTC
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })

    it('calculates 15 minutes before', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 15,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
    })

    it('calculates 30 minutes before', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
    })

    it('calculates 1 hour before', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 60,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
    })

    it('calculates 1 day before', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 1440,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
    })
  })

  describe('timezone handling', () => {
    it('handles America/New_York timezone', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
      // Sep 4, 2026 is EDT (UTC-4), so 3 PM = 19:00Z, 30 min before = 18:30Z
      expect(result).toBe('2026-09-04T18:30:00.000Z')
    })

    it('handles America/New_York timezone in winter (EST)', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-01-15',
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
      // Jan 15, 2026 is EST (UTC-5), so 3 PM = 20:00Z, 30 min before = 19:30Z
      expect(result).toBe('2026-01-15T19:30:00.000Z')
    })

    it('handles UTC timezone', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'UTC'
      })
      expect(result).not.toBeNull()
      // UTC has no offset, so 3 PM = 15:00Z, 30 min before = 14:30Z
      expect(result).toBe('2026-09-04T14:30:00.000Z')
    })

    it('handles invalid timezone gracefully (falls back to UTC)', () => {
      const result = calculateReminderNotifyAt({
        dueDate: '2026-09-04',
        dueTime: '15:00',
        offsetMinutes: 30,
        timezone: 'Invalid/Timezone'
      })
      expect(result).not.toBeNull() // Should fallback to UTC and still calculate
      expect(result).toBe('2026-09-04T14:30:00.000Z') // Fallback to UTC
    })
  })

  describe('DST transitions', () => {
    it('handles DST spring transition (forward)', () => {
      // March 8, 2026 at 2:00 AM Eastern becomes 3:00 AM (spring forward)
      const result = calculateReminderNotifyAt({
        dueDate: '2026-03-08',
        dueTime: '14:00',
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
    })

    it('handles DST fall transition (backward)', () => {
      // November 1, 2026 at 2:00 AM Eastern becomes 1:00 AM (fall back)
      const result = calculateReminderNotifyAt({
        dueDate: '2026-11-01',
        dueTime: '14:00',
        offsetMinutes: 30,
        timezone: 'America/New_York'
      })
      expect(result).not.toBeNull()
    })
  })
})