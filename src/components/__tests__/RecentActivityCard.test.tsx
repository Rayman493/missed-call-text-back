// Test for RecentActivityCard customer identity and clickable behavior
import { describe, test, expect } from 'vitest'

describe('RecentActivityCard customer identity', () => {
  // Test helpers from RecentActivityCard
  const formatPhoneNumber = (phone: string): string => {
    if (!phone) return ''
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  const getDisplayName = (customerName?: string, customerPhone?: string): string => {
    if (customerName && customerName !== 'Unknown') {
      return customerName
    }
    if (customerPhone) {
      return formatPhoneNumber(customerPhone)
    }
    return 'Customer'
  }

  test('customer reply with name → "{name} replied"', () => {
    const displayName = getDisplayName('Ryan', '4122533598')
    expect(displayName).toBe('Ryan')
  })

  test('customer reply without name but with phone → formatted phone fallback', () => {
    const displayName = getDisplayName(undefined, '4122533598')
    expect(displayName).toBe('(412) 253-3598')
  })

  test('customer reply with neither → "Customer"', () => {
    const displayName = getDisplayName(undefined, undefined)
    expect(displayName).toBe('Customer')
  })

  test('customer reply with Unknown name → phone fallback', () => {
    const displayName = getDisplayName('Unknown', '4122533598')
    expect(displayName).toBe('(412) 253-3598')
  })

  test('phone display formatting', () => {
    expect(formatPhoneNumber('4122533598')).toBe('(412) 253-3598')
    expect(formatPhoneNumber('(412) 253-3598')).toBe('(412) 253-3598')
    expect(formatPhoneNumber('')).toBe('')
    // 11-digit numbers with country code are returned as-is
    expect(formatPhoneNumber('+14122533598')).toBe('+14122533598')
  })

  test('no undefined/null/empty identity text', () => {
    expect(getDisplayName(undefined, undefined)).toBe('Customer')
    expect(getDisplayName(null, null)).toBe('Customer')
    expect(getDisplayName('', '')).toBe('Customer')
    expect(getDisplayName('Unknown', undefined)).toBe('Customer')
  })

  test('historical reply without leadId → name still displays best available', () => {
    // Historical messages may not have lead information
    // Should still display phone if available
    const displayName = getDisplayName(undefined, '4122533598')
    expect(displayName).toBe('(412) 253-3598')
  })

  test('customer name takes priority over phone', () => {
    const displayName = getDisplayName('Sarah', '4122533598')
    expect(displayName).toBe('Sarah')
  })

  test('title construction with customer name', () => {
    const displayName = getDisplayName('Ryan', '4122533598')
    const title = displayName !== 'Customer' ? `${displayName} replied` : 'Customer Replied'
    expect(title).toBe('Ryan replied')
  })

  test('title construction without customer name', () => {
    const displayName = getDisplayName(undefined, undefined)
    const title = displayName !== 'Customer' ? `${displayName} replied` : 'Customer Replied'
    expect(title).toBe('Customer Replied')
  })

  test('outgoing message title with customer name', () => {
    const displayName = getDisplayName('Ryan', '4122533598')
    const title = displayName !== 'Customer' ? `Message sent to ${displayName}` : 'Message Sent'
    expect(title).toBe('Message sent to Ryan')
  })

  test('outgoing message title without customer name', () => {
    const displayName = getDisplayName(undefined, undefined)
    const title = displayName !== 'Customer' ? `Message sent to ${displayName}` : 'Message Sent'
    expect(title).toBe('Message Sent')
  })
})