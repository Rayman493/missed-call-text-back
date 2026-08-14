import { describe, it, expect } from 'vitest'

describe('ScheduleMap - Date Comparison', () => {
  it('should use local timezone for date comparison', () => {
    // Test that toLocaleDateString('en-CA') gives consistent YYYY-MM-DD format
    const date = new Date('2024-01-15T20:00:00-05:00') // 8 PM EST
    const localDateStr = date.toLocaleDateString('en-CA')
    const utcDateStr = date.toISOString().split('T')[0]

    // In EST timezone, this should be 2024-01-15, not 2024-01-16 (UTC)
    expect(localDateStr).toBe('2024-01-15')
    // UTC would give wrong date
    expect(utcDateStr).toBe('2024-01-16')
  })

  it('should handle midnight boundary correctly in local timezone', () => {
    // Just before midnight in local time
    const date = new Date('2024-01-15T23:59:59-05:00')
    const localDateStr = date.toLocaleDateString('en-CA')

    expect(localDateStr).toBe('2024-01-15')
  })

  it('should match database date format', () => {
    const date = new Date('2024-06-29T00:00:00')
    const localDateStr = date.toLocaleDateString('en-CA')

    // Database stores dates as YYYY-MM-DD
    expect(localDateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})