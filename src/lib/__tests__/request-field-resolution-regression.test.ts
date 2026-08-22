/**
 * Request Field Resolution Regression Tests
 *
 * Tests for the fix where AI-captured request values like "Fence Repair and Installation"
 * were incorrectly transformed to "Service Request" because generateCanonicalRequestTitle
 * only preserved 1-3 word phrases. The fix extends this to 1-5 words.
 */

import { describe, it, expect } from 'vitest'
import { generateCanonicalRequestTitle, formatAdaptiveIntakeSms, formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'

describe('Request Field Resolution Regression', () => {
  describe('Production regression: Fence Repair and Installation (4 words)', () => {
    it('should preserve "Fence Repair and Installation" as meaningful request', () => {
      const result = generateCanonicalRequestTitle('Fence Repair and Installation')
      expect(result).not.toBe('Service Request')
      expect(result).not.toBe('General Service')
      expect(result).toBe('Fence repair and installation')
    })

    it('should include request in SMS for formatAdaptiveIntakeSms', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        serviceRequested: 'Fence Repair and Installation',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAdaptiveIntakeSms(extractedInfo, '555-1234', 'Test Business')
      
      expect(sms).toContain('Service: Fence repair and installation')
      // Should NOT claim request is missing
      expect(sms).not.toContain('Still needed:')
      expect(sms).not.toContain('What you need help with')
    })

    it('should include request in SMS for formatAiIntakeSummaryWithMode', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        serviceRequested: 'Fence Repair and Installation',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      
      expect(sms).toContain('• Request: Fence repair and installation')
      // Should NOT claim request is missing (check specific request-related prompts)
      expect(sms).not.toContain('What you\'re looking to have done')
      expect(sms).not.toContain('What you need help with')
    })
  })

  describe('Negative regression: genuinely missing request', () => {
    it('should still show missing request prompt when no meaningful request exists', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        serviceRequested: null,
        reasonForCalling: null,
        request: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAdaptiveIntakeSms(extractedInfo, '555-1234', 'Test Business')
      
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('What you need help with')
    })

    it('should still treat "Service Request" as missing', () => {
      const result = generateCanonicalRequestTitle('Service Request')
      expect(result).toBe('Service Request')
    })
  })
})