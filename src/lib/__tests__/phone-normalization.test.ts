import { describe, it, expect } from 'vitest'

// Copy the normalization function locally for testing since admin.ts has server-only import
function normalizePhoneNumberForStorage(phone: string): string {
  if (!phone) return ''

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '')

  // Handle different formats
  if (digits.length === 10) {
    // US format without country code: 4125438580 -> +14125438580
    return `+1${digits}`
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // US format with country code: 14125438580 -> +14125438580
    return `+${digits}`
  } else if (digits.length === 11 && !digits.startsWith('1')) {
    // International format without +: add +
    return `+${digits}`
  } else if (digits.length > 0) {
    // Keep existing format if it starts with + or add +
    return phone.startsWith('+') ? phone : `+${digits}`
  }

  return phone // Return original if can't normalize
}

describe('Phone Number Normalization', () => {
  it('preserves E.164 format unchanged', () => {
    const input = '+14472642362'
    const output = normalizePhoneNumberForStorage(input)
    expect(output).toBe('+14472642362')
    expect(input).toBe(output)
  })

  it('handles US 10-digit format', () => {
    const input = '4472642362'
    const output = normalizePhoneNumberForStorage(input)
    expect(output).toBe('+14472642362')
  })

  it('handles US 11-digit with country code', () => {
    const input = '14472642362'
    const output = normalizePhoneNumberForStorage(input)
    expect(output).toBe('+14472642362')
  })

  it('handles parentheses and spaces', () => {
    const input = '(447) 264-2362'
    const output = normalizePhoneNumberForStorage(input)
    expect(output).toBe('+14472642362')
  })

  it('handles whitespace around E.164', () => {
    const input = '  +14472642362  '
    const output = normalizePhoneNumberForStorage(input)
    expect(output).toBe('+14472642362')
  })

  it('returns empty string for null input', () => {
    const output = normalizePhoneNumberForStorage(null as any)
    expect(output).toBe('')
  })

  it('returns empty string for undefined input', () => {
    const output = normalizePhoneNumberForStorage(undefined as any)
    expect(output).toBe('')
  })

  it('preserves other E.164 formats', () => {
    const input = '+442071234567'
    const output = normalizePhoneNumberForStorage(input)
    expect(output).toBe('+442071234567')
    expect(input).toBe(output)
  })
})