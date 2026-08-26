import { describe, it, expect } from 'vitest'
import { getLocalDateKey, getTodayLocalDateKey, formatTime12Hour, formatEventTimeRange } from './calendar-date-utils'

describe('getLocalDateKey', () => {
  it('should return YYYY-MM-DD format', () => {
    const date = new Date(2024, 0, 15) // January 15, 2024
    expect(getLocalDateKey(date)).toBe('2024-01-15')
  })

  it('should handle single-digit months with leading zero', () => {
    const date = new Date(2024, 0, 15) // January
    expect(getLocalDateKey(date)).toMatch(/^2024-0\d-15$/)
  })

  it('should handle single-digit days with leading zero', () => {
    const date = new Date(2024, 5, 5) // June 5, 2024
    expect(getLocalDateKey(date)).toMatch(/^2024-06-0\d$/)
  })

  it('should not shift dates due to UTC conversion', () => {
    // Late evening in local time should NOT shift to next day
    // This test uses a fixed date that would shift if UTC conversion was used
    const date = new Date(2024, 0, 15, 23, 59, 59) // Jan 15, 2024 11:59:59 PM local
    const key = getLocalDateKey(date)
    // Should be Jan 15, not Jan 16 (which would happen with UTC conversion in some timezones)
    expect(key).toBe('2024-01-15')
  })

  it('should handle early morning without shifting to previous day', () => {
    // Early morning in local time should NOT shift to previous day
    const date = new Date(2024, 0, 15, 0, 0, 1) // Jan 15, 2024 12:00:01 AM local
    const key = getLocalDateKey(date)
    // Should be Jan 15, not Jan 14
    expect(key).toBe('2024-01-15')
  })

  it('should be idempotent - same date produces same key', () => {
    const date = new Date(2024, 5, 15)
    const key1 = getLocalDateKey(date)
    const key2 = getLocalDateKey(new Date(date)) // Clone the date
    expect(key1).toBe(key2)
  })

  it('should handle leap year dates correctly', () => {
    const date = new Date(2024, 1, 29) // February 29, 2024 (leap year)
    expect(getLocalDateKey(date)).toBe('2024-02-29')
  })

  it('should handle end of month correctly', () => {
    const date = new Date(2024, 0, 31) // January 31, 2024
    expect(getLocalDateKey(date)).toBe('2024-01-31')
  })

  it('should handle end of year correctly', () => {
    const date = new Date(2024, 11, 31) // December 31, 2024
    expect(getLocalDateKey(date)).toBe('2024-12-31')
  })
})

describe('getTodayLocalDateKey', () => {
  it('should return a valid YYYY-MM-DD string', () => {
    const key = getTodayLocalDateKey()
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('should use getLocalDateKey internally', () => {
    const today = new Date()
    const key1 = getTodayLocalDateKey()
    const key2 = getLocalDateKey(today)
    expect(key1).toBe(key2)
  })
})

describe('formatTime12Hour', () => {
  it('should convert 15:00:00 to 3:00 PM', () => {
    expect(formatTime12Hour('15:00:00')).toBe('3:00 PM')
  })

  it('should convert 15:00 to 3:00 PM', () => {
    expect(formatTime12Hour('15:00')).toBe('3:00 PM')
  })

  it('should convert 03:05:00 to 3:05 AM', () => {
    expect(formatTime12Hour('03:05:00')).toBe('3:05 AM')
  })

  it('should convert 12:00:00 to 12:00 PM', () => {
    expect(formatTime12Hour('12:00:00')).toBe('12:00 PM')
  })

  it('should convert 00:00:00 to 12:00 AM', () => {
    expect(formatTime12Hour('00:00:00')).toBe('12:00 AM')
  })

  it('should convert 23:59:59 to 11:59 PM', () => {
    expect(formatTime12Hour('23:59:59')).toBe('11:59 PM')
  })

  it('should return empty string for null input', () => {
    expect(formatTime12Hour(null)).toBe('')
  })

  it('should return empty string for empty string', () => {
    expect(formatTime12Hour('')).toBe('')
  })

  it('should not show seconds in output', () => {
    const result = formatTime12Hour('15:30:45')
    expect(result).not.toContain('45')
    expect(result).toBe('3:30 PM')
  })

  it('should handle single-digit minutes correctly', () => {
    expect(formatTime12Hour('09:05:00')).toBe('9:05 AM')
  })
})

describe('formatEventTimeRange', () => {
  it('should format 7:00 PM – 8:00 PM range correctly', () => {
    const start = '2024-01-15T19:00:00'
    const end = '2024-01-15T20:00:00'
    expect(formatEventTimeRange(start, end, null)).toBe('7:00 PM – 8:00 PM')
  })

  it('should preserve minutes in 7:30 PM – 8:45 PM range', () => {
    const start = '2024-01-15T19:30:00'
    const end = '2024-01-15T20:45:00'
    expect(formatEventTimeRange(start, end, null)).toBe('7:30 PM – 8:45 PM')
  })

  it('should return start time only when end time is missing', () => {
    const start = '2024-01-15T19:00:00'
    expect(formatEventTimeRange(start, null, null)).toBe('7:00 PM')
  })

  it('should return start time only when end time is malformed', () => {
    const start = '2024-01-15T19:00:00'
    const end = 'invalid-date'
    expect(formatEventTimeRange(start, end, null)).toBe('7:00 PM')
  })

  it('should return start time only when end time is null', () => {
    const start = '2024-01-15T19:00:00'
    expect(formatEventTimeRange(start, null, null)).toBe('7:00 PM')
  })

  it('should return empty string when start time is missing', () => {
    expect(formatEventTimeRange(null, null, null)).toBe('')
  })

  it('should return empty string when start time is malformed', () => {
    expect(formatEventTimeRange('invalid-date', '2024-01-15T20:00:00', null)).toBe('')
  })

  it('should return "All day" for all-day events', () => {
    expect(formatEventTimeRange(null, null, '2024-01-15')).toBe('All day')
  })

  it('should handle noon correctly (12:00 PM)', () => {
    const start = '2024-01-15T12:00:00'
    const end = '2024-01-15T13:00:00'
    expect(formatEventTimeRange(start, end, null)).toBe('12:00 PM – 1:00 PM')
  })

  it('should handle midnight correctly (12:00 AM)', () => {
    const start = '2024-01-15T00:00:00'
    const end = '2024-01-15T01:00:00'
    expect(formatEventTimeRange(start, end, null)).toBe('12:00 AM – 1:00 AM')
  })

  it('should handle cross-midnight range', () => {
    const start = '2024-01-15T23:00:00'
    const end = '2024-01-16T01:00:00'
    expect(formatEventTimeRange(start, end, null)).toBe('11:00 PM – 1:00 AM')
  })

  it('should handle undefined start time', () => {
    expect(formatEventTimeRange(undefined, '2024-01-15T20:00:00', null)).toBe('')
  })

  it('should handle undefined end time', () => {
    const start = '2024-01-15T19:00:00'
    expect(formatEventTimeRange(start, undefined, null)).toBe('7:00 PM')
  })

  it('should handle undefined start date for all-day check', () => {
    const start = '2024-01-15T19:00:00'
    expect(formatEventTimeRange(start, null, undefined)).toBe('7:00 PM')
  })
})