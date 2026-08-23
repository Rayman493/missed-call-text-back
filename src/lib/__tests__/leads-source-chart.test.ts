/**
 * Leads by Source Chart Regression Tests
 *
 * Tests for:
 * - Single source rendering (100% case)
 * - Multiple source rendering
 * - Zero-value source handling
 * - Empty state handling
 * - Percentage calculations
 * - Total calculations
 */

import { describe, it, expect } from 'vitest'
import { normalizeSourceCounts } from '../lead-source-normalization'

describe('Leads by Source Chart Data Transformation', () => {
  describe('Single source cases (production bug case)', () => {
    it('CASE A: ReplyFlow=2 should render as 100%', () => {
      // Given: 2 leads from ReplyFlow
      const rawSourceCounts = {
        voice: 2
      }

      // When: transform to chart data using production logic
      const { chartData, unclassifiedCount } = normalizeSourceCounts(rawSourceCounts)

      // Then: should have one data point with value 2
      expect(chartData).toHaveLength(1)
      expect(chartData[0].value).toBe(2)
      expect(chartData[0].name).toBe('ReplyFlow Intake')
      expect(chartData[0].color).toBe('#8B5CF6')

      // And: total should be 2
      const total = chartData.reduce((sum, item) => sum + item.value, 0)
      expect(total).toBe(2)

      // And: unclassified should be 0
      expect(unclassifiedCount).toBe(0)

      // And: percentage should be 100%
      const percentage = (chartData[0].value / total) * 100
      expect(percentage).toBe(100)
    })

    it('CASE D: ReplyFlow=1 should render as 100%', () => {
      // Given: 1 lead from ReplyFlow
      const rawSourceCounts = {
        voice: 1
      }

      // When: transform to chart data using production logic
      const { chartData } = normalizeSourceCounts(rawSourceCounts)

      // Then: should have one data point with value 1
      expect(chartData).toHaveLength(1)
      expect(chartData[0].value).toBe(1)

      // And: total should be 1
      const total = chartData.reduce((sum, item) => sum + item.value, 0)
      expect(total).toBe(1)

      // And: percentage should be 100%
      const percentage = (chartData[0].value / total) * 100
      expect(percentage).toBe(100)
    })
  })

  describe('Multiple source cases', () => {
    it('CASE B: ReplyFlow=1, Manual=1 should render as 50%/50%', () => {
      // Given: 1 lead from ReplyFlow, 1 from Manual
      const rawSourceCounts = {
        voice: 1,
        manual: 1
      }

      // When: transform to chart data using production logic
      const { chartData } = normalizeSourceCounts(rawSourceCounts)

      // Then: should have two data points
      expect(chartData).toHaveLength(2)

      // And: total should be 2
      const total = chartData.reduce((sum, item) => sum + item.value, 0)
      expect(total).toBe(2)

      // And: each should be 50%
      chartData.forEach(item => {
        const percentage = (item.value / total) * 100
        expect(percentage).toBe(50)
      })
    })

    it('CASE C: ReplyFlow=5, Manual=3, Other=2 should render with correct proportions', () => {
      // Given: 5 leads from ReplyFlow, 3 from Manual, 2 from Other (web)
      const rawSourceCounts = {
        voice: 5,
        manual: 3,
        web: 2
      }

      // When: transform to chart data using production logic
      const { chartData, unclassifiedCount } = normalizeSourceCounts(rawSourceCounts)

      // Then: should have two data points (ReplyFlow Intake + Manually Added), web goes to unclassified
      expect(chartData).toHaveLength(2)

      // And: unclassified should be 2 (from web)
      expect(unclassifiedCount).toBe(2)

      // And: total classified should be 8
      const total = chartData.reduce((sum, item) => sum + item.value, 0)
      expect(total).toBe(8)

      // And: percentages should be correct
      const replyflowItem = chartData.find(d => d.name === 'ReplyFlow Intake')
      const manualItem = chartData.find(d => d.name === 'Manually Added')

      expect(replyflowItem?.value).toBe(5)
      expect(manualItem?.value).toBe(3)

      expect((replyflowItem!.value / total) * 100).toBeCloseTo(62.5, 1)
      expect((manualItem!.value / total) * 100).toBeCloseTo(37.5, 1)
    })
  })

  describe('Zero-value source handling', () => {
    it('CASE G: Zero-value sources in input are filtered out from chartData', () => {
      // Given: 2 leads from ReplyFlow, 0 from Manual, 0 from Other
      const rawSourceCounts = {
        voice: 2,
        manual: 0,
        web: 0
      }

      // When: transform to chart data using production logic
      const { chartData, unclassifiedCount } = normalizeSourceCounts(rawSourceCounts)

      // Then: zero-value sources are filtered out (to prevent rendering issues)
      expect(chartData).toHaveLength(1) // Only ReplyFlow Intake (value > 0)
      expect(chartData[0].value).toBe(2)
      expect(chartData[0].name).toBe('ReplyFlow Intake')

      // And: unclassified should be 0 (web with 0 count)
      expect(unclassifiedCount).toBe(0)

      // And: total should be 2
      const total = chartData.reduce((sum, item) => sum + item.value, 0)
      expect(total).toBe(2)

      // And: percentage should be 100%
      const percentage = (chartData[0].value / total) * 100
      expect(percentage).toBe(100)
    })
  })

  describe('Empty state cases', () => {
    it('CASE E: All source values = 0 produces empty chartData (filtered out)', () => {
      // Given: all sources have 0 leads
      const rawSourceCounts = {
        voice: 0,
        manual: 0,
        web: 0
      }

      // When: transform to chart data using production logic
      const { chartData } = normalizeSourceCounts(rawSourceCounts)

      // Then: zero-value sources are filtered out, resulting in empty chartData
      expect(chartData).toHaveLength(0)
    })

    it('CASE F: No source records produces empty chartData', () => {
      // Given: no source data
      const rawSourceCounts: Record<string, number> = {}

      // When: transform to chart data using production logic
      const { chartData } = normalizeSourceCounts(rawSourceCounts)

      // Then: should have no data points
      expect(chartData).toHaveLength(0)
    })
  })

  describe('Test/demo lead exclusion', () => {
    it('excludes admin_test and demo leads from analytics', () => {
      // Given: mix of production and test leads
      const rawSourceCounts = {
        voice: 2,
        admin_test: 5,
        demo: 3
      }

      // When: transform to chart data using production logic
      const { chartData } = normalizeSourceCounts(rawSourceCounts)

      // Then: should only have ReplyFlow Intake (admin_test and demo excluded)
      expect(chartData).toHaveLength(1)
      expect(chartData[0].value).toBe(2)
      expect(chartData[0].name).toBe('ReplyFlow Intake')
    })
  })

  describe('Percentage calculation accuracy', () => {
    it('calculates percentages correctly for various totals', () => {
      const testCases = [
        { total: 10, value: 5, expected: 50 },
        { total: 10, value: 1, expected: 10 },
        { total: 100, value: 33, expected: 33 },
        { total: 3, value: 1, expected: 33.33 },
        { total: 7, value: 2, expected: 28.57 }
      ]

      testCases.forEach(({ total, value, expected }) => {
        const percentage = (value / total) * 100
        expect(percentage).toBeCloseTo(expected, 2)
      })
    })
  })

  describe('Total calculation accuracy', () => {
    it('calculates total correctly for various data sets', () => {
      const testCases = [
        { data: [2], expected: 2 },
        { data: [1, 1], expected: 2 },
        { data: [5, 3, 2], expected: 10 },
        { data: [10, 20, 30, 40], expected: 100 },
        { data: [0, 0, 0], expected: 0 }
      ]

      testCases.forEach(({ data, expected }) => {
        const total = data.reduce((sum, value) => sum + value, 0)
        expect(total).toBe(expected)
      })
    })
  })

  describe('Source label preservation', () => {
    it('uses canonical source labels from production utility', () => {
      // Given: various source types
      const rawSourceCounts = {
        voice: 1,
        manual: 1,
        web: 1,
        ai_voice: 1,
        sms: 1
      }

      // When: transform to chart data
      const { chartData } = normalizeSourceCounts(rawSourceCounts)

      // Then: should use canonical labels
      expect(chartData).toHaveLength(2) // ReplyFlow Intake + Manually Added
      expect(chartData[0].name).toBe('ReplyFlow Intake')
      expect(chartData[1].name).toBe('Manually Added')
    })
  })
})