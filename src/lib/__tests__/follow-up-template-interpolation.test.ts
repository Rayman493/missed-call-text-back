/**
 * Follow-Up Template Interpolation Tests
 *
 * Tests for the fix that ensures follow-up messages never contain literal "undefined",
 * "null", or "[object Object]" strings.
 *
 * The fix calls normalizeBrokenTemplates() before substituteTemplatePlaceholders()
 * to clean up any existing broken template strings that might be stored in the database.
 */

import { describe, it, expect } from 'vitest'
import { normalizeBrokenTemplates, substituteTemplatePlaceholders } from '@/lib/template-utils'

describe('Follow-Up Template Interpolation', () => {
  describe('canonical business name resolution', () => {
    it('should resolve {{business_name}} to actual business name', () => {
      const template = 'Hi, this is {{business_name}}. Just checking in — do you still need help with this?'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), 'Ryan\'s Landscaping')
      expect(result).toBe('Hi, this is Ryan\'s Landscaping. Just checking in — do you still need help with this?')
    })

    it('should use safe fallback when business name is null', () => {
      const template = 'Hi, this is {{business_name}}. Just checking in — do you still need help with this?'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), null)
      expect(result).toBe('Hi, this is our team. Just checking in — do you still need help with this?')
    })

    it('should use safe fallback when business name is undefined', () => {
      const template = 'Hi, this is {{business_name}}. Just checking in — do you still need help with this?'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), undefined)
      expect(result).toBe('Hi, this is our team. Just checking in — do you still need help with this?')
    })
  })

  describe('broken template cleanup', () => {
    it('should clean up literal "undefined" from template before interpolation', () => {
      const brokenTemplate = 'Hi, this is undefined. Just checking in — do you still need help with this?'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(brokenTemplate), 'Ryan\'s Landscaping')
      expect(result).toBe('Hi, this is our team. Just checking in — do you still need help with this?')
      expect(result).not.toContain('undefined')
    })

    it('should clean up literal "null" from template before interpolation', () => {
      const brokenTemplate = 'Hi, this is null. Just checking in — do you still need help with this?'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(brokenTemplate), 'Ryan\'s Landscaping')
      expect(result).toBe('Hi, this is our team. Just checking in — do you still need help with this?')
      expect(result).not.toContain('null')
    })

    it('should clean up "from undefined" pattern', () => {
      const brokenTemplate = 'Just checking in from undefined — would you still like help?'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(brokenTemplate), 'Ryan\'s Landscaping')
      expect(result).toBe('Just checking in from our team — would you still like help?')
      expect(result).not.toContain('undefined')
    })

    it('should clean up "Final follow-up from undefined" pattern', () => {
      const brokenTemplate = 'Final follow-up from undefined. Let us know if we can help!'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(brokenTemplate), 'Ryan\'s Landscaping')
      expect(result).toBe('Final follow-up from our team. Let us know if we can help!')
      expect(result).not.toContain('undefined')
    })
  })

  describe('no unsafe string leaks', () => {
    it('should never output literal "undefined"', () => {
      const templates = [
        'Hi, this is {{business_name}}. Just checking in.',
        'Hi, this is undefined. Just checking in.',
        'Just checking in from {{business_name}}.',
        'Just checking in from undefined.',
        'Final follow-up from {{business_name}}.',
        'Final follow-up from undefined.',
      ]
      const businessNames = ['Ryan\'s Landscaping', null, undefined, 'undefined', 'null']

      for (const template of templates) {
        for (const businessName of businessNames) {
          const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), businessName)
          expect(result).not.toContain('undefined')
        }
      }
    })

    it('should never output literal "null"', () => {
      const templates = [
        'Hi, this is {{business_name}}. Just checking in.',
        'Hi, this is null. Just checking in.',
        'Just checking in from {{business_name}}.',
        'Just checking in from null.',
      ]
      const businessNames = ['Ryan\'s Landscaping', null, undefined, 'undefined', 'null']

      for (const template of templates) {
        for (const businessName of businessNames) {
          const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), businessName)
          expect(result).not.toContain('null')
        }
      }
    })

    it('should never output "[object Object]"', () => {
      const template = 'Hi, this is {{business_name}}. Just checking in.'
      const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), null as any)
      expect(result).not.toContain('[object Object]')
    })
  })

  describe('all follow-up template variants', () => {
    const defaultFollowUpTemplates = [
      'Hi, this is {{business_name}}. Just checking in — do you still need help with this?',
      'Hi, this is {{business_name}}. We wanted to follow up one more time. Reply here if you still need anything.',
      'Final follow-up from {{business_name}}. Let us know if we can still help.',
    ]

    it('should render valid SMS for all default templates with valid business name', () => {
      const businessName = 'Ryan\'s Landscaping'
      for (const template of defaultFollowUpTemplates) {
        const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), businessName)
        expect(result).toContain('Ryan\'s Landscaping')
        expect(result).not.toContain('{{business_name}}')
        expect(result).not.toContain('undefined')
        expect(result).not.toContain('null')
      }
    })

    it('should render valid SMS for all default templates with null business name', () => {
      for (const template of defaultFollowUpTemplates) {
        const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), null)
        expect(result).toContain('our team')
        expect(result).not.toContain('{{business_name}}')
        expect(result).not.toContain('undefined')
        expect(result).not.toContain('null')
      }
    })

    it('should render valid SMS for all default templates with undefined business name', () => {
      for (const template of defaultFollowUpTemplates) {
        const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(template), undefined)
        expect(result).toContain('our team')
        expect(result).not.toContain('{{business_name}}')
        expect(result).not.toContain('undefined')
        expect(result).not.toContain('null')
      }
    })

    it('should render valid SMS for all default templates with broken "undefined" strings', () => {
      const brokenTemplates = defaultFollowUpTemplates.map(t => t.replace('{{business_name}}', 'undefined'))
      for (const brokenTemplate of brokenTemplates) {
        const result = substituteTemplatePlaceholders(normalizeBrokenTemplates(brokenTemplate), 'Ryan\'s Landscaping')
        expect(result).toContain('our team')
        expect(result).not.toContain('undefined')
        expect(result).not.toContain('null')
      }
    })
  })
})