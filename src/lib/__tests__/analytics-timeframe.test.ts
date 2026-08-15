import { describe, it, expect } from 'vitest'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe, getDaysInTimeframe } from '../analytics-timeframe'

describe('analytics-timeframe', () => {
  describe('ANALYTICS_TIMEFRAME_OPTIONS', () => {
    it('should have exactly 4 options', () => {
      expect(ANALYTICS_TIMEFRAME_OPTIONS).toHaveLength(4)
    })

    it('should have correct labels', () => {
      const labels = ANALYTICS_TIMEFRAME_OPTIONS.map(o => o.label)
      expect(labels).toContain('Last 7 Days')
      expect(labels).toContain('Last 30 Days')
      expect(labels).toContain('Last 90 Days')
      expect(labels).toContain('This Year')
    })

    it('should have correct values', () => {
      const values = ANALYTICS_TIMEFRAME_OPTIONS.map(o => o.value)
      expect(values).toContain('7d')
      expect(values).toContain('30d')
      expect(values).toContain('90d')
      expect(values).toContain('1y')
    })
  })

  describe('getStartDateForTimeframe', () => {
    it('should return a date 7 days ago for 7d', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('7d')
      const diffMs = now.getTime() - startDate.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(7, 0)
    })

    it('should return a date 30 days ago for 30d', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('30d')
      const diffMs = now.getTime() - startDate.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(30, 0)
    })

    it('should return a date 90 days ago for 90d', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('90d')
      const diffMs = now.getTime() - startDate.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(90, 0)
    })

    it('should return a date 365 days ago for 1y', () => {
      const now = new Date()
      const startDate = getStartDateForTimeframe('1y')
      const diffMs = now.getTime() - startDate.getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      expect(diffDays).toBeCloseTo(365, 0)
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

    it('should throw for invalid timeframe', () => {
      expect(() => getDaysInTimeframe('invalid' as AnalyticsTimeframe)).toThrow()
    })
  })
})