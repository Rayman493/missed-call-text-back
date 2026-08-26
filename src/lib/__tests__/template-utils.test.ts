/**
 * Template Utility Functions Tests
 *
 * Tests for canonical template normalization and safe business name resolution.
 * These are shared utilities used in both client and server contexts.
 */

import { describe, it, expect } from 'vitest'
import { normalizeBrokenTemplates, getSafeBusinessName, substituteTemplatePlaceholders } from '@/lib/template-utils'

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

  it('should replace "this is null" with "this is our team"', () => {
    expect(normalizeBrokenTemplates('Hi, this is null. We wanted to follow up.'))
      .toBe('Hi, this is our team. We wanted to follow up.')
  })

  it('should replace "Final follow-up from undefined"', () => {
    expect(normalizeBrokenTemplates('Final follow-up from undefined. Let us know if we can help!'))
      .toBe('Final follow-up from our team. Let us know if we can help!')
  })

  it('should replace "Final follow-up from null"', () => {
    expect(normalizeBrokenTemplates('Final follow-up from null. Let us know if we can help!'))
      .toBe('Final follow-up from our team. Let us know if we can help!')
  })

  it('should preserve custom messages without undefined', () => {
    const customMessage = 'Thanks for your interest! We will get back to you soon.'
    expect(normalizeBrokenTemplates(customMessage)).toBe(customMessage)
  })

  it('should preserve messages with {{business_name}} placeholder', () => {
    const template = 'Just checking in from {{business_name}} - would you still like help?'
    expect(normalizeBrokenTemplates(template)).toBe(template)
  })

  it('should preserve messages with {{return_date}} placeholder', () => {
    const template = 'We will be back on {{return_date}}'
    expect(normalizeBrokenTemplates(template)).toBe(template)
  })

  it('should return empty string for null', () => {
    expect(normalizeBrokenTemplates(null)).toBe('')
  })

  it('should return empty string for undefined', () => {
    expect(normalizeBrokenTemplates(undefined)).toBe('')
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

  it('should return "our team" when businessName is literal "null"', () => {
    expect(getSafeBusinessName(null, 'null')).toBe('our team')
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

describe('substituteTemplatePlaceholders', () => {
  it('should substitute {{business_name}} with valid business name', () => {
    const template = 'Just checking in from {{business_name}}'
    expect(substituteTemplatePlaceholders(template, 'Ryan\'s Landscaping'))
      .toBe('Just checking in from Ryan\'s Landscaping')
  })

  it('should substitute {{business_name}} with "our team" when name is invalid', () => {
    const template = 'Just checking in from {{business_name}}'
    expect(substituteTemplatePlaceholders(template, null))
      .toBe('Just checking in from our team')
  })

  it('should substitute {{business_name}} with "our team" when name is literal "undefined"', () => {
    const template = 'Just checking in from {{business_name}}'
    expect(substituteTemplatePlaceholders(template, 'undefined'))
      .toBe('Just checking in from our team')
  })

  it('should substitute {{return_date}} when provided', () => {
    const template = 'We will be back on {{return_date}}'
    expect(substituteTemplatePlaceholders(template, 'Test Business', 'January 15, 2025'))
      .toBe('We will be back on January 15, 2025')
  })

  it('should remove {{return_date}} when not provided', () => {
    const template = 'We will be back on {{return_date}}'
    expect(substituteTemplatePlaceholders(template, 'Test Business'))
      .toBe('We will be back on ')
  })

  it('should substitute both placeholders', () => {
    const template = 'Just checking in from {{business_name}}. We will be back on {{return_date}}'
    expect(substituteTemplatePlaceholders(template, 'Ryan\'s Landscaping', 'January 15, 2025'))
      .toBe('Just checking in from Ryan\'s Landscaping. We will be back on January 15, 2025')
  })

  it('should preserve text without placeholders', () => {
    const template = 'Thanks for your interest!'
    expect(substituteTemplatePlaceholders(template, 'Test Business'))
      .toBe('Thanks for your interest!')
  })
})