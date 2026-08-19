import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'
describe('AI Intake SMS - Polished Format', () => {
  describe('Fully populated intake shows all captured fields', () => {
    it('should include all canonical fields when all are present', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        requestDetails: 'You\'d like the lawn mowed again this year',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      expect(sms).toContain('Hi John Smith, thanks for reaching out to Test Business.')
      expect(sms).toContain('• Request: Lawn Mowing')
      expect(sms).toContain('• Address: 123 Main St')
      expect(sms).toContain('• Desired completion: This week')
      expect(sms).toContain('• Preferred callback: Morning')
      expect(sms).toContain("We've shared this with the team")
    })
  })
  describe('Partial intake separates captured from still needed', () => {
    it('should show captured fields and ask for missing fields', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      expect(sms).toContain('Here\'s what we captured:')
      expect(sms).toContain('• Request: Lawn Mowing')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Any helpful details')
      expect(sms).toContain('• Service address')
      expect(sms).toContain('• When you\'d like it completed')
      expect(sms).toContain('• Best time to call you')
    })
  })
  describe('Near-empty intake asks for what\'s needed', () => {
    it('should ask for all required fields when nothing meaningful is captured', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• Your name')
      expect(sms).toContain('• What you\'re looking to have done')
      expect(sms).toContain('• Any helpful details')
      expect(sms).toContain('• Service address')
      expect(sms).toContain('• When you\'d like it completed')
      expect(sms).toContain('• Best time to call you')
      expect(sms).toContain('Send whatever you know')
    })
  })
  describe('Name naturally incorporated into greeting', () => {
    it('should use name in greeting when available', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Plumbing repair',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Mike\'s Plumbing')
      expect(sms).toContain('Hi Ryan, thanks for reaching out to Mike\'s Plumbing.')
      expect(sms).not.toContain('• Your name') // Name is captured, so don't ask for it
    })
  })
  describe('Missing name asks for name', () => {
    it('should ask for your name when name is not captured', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'Plumbing repair',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Mike\'s Plumbing')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Your name')
    })
  })
  describe('Generic fallback values are not treated as captured', () => {
    it('should treat "Service Request" as missing', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'Service Request',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      expect(sms).not.toContain('• Request: Service Request')
      expect(sms).toContain('• What you\'re looking to have done')
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
      expect(sms).not.toContain('• Request: General Service')
      expect(sms).toContain('• What you\'re looking to have done')
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
      expect(sms).not.toContain('Hi Unknown')
      expect(sms).toContain('• Your name')
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
      expect(sms).not.toContain('• Your name: Not collected')
      expect(sms).not.toContain('• Request: Not collected')
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
      expect(sms).not.toContain('• Your name: N/A')
    })
  })
  describe('Address applicability based on service location type', () => {
    it('should ask for address when onsite business', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Plumbing repair',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(
        extractedInfo,
        '555-1234',
        'Test Business',
        undefined,
        'onsite'
      )
      expect(sms).toContain('• Service address')
    })
    it('should NOT ask for address when customer comes to business', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Plumbing repair',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(
        extractedInfo,
        '555-1234',
        'Test Business',
        undefined,
        'customer_comes_to_business'
      )
      expect(sms).not.toContain('• Service address')
    })
    it('should NOT ask for address when remote service', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Consultation',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(
        extractedInfo,
        '555-1234',
        'Test Business',
        undefined,
        'remote'
      )
      expect(sms).not.toContain('• Service address')
    })
  })
  describe('Complete intake has no Still Needed section', () => {
    it('should not show Still Needed section when all applicable fields are captured', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        requestDetails: 'You\'d like the lawn mowed again this year',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      expect(sms).toContain('Here\'s what we captured:')
      expect(sms).not.toContain('Still needed:')
    })
  })
  describe('No internal terminology leaks to SMS', () => {
    it('should not use internal labels like "Captured:" or checkmarks', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business')
      expect(sms).not.toContain('Captured:')
      expect(sms).not.toContain('✓')
      expect(sms).not.toContain('○')
      expect(sms).not.toContain('Not collected')
    })
  })
  describe('Graceful business name fallback', () => {
    it('should handle missing business name gracefully', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Plumbing repair',
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', '')
      expect(sms).toContain('Hi Ryan, thanks for reaching out.')
      expect(sms).not.toContain('Hi Unknown')
      expect(sms).not.toContain('Hi undefined')
    })
  })
})