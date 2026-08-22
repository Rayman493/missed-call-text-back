import { describe, it, expect } from 'vitest'
import { resolveCustomerDisplayName, formatPhoneNumber, truncateMessage } from '../notifications'

describe('Customer Name Resolution', () => {
  it('should return meaningful customer name', () => {
    const result = resolveCustomerDisplayName('John Smith', '+14122533598')
    expect(result).toBe('John Smith')
  })

  it('should return formatted phone when name is empty', () => {
    const result = resolveCustomerDisplayName('', '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return formatted phone when name is null', () => {
    const result = resolveCustomerDisplayName(null, '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return formatted phone when name is "Customer"', () => {
    const result = resolveCustomerDisplayName('Customer', '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return formatted phone when name is "Unknown"', () => {
    const result = resolveCustomerDisplayName('Unknown', '+14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return "Customer" when both name and phone are missing', () => {
    const result = resolveCustomerDisplayName('', '')
    expect(result).toBe('Customer')
  })

  it('should trim whitespace from name', () => {
    const result = resolveCustomerDisplayName('  John Smith  ', '+14122533598')
    expect(result).toBe('John Smith')
  })

  it('should handle phone with country code', () => {
    const result = resolveCustomerDisplayName('', '14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return original phone if not US format', () => {
    const result = resolveCustomerDisplayName('', '+442071234567')
    expect(result).toBe('+442071234567')
  })
})

describe('Phone Number Formatting', () => {
  it('should format 10-digit US number', () => {
    const result = formatPhoneNumber('4122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should format 11-digit US number with country code', () => {
    const result = formatPhoneNumber('14122533598')
    expect(result).toBe('(412) 253-3598')
  })

  it('should return original if not US format', () => {
    const result = formatPhoneNumber('+442071234567')
    expect(result).toBe('+442071234567')
  })

  it('should handle non-numeric characters', () => {
    const result = formatPhoneNumber('(412) 253-3598')
    expect(result).toBe('(412) 253-3598')
  })
})

describe('Message Truncation', () => {
  it('should not truncate short messages', () => {
    const result = truncateMessage('Hello', 120)
    expect(result).toBe('Hello')
  })

  it('should truncate at word boundary', () => {
    const result = truncateMessage('This is a test message that is quite long', 30)
    expect(result).toBe('This is a test message that...')
  })

  it('should truncate at max length if no word boundary', () => {
    const result = truncateMessage('Thisisaverylongwordwithoutspaces', 20)
    expect(result).toBe('Thisisaverylongwo...')
  })
})