/**
 * Tests for Payment Label Validation
 *
 * Covers label validation rules, eligibility, and edge cases.
 */

import { describe, it, expect } from 'vitest'
import { validatePaymentLabel, isPaymentLabelEditable } from '@/lib/payment-label-validation'

describe('validatePaymentLabel', () => {
  it('accepts valid labels', () => {
    const result = validatePaymentLabel('Kitchen deposit')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Kitchen deposit')
  })

  it('accepts labels with numbers', () => {
    const result = validatePaymentLabel('Job 123 - Plumbing')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Job 123 - Plumbing')
  })

  it('accepts labels with special characters', () => {
    const result = validatePaymentLabel('Emergency pipe repair (urgent)')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Emergency pipe repair (urgent)')
  })

  it('trims surrounding whitespace', () => {
    const result = validatePaymentLabel('  Kitchen deposit  ')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Kitchen deposit')
  })

  it('collapses excessive internal whitespace', () => {
    const result = validatePaymentLabel('Kitchen   deposit')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Kitchen deposit')
  })

  it('rejects labels over 80 characters', () => {
    const longLabel = 'A'.repeat(81)
    const result = validatePaymentLabel(longLabel)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('80 characters')
  })

  it('accepts labels exactly 80 characters', () => {
    const longLabel = 'A'.repeat(80)
    const result = validatePaymentLabel(longLabel)
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(longLabel)
  })

  it('rejects control characters', () => {
    const result = validatePaymentLabel('Label\x00with\x01control')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('invalid characters')
  })

  it('rejects strings with only punctuation', () => {
    const result = validatePaymentLabel('!!!')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('meaningful text')
  })

  it('rejects strings with only emoji', () => {
    const result = validatePaymentLabel('😀😀😀')
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('meaningful text')
  })

  it('rejects empty string after trimming', () => {
    const result = validatePaymentLabel('   ')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('accepts null as clear operation', () => {
    const result = validatePaymentLabel(null)
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('accepts undefined as clear operation', () => {
    const result = validatePaymentLabel(undefined)
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('accepts empty string as clear operation', () => {
    const result = validatePaymentLabel('')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('allows normal customer names', () => {
    const result = validatePaymentLabel('Ryan - new construction')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Ryan - new construction')
  })

  it('allows job descriptions', () => {
    const result = validatePaymentLabel('Saturday service call - kitchen sink')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('Saturday service call - kitchen sink')
  })

  it('allows addresses', () => {
    const result = validatePaymentLabel('123 Main St - bathroom remodel')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe('123 Main St - bathroom remodel')
  })

  it('allows duplicate labels', () => {
    const result1 = validatePaymentLabel('Kitchen deposit')
    const result2 = validatePaymentLabel('Kitchen deposit')
    expect(result1.isValid).toBe(true)
    expect(result2.isValid).toBe(true)
    expect(result1.normalized).toBe(result2.normalized)
  })
})

describe('isPaymentLabelEditable', () => {
  it('allows editing paid payments', () => {
    expect(isPaymentLabelEditable('paid')).toBe(true)
  })

  it('prevents editing pending payments', () => {
    expect(isPaymentLabelEditable('pending')).toBe(false)
  })

  it('prevents editing failed payments', () => {
    expect(isPaymentLabelEditable('failed')).toBe(false)
  })

  it('prevents editing cancelled payments', () => {
    expect(isPaymentLabelEditable('cancelled')).toBe(false)
  })

  it('prevents editing expired payments', () => {
    expect(isPaymentLabelEditable('expired')).toBe(false)
  })

  it('prevents editing draft payments', () => {
    expect(isPaymentLabelEditable('draft')).toBe(false)
  })
})

describe('Clearing label behavior', () => {
  it('clearing the label returns null', () => {
    const result = validatePaymentLabel('')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('clearing the label with spaces returns null', () => {
    const result = validatePaymentLabel('   ')
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('null input returns null', () => {
    const result = validatePaymentLabel(null)
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })

  it('undefined input returns null', () => {
    const result = validatePaymentLabel(undefined)
    expect(result.isValid).toBe(true)
    expect(result.normalized).toBe(null)
  })
})