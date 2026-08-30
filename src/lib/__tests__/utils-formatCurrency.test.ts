/**
 * formatCurrency tests
 *
 * Tests for canonical USD currency formatting with exactly 2 decimal places.
 */

import { describe, it, expect } from 'vitest'
import { formatCurrency } from '../utils'

describe('formatCurrency', () => {
  describe('with dollars (default)', () => {
    it('should format 0 as $0.00', () => {
      expect(formatCurrency(0)).toBe('$0.00')
    })

    it('should format 0.5 as $0.50', () => {
      expect(formatCurrency(0.5)).toBe('$0.50')
    })

    it('should format 5 as $5.00', () => {
      expect(formatCurrency(5)).toBe('$5.00')
    })

    it('should format 5.2 as $5.20', () => {
      expect(formatCurrency(5.2)).toBe('$5.20')
    })

    it('should format 5.25 as $5.25', () => {
      expect(formatCurrency(5.25)).toBe('$5.25')
    })

    it('should format 1250 as $1,250.00', () => {
      expect(formatCurrency(1250)).toBe('$1,250.00')
    })

    it('should format 1250.5 as $1,250.50', () => {
      expect(formatCurrency(1250.5)).toBe('$1,250.50')
    })

    it('should format large values with commas', () => {
      expect(formatCurrency(1250000)).toBe('$1,250,000.00')
    })

    it('should format negative values', () => {
      expect(formatCurrency(-5.25)).toBe('-$5.25')
    })

    it('should format null as $0.00', () => {
      expect(formatCurrency(null)).toBe('$0.00')
    })

    it('should format undefined as $0.00', () => {
      expect(formatCurrency(undefined)).toBe('$0.00')
    })
  })

  describe('with cents (inCents=true)', () => {
    it('should format 0 cents as $0.00', () => {
      expect(formatCurrency(0, true)).toBe('$0.00')
    })

    it('should format 50 cents as $0.50', () => {
      expect(formatCurrency(50, true)).toBe('$0.50')
    })

    it('should format 500 cents as $5.00', () => {
      expect(formatCurrency(500, true)).toBe('$5.00')
    })

    it('should format 525 cents as $5.25', () => {
      expect(formatCurrency(525, true)).toBe('$5.25')
    })

    it('should format 125000 cents as $1,250.00', () => {
      expect(formatCurrency(125000, true)).toBe('$1,250.00')
    })

    it('should format 125050 cents as $1,250.50', () => {
      expect(formatCurrency(125050, true)).toBe('$1,250.50')
    })

    it('should not convert cents twice', () => {
      // This is the critical test: 50 cents should be $0.50, NOT $50.00
      expect(formatCurrency(50, true)).toBe('$0.50')
    })
  })
})