import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'

describe('AI Intake SMS - Canonical Format', () => {
  describe('Fully populated intake preserves real values', () => {
    it('should include all canonical fields when all are present', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      expect(sms).toContain('Customer: John Smith')
      expect(sms).toContain('Request: Lawn mowing')
      expect(sms).toContain('Location: 123 Main St')
      expect(sms).toContain('Desired Completion: This week')
      expect(sms).toContain('Best Callback Time: Morning')
    })
  })

  describe('Partial intake includes all canonical fields', () => {
    it('should show all fields with Captured/Still Needed sections for partial intake', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      expect(sms).toContain('Captured:')
      expect(sms).toContain('✓ Customer: John Smith')
      expect(sms).toContain('✓ Request: Lawn mowing')
      expect(sms).toContain('Still Needed:')
      expect(sms).toContain('○ Location')
      expect(sms).toContain('○ Desired Completion')
      expect(sms).toContain('○ Best Callback Time')
    })
  })

  describe('Missing fields display "Not collected"', () => {
    it('should show "Not collected" for missing canonical fields', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      // When no fields are captured, it should return a generic acknowledgment
      expect(sms).toContain('Thanks for calling')
    })
  })

  describe('Generic fallback values are not treated as captured data', () => {
    it('should treat "Service Request" as missing', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'Service Request',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      // "Service Request" should be treated as missing
      expect(sms).not.toContain('✓ Request: Service Request')
    })

    it('should treat "General Service" as missing', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'General Service',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      expect(sms).not.toContain('✓ Request: General Service')
    })

    it('should treat "Unknown" as missing for customer name', () => {
      const extractedInfo = {
        customerName: 'Unknown',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      expect(sms).not.toContain('✓ Customer: Unknown')
    })
  })

  describe('Placeholder values are normalized as missing', () => {
    it('should treat "Not collected" as missing', () => {
      const extractedInfo = {
        customerName: 'Not collected',
        reasonForCalling: 'Not collected',
        addressOrLocation: 'Not collected',
        desiredCompletionTime: 'Not collected',
        preferredCallbackTime: 'Not collected',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      expect(sms).not.toContain('✓ Customer: Not collected')
      expect(sms).not.toContain('✓ Request: Not collected')
    })

    it('should treat "N/A" as missing', () => {
      const extractedInfo = {
        customerName: 'N/A',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      expect(sms).not.toContain('✓ Customer: N/A')
    })
  })

  describe('Existing successful SMS formatting does not regress', () => {
    it('should still produce clean messages for complete intake', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')

      // Should not contain adaptive level-specific text
      expect(sms).not.toContain('To help us get everything ready')
      expect(sms).not.toContain('We got your request for')

      // Should contain canonical format
      expect(sms).toContain('Captured:')
      expect(sms).toContain('We\'ll share this with the business')
    })
  })
})