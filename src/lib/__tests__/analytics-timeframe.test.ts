import { describe, it, expect } from 'vitest'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe, getDaysInTimeframe } from '../analytics-timeframe'

describe('analytics-timeframe', () => {
  describe('ANALYTICS_TIMEFRAME_OPTIONS', () => {
    it('should have exactly 5 options (including All Time)', () => {
      expect(ANALYTICS_TIMEFRAME_OPTIONS).toHaveLength(5)
    })

    it('should have correct labels', () => {
      const labels = ANALYTICS_TIMEFRAME_OPTIONS.map(o => o.label)
      expect(labels).toContain('Last 7 Days')
      expect(labels).toContain('Last 30 Days')
      expect(labels).toContain('Last 90 Days')
      expect(labels).toContain('This Year')
      expect(labels).toContain('All Time')
    })

    it('should have correct values', () => {
      const values = ANALYTICS_TIMEFRAME_OPTIONS.map(o => o.value)
      expect(values).toContain('7d')
      expect(values).toContain('30d')
      expect(values).toContain('90d')
      expect(values).toContain('1y')
      expect(values).toContain('all_time')
    })

    it('should place All Time after This Year', () => {
      const values = ANALYTICS_TIMEFRAME_OPTIONS.map(o => o.value)
      const thisYearIdx = values.indexOf('1y')
      const allTimeIdx = values.indexOf('all_time')
      expect(allTimeIdx).toBeGreaterThan(thisYearIdx)
    })
  })

  describe('getStartDateForTimeframe', () => {
    it('should return a date 7 days ago for 7d', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('7d')
      const diffMs = now.getTime() - startDate!.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(7, 0)
    })

    it('should return a date 30 days ago for 30d', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('30d')
      const diffMs = now.getTime() - startDate!.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(30, 0)
    })

    it('should return a date 90 days ago for 90d', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('90d')
      const diffMs = now.getTime() - startDate!.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(90, 0)
    })

    it('should return a date 365 days ago for 1y', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('1y')
      const diffMs = now.getTime() - startDate!.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(365, 0)
    })

    it('should return null for all_time (no artificial start bound)', () => {
      const startDate = getStartDateForTimeframe('all_time')
      expect(startDate).toBeNull()
    })

    it('should throw for invalid timeframe', () => {
      expect(() => getStartDateForTimeframe('invalid' as AnalyticsTimeframe)).toThrow()
    })
  })

  describe('getDaysInTimeframe', () => {
    it('should return 7 for 7d', () => {
      expect(getDaysInTimeframe('7d')).toBe(7)
    })

    it('should return 30 for 30d', () => {
      expect(getDaysInTimeframe('30d')).toBe(30)
    })

    it('should return 90 for 90d', () => {
      expect(getDaysInTimeframe('90d')).toBe(90)
    })

    it('should return 365 for 1y', () => {
      expect(getDaysInTimeframe('1y')).toBe(365)
    })

    it('should return days from earliest record for all_time', () => {
      const earliest = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000) // 100 days ago
      const days = getDaysInTimeframe('all_time', earliest)
      expect(days).toBeGreaterThanOrEqual(100)
      expect(days).toBeLessThanOrEqual(101)
    })

    it('should return a finite fallback for all_time with no start date', () => {
      const days = getDaysInTimeframe('all_time', null)
      expect(days).toBeGreaterThan(0)
      expect(Number.isFinite(days)).toBe(true)
    })

    it('should throw for invalid timeframe', () => {
      expect(() => getDaysInTimeframe('invalid' as AnalyticsTimeframe)).toThrow()
    })
  })
})