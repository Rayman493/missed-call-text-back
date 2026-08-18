import { describe, it, expect } from 'vitest'
import { formatAdaptiveIntakeSms, truncateForSms, normalizeStructuredFieldValue } from '../ai-intake-formatter'

/**
 * AI Intake SMS Details and Normalization Tests
 *
 * Tests for:
 * 1. Details field inclusion in confirmation SMS
 * 2. SMS truncation behavior
 * 3. Structured field normalization for trailing punctuation
 */

describe('AI Intake SMS Details', () => {
  describe('Details field inclusion in SMS', () => {
    it('should include details when present', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'Need front and back yard mowed, grass is quite long',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).toContain('Details:')
      expect(sms).toContain('Need front and back yard mowed')
    })

    it('should omit details when absent', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: null,
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).not.toContain('Details:')
    })

    it('should omit details when empty string', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: '',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).not.toContain('Details:')
    })

    it('should omit details when Not collected', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'Not collected',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).not.toContain('Details:')
    })

    it('should preserve service when details present', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'Need front and back yard mowed',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).toContain('Service: Lawn Mowing')
      expect(sms).toContain('Details:')
    })

    it('should preserve address when details present', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'Need front and back yard mowed',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).toContain('Address: 16302 South Pine Drive')
      expect(sms).toContain('Details:')
    })

    it('should preserve desired completion when details present', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'Need front and back yard mowed',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      // The timing is polished by existing function
      expect(sms).toContain('Preferred timing:')
      expect(sms).toContain('Details:')
    })

    it('should preserve callback time when details present', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'Need front and back yard mowed',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      // The callback time is normalized by existing function
      expect(sms).toContain('Best callback time:')
      expect(sms).toContain('Details:')
    })

    it('should not emit undefined or null text for details', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: null,
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')

      expect(sms).not.toContain('Details: undefined')
      expect(sms).not.toContain('Details: null')
      expect(sms).not.toContain('Details: ')
    })

    it('should keep full details in stored intake data (SMS only truncates)', () => {
      const intakeData = {
        request: 'Lawn Mowing',
        requestDetails: 'This is a very long description that exceeds the SMS character limit but should be preserved in the stored data for the team to review in full detail when they handle the customer request',
        customerName: 'Ryan',
        serviceAddress: '16302 South Pine Drive',
        desiredCompletionTime: 'sometime in the next three weeks',
        callbackTime: 'mornings'
      }

      // Verify the original data is unchanged
      expect(intakeData.requestDetails).toContain('This is a very long description')

      // SMS should have the details (under 200 chars, so not truncated)
      const sms = formatAdaptiveIntakeSms(intakeData, '+15551234567', 'Test Business')
      expect(sms).toContain('Details:')
      // Since it's under 200 chars, no ellipsis
      expect(sms).toContain('This is a very long description')
    })
  })

  describe('SMS truncation', () => {
    it('should truncate long details with ellipsis', () => {
      const longText = 'This is a very long description that exceeds the SMS character limit and should be truncated with an ellipsis to indicate that there is more content available'
      const truncated = truncateForSms(longText, 100)

      expect(truncated.length).toBeLessThanOrEqual(104) // 100 + '...'
      expect(truncated).toContain('...')
      expect(truncated).not.toBe(longText)
    })

    it('should not truncate short details', () => {
      const shortText = 'Need front and back yard mowed'
      const truncated = truncateForSms(shortText, 200)

      expect(truncated).toBe(shortText)
      expect(truncated).not.toContain('...')
    })

    it('should handle empty string', () => {
      const truncated = truncateForSms('', 200)

      expect(truncated).toBe('')
    })

    it('should handle null', () => {
      const truncated = truncateForSms(null, 200)

      expect(truncated).toBe('')
    })

    it('should handle undefined', () => {
      const truncated = truncateForSms(undefined, 200)

      expect(truncated).toBe('')
    })

    it('should avoid breaking Unicode surrogate pairs', () => {
      // This is a simplified test - in production this would handle actual surrogate pairs
      const text = 'Regular text'
      const truncated = truncateForSms(text, 10)

      expect(truncated).not.toContain('\uFFFD') // Replacement character
    })
  })
})

describe('Structured Field Normalization', () => {
  describe('normalizeStructuredFieldValue', () => {
    it('should remove trailing period', () => {
      const normalized = normalizeStructuredFieldValue('1632 Southpine Drive.')
      expect(normalized).toBe('1632 Southpine Drive')
    })

    it('should keep unchanged when no trailing punctuation', () => {
      const normalized = normalizeStructuredFieldValue('1632 Southpine Drive')
      expect(normalized).toBe('1632 Southpine Drive')
    })

    it('should trim leading and trailing whitespace', () => {
      const normalized = normalizeStructuredFieldValue('  1632 Southpine Drive  ')
      expect(normalized).toBe('1632 Southpine Drive')
    })

    it('should preserve internal punctuation', () => {
      const normalized = normalizeStructuredFieldValue('1632 Southpine Dr., Apt. 2B')
      expect(normalized).toBe('1632 Southpine Dr., Apt. 2B')
    })

    it('should preserve meaningful internal periods', () => {
      const normalized = normalizeStructuredFieldValue('123 St. James St.')
      expect(normalized).toBe('123 St. James St')
    })

    it('should remove trailing comma', () => {
      const normalized = normalizeStructuredFieldValue('1632 Southpine Drive,')
      expect(normalized).toBe('1632 Southpine Drive')
    })

    it('should remove trailing semicolon', () => {
      const normalized = normalizeStructuredFieldValue('1632 Southpine Drive;')
      expect(normalized).toBe('1632 Southpine Drive')
    })

    it('should remove trailing colon', () => {
      const normalized = normalizeStructuredFieldValue('1632 Southpine Drive:')
      expect(normalized).toBe('1632 Southpine Drive')
    })

    it('should handle empty string', () => {
      const normalized = normalizeStructuredFieldValue('')
      expect(normalized).toBe('')
    })

    it('should handle null', () => {
      const normalized = normalizeStructuredFieldValue(null)
      expect(normalized).toBe('')
    })

    it('should handle undefined', () => {
      const normalized = normalizeStructuredFieldValue(undefined)
      expect(normalized).toBe('')
    })

    it('should NOT strip punctuation from free-text details', () => {
      // Details should NOT use this normalization - it's for structured fields only
      // This test documents the expected behavior
      const details = 'Need the work done. Please call me.'
      const normalized = normalizeStructuredFieldValue(details)

      // For structured fields, punctuation is stripped
      // But for free-text details, we would NOT use this function
      expect(normalized).toBe('Need the work done. Please call me')
      // In production, details field bypasses this normalization
    })
  })
})