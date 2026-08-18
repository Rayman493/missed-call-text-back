// Test for voicemail duration normalization logic
// This tests the helper function extracted from VoicemailMessage.tsx
import { describe, test, expect } from 'vitest'

function normalizeDuration(duration: number | string | null | undefined): number {
  if (duration === null || duration === undefined) return 0
  if (typeof duration === 'string') {
    const parsed = parseFloat(duration)
    if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) return 0
    return parsed
  }
  if (typeof duration === 'number') {
    if (isNaN(duration) || !isFinite(duration) || duration <= 0) return 0
    return duration
  }
  return 0
}

describe('normalizeDuration', () => {
  test('should return 0 for null', () => {
    expect(normalizeDuration(null)).toBe(0)
  })

  test('should return 0 for undefined', () => {
    expect(normalizeDuration(undefined)).toBe(0)
  })

  test('should return valid number for numeric string', () => {
    expect(normalizeDuration('16')).toBe(16)
    expect(normalizeDuration('30.5')).toBe(30.5)
  })

  test('should return 0 for invalid string', () => {
    expect(normalizeDuration('invalid')).toBe(0)
    expect(normalizeDuration('')).toBe(0)
  })

  test('should return valid number for number input', () => {
    expect(normalizeDuration(16)).toBe(16)
    expect(normalizeDuration(30.5)).toBe(30.5)
  })

  test('should return 0 for NaN number', () => {
    expect(normalizeDuration(NaN)).toBe(0)
  })

  test('should return 0 for Infinity', () => {
    expect(normalizeDuration(Infinity)).toBe(0)
  })

  test('should return 0 for negative Infinity', () => {
    expect(normalizeDuration(-Infinity)).toBe(0)
  })

  test('should return 0 for 0', () => {
    expect(normalizeDuration(0)).toBe(0)
  })

  test('should return 0 for zero string', () => {
    expect(normalizeDuration('0')).toBe(0)
  })

  test('should return 0 for negative number (invalid duration)', () => {
    expect(normalizeDuration(-5)).toBe(0)
  })

  test('should return 0 for negative numeric string (invalid duration)', () => {
    expect(normalizeDuration('-16')).toBe(0)
  })

  test('should handle string with decimal', () => {
    expect(normalizeDuration('16.7')).toBe(16.7)
  })

  test('should handle string with leading zeros', () => {
    expect(normalizeDuration('016')).toBe(16)
  })

  test('should handle string with trailing whitespace', () => {
    expect(normalizeDuration('16 ')).toBe(16)
  })
})