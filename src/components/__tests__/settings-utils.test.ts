/**
 * Settings Utility Functions Tests
 *
 * Tests utility functions for Settings/Automation features.
 */

import { describe, it, expect } from 'vitest'

// Copy of the formatTime12Hour function from SettingsContent
function formatTime12Hour(time24: string | null | undefined): string {
  if (!time24) return ''
  const [hours, minutes] = time24.split(':')
  if (!hours || !minutes) return time24

  const hour = parseInt(hours, 10)
  const period = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12 // Convert 0 to 12

  return `${hour12}:${minutes} ${period}`
}

// Copy of the normalizeBrokenTemplates function from SettingsContent
function normalizeBrokenTemplates(message: string | null | undefined): string {
  if (!message) return ''
  let normalized = message
    .replace(/from undefined/g, 'from our team')
    .replace(/from null/g, 'from our team')
    .replace(/this is undefined/g, 'this is our team')
    .replace(/this is null/g, 'this is our team')
    .replace(/Final follow-up from undefined/g, 'Final follow-up from our team')
    .replace(/Final follow-up from null/g, 'Final follow-up from our team')
  return normalized
}

// Copy of the getSafeBusinessName function from SettingsContent
function getSafeBusinessName(formBusinessName: string | null | undefined, businessName: string | null | undefined): string {
  const name1 = formBusinessName?.trim()
  const name2 = businessName?.trim()

  // Check for literal "undefined" string or empty/whitespace values
  const isValidName = (name: string | null | undefined) => {
    if (!name) return false
    const trimmed = name.trim()
    if (trimmed.length === 0) return false
    if (trimmed === 'undefined' || trimmed === 'null') return false
    return true
  }

  if (isValidName(name1)) {
    return name1!
  }
  if (isValidName(name2)) {
    return name2!
  }
  return 'our team'
}

describe('formatTime12Hour', () => {
  it('should convert 09:00 to 9:00 AM', () => {
    expect(formatTime12Hour('09:00')).toBe('9:00 AM')
  })

  it('should convert 17:00 to 5:00 PM', () => {
    expect(formatTime12Hour('17:00')).toBe('5:00 PM')
  })

  it('should convert 12:00 to 12:00 PM', () => {
    expect(formatTime12Hour('12:00')).toBe('12:00 PM')
  })

  it('should convert 00:00 to 12:00 AM', () => {
    expect(formatTime12Hour('00:00')).toBe('12:00 AM')
  })

  it('should handle minutes correctly', () => {
    expect(formatTime12Hour('09:30')).toBe('9:30 AM')
    expect(formatTime12Hour('17:45')).toBe('5:45 PM')
  })

  it('should return empty string for null', () => {
    expect(formatTime12Hour(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(formatTime12Hour(undefined)).toBe('')
  })

  it('should handle afternoon hours correctly', () => {
    expect(formatTime12Hour('13:00')).toBe('1:00 PM')
    expect(formatTime12Hour('14:00')).toBe('2:00 PM')
    expect(formatTime12Hour('23:00')).toBe('11:00 PM')
  })

  it('should handle morning hours correctly', () => {
    expect(formatTime12Hour('01:00')).toBe('1:00 AM')
    expect(formatTime12Hour('11:00')).toBe('11:00 AM')
  })
})

describe('normalizeBrokenTemplates', () => {
  it('should replace "from undefined" with "from our team"', () => {
    expect(normalizeBrokenTemplates('Just checking in from undefined - would you still like help?'))
      .toBe('Just checking in from our team - would you still like help?')
  })

  it('should replace "from null" with "from our team"', () => {
    expect(normalizeBrokenTemplates('Just checking in from null - would you still like help?'))
      .toBe('Just checking in from our team - would you still like help?')
  })

  it('should replace "this is undefined" with "this is our team"', () => {
    expect(normalizeBrokenTemplates('Hi, this is undefined. We wanted to follow up.'))
      .toBe('Hi, this is our team. We wanted to follow up.')
  })

  it('should replace "Final follow-up from undefined"', () => {
    expect(normalizeBrokenTemplates('Final follow-up from undefined. Let us know if we can help!'))
      .toBe('Final follow-up from our team. Let us know if we can help!')
  })

  it('should preserve custom messages without undefined', () => {
    const customMessage = 'Thanks for your interest! We will get back to you soon.'
    expect(normalizeBrokenTemplates(customMessage)).toBe(customMessage)
  })

  it('should return empty string for null', () => {
    expect(normalizeBrokenTemplates(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(normalizeBrokenTemplates(undefined)).toBe('')
  })

  it('should handle messages with {{business_name}} placeholder', () => {
    const template = 'Just checking in from {{business_name}} - would you still like help?'
    expect(normalizeBrokenTemplates(template)).toBe(template)
  })

  it('should normalize multiple occurrences', () => {
    const broken = 'from undefined and this is undefined again'
    expect(normalizeBrokenTemplates(broken)).toBe('from our team and this is our team again')
  })
})

describe('getSafeBusinessName', () => {
  it('should return formBusinessName when valid', () => {
    expect(getSafeBusinessName('Test Business', null)).toBe('Test Business')
  })

  it('should return businessName when formBusinessName is null', () => {
    expect(getSafeBusinessName(null, 'Test Business')).toBe('Test Business')
  })

  it('should return "our team" when both are null', () => {
    expect(getSafeBusinessName(null, null)).toBe('our team')
  })

  it('should return "our team" when both are empty strings', () => {
    expect(getSafeBusinessName('', '')).toBe('our team')
  })

  it('should return "our team" when formBusinessName is literal "undefined"', () => {
    expect(getSafeBusinessName('undefined', null)).toBe('our team')
  })

  it('should return "our team" when formBusinessName is literal "null"', () => {
    expect(getSafeBusinessName('null', null)).toBe('our team')
  })

  it('should return "our team" when businessName is literal "undefined"', () => {
    expect(getSafeBusinessName(null, 'undefined')).toBe('our team')
  })

  it('should trim whitespace from names', () => {
    expect(getSafeBusinessName('  Test Business  ', null)).toBe('Test Business')
  })

  it('should return "our team" for whitespace-only strings', () => {
    expect(getSafeBusinessName('   ', null)).toBe('our team')
  })

  it('should prefer formBusinessName over businessName when both valid', () => {
    expect(getSafeBusinessName('Form Business', 'Business')).toBe('Form Business')
  })

  it('should fall back to businessName when formBusinessName is invalid', () => {
    expect(getSafeBusinessName('undefined', 'Valid Business')).toBe('Valid Business')
  })

  it('should handle undefined input', () => {
    expect(getSafeBusinessName(undefined, undefined)).toBe('our team')
  })
})