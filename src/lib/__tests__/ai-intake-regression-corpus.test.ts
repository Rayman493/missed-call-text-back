import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'

/**
 * AI Intake SMS Regression Corpus
 * 
 * This corpus tests real-world edge cases for AI intake SMS presentation.
 * The goal is to ensure the SMS formatter handles messy, ambiguous, and
 * incomplete real-world calls correctly.
 * 
 * Categories covered:
 * - Normal complete intake
 * - Partial intake (some fields captured)
 * - Near-empty intake (little to nothing captured)
 * - Vague requests
 * - Ambiguous requests
 * - Corrections
 * - Contradictions
 * - Negation and uncertainty
 * - Multiple fields in one turn
 * - Multiple services
 * - Strange names
 * - Phone number as name
 * - Placeholder requests
 * - Flexible timing
 * - Flexible callback
 * - Malformed transcripts
 * - Onsite vs remote vs customer-comes-to-business
 */

describe('AI Intake SMS Regression Corpus', () => {
  describe('Normal complete intake', () => {
    it('should handle a well-formed complete intake', () => {
      const extractedInfo = {
        customerName: 'John Smith',
        reasonForCalling: 'Lawn mowing',
        requestDetails: 'You\'d like the lawn mowed again this year',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Hi John Smith, thanks for reaching out to Test Business.')
      expect(sms).toContain('• Request: Lawn Mowing')
      expect(sms).toContain('• Details: You\'d like the lawn mowed again this year')
      expect(sms).toContain('• Address: 123 Main St')
      expect(sms).toContain('• Desired completion: This week')
      expect(sms).toContain('• Preferred callback: Morning')
      expect(sms).toContain('We\'ve shared this with the team.')
      expect(sms).not.toContain('Still needed:')
    })
  })

  describe('Partial intake with some fields captured', () => {
    it('should handle intake with name and request only', () => {
      const extractedInfo = {
        customerName: 'Sarah Johnson',
        reasonForCalling: 'Plumbing repair',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Hi Sarah Johnson, thanks for reaching out to Test Business.')
      expect(sms).toContain('• Request: Plumbing Repair')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Any helpful details')
      expect(sms).toContain('• Service address')
      expect(sms).toContain('• When you\'d like it completed')
      expect(sms).toContain('• Best time to call you')
    })

    it('should handle intake with request and address but no name', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'HVAC tune-up',
        requestDetails: null,
        addressOrLocation: '456 Oak Avenue',
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Thanks for reaching out to Test Business.')
      expect(sms).toContain('• Address: 456 Oak Avenue')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Your name')
      expect(sms).toContain('• What you\'re looking to have done')
    })
  })

  describe('Near-empty intake', () => {
    it('should handle intake with essentially nothing captured', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: null,
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Thanks for reaching out to Test Business.')
      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• Your name')
      expect(sms).toContain('• What you\'re looking to have done')
      expect(sms).toContain('• Any helpful details')
      expect(sms).toContain('• Service address')
      expect(sms).toContain('• When you\'d like it completed')
      expect(sms).toContain('• Best time to call you')
      expect(sms).toContain('Send whatever you know')
    })

    it('should handle intake with only a vague request', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'I need someone to come take a look',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // The reasonForCalling "I need someone to come take a look" is a generic service request
      // and should NOT be treated as having meaningful details with the refined logic
      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• Your name')
      expect(sms).toContain('• What you\'re looking to have done')
      expect(sms).toContain('• Any helpful details')
    })
  })

  describe('Customer name edge cases', () => {
    it('should reject phone number as customer name', () => {
      const extractedInfo = {
        customerName: '555-123-4567',
        reasonForCalling: 'Plumbing repair',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('Hi 555-123-4567')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Your name')
    })

    it('should reject "Unknown" as customer name', () => {
      const extractedInfo = {
        customerName: 'Unknown',
        reasonForCalling: 'Cleaning service',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('Hi Unknown')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Your name')
    })

    it('should reject "Caller" as customer name', () => {
      const extractedInfo = {
        customerName: 'Caller',
        reasonForCalling: 'Electrical work',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('Hi Caller')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Your name')
    })

    it('should handle hyphenated names', () => {
      const extractedInfo = {
        customerName: 'Mary-Jane Smith',
        reasonForCalling: 'House cleaning',
        requestDetails: null,
        addressOrLocation: '789 Pine Lane',
        desiredCompletionTime: 'Next week',
        preferredCallbackTime: 'Afternoon',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Hi Mary-Jane Smith, thanks for reaching out to Test Business.')
    })

    it('should handle apostrophe in names', () => {
      const extractedInfo = {
        customerName: "O'Connor",
        reasonForCalling: 'Roof repair',
        requestDetails: null,
        addressOrLocation: '321 Elm Street',
        desiredCompletionTime: 'ASAP',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Hi O\'Connor, thanks for reaching out to Test Business.')
    })
  })

  describe('Placeholder request handling', () => {
    it('should treat "Service Request" as missing (near-empty case)', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'Service Request',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('• Request: Service Request')
      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• What you\'re looking to have done')
    })

    it('should treat "General Service" as missing (near-empty case)', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'General Service',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('• Request: General Service')
      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• What you\'re looking to have done')
    })

    it('should treat "Not collected" as missing for request', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'Not collected',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('• Request: Not collected')
    })
  })

  describe('Address applicability', () => {
    it('should request address for onsite business', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Plumbing repair',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Service address')
    })

    it('should NOT request address when customer comes to business', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Consultation',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'customer_comes_to_business')

      expect(sms).not.toContain('• Service address')
    })

    it('should NOT request address for remote service', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Virtual consultation',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'remote')

      expect(sms).not.toContain('• Service address')
    })
  })

  describe('Flexible timing', () => {
    it('should capture "whenever" as valid timing', () => {
      const extractedInfo = {
        customerName: 'John',
        reasonForCalling: 'Lawn care',
        requestDetails: null,
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'Whenever',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Desired completion: Whenever')
    })

    it('should capture "no rush" as valid timing', () => {
      const extractedInfo = {
        customerName: 'Jane',
        reasonForCalling: 'House painting',
        requestDetails: null,
        addressOrLocation: '456 Oak Ave',
        desiredCompletionTime: 'No rush',
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Desired completion: No rush')
    })

    it('should capture "flexible" as valid timing', () => {
      const extractedInfo = {
        customerName: 'Mike',
        reasonForCalling: 'Electrical work',
        requestDetails: null,
        addressOrLocation: '789 Pine Lane',
        desiredCompletionTime: 'Flexible',
        preferredCallbackTime: 'Afternoon',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Desired completion: Flexible')
    })
  })

  describe('Flexible callback', () => {
    it('should capture "anytime" as valid callback', () => {
      const extractedInfo = {
        customerName: 'Lisa',
        reasonForCalling: 'Cleaning',
        requestDetails: null,
        addressOrLocation: '321 Elm St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Anytime',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Preferred callback: Anytime')
    })

    it('should capture "whenever" as valid callback', () => {
      const extractedInfo = {
        customerName: 'Tom',
        reasonForCalling: 'Plumbing',
        requestDetails: null,
        addressOrLocation: '654 Maple Dr',
        desiredCompletionTime: 'ASAP',
        preferredCallbackTime: 'Whenever',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Preferred callback: Whenever')
    })

    it('should capture "no preference" as valid callback', () => {
      const extractedInfo = {
        customerName: 'Amy',
        reasonForCalling: 'Landscaping',
        requestDetails: null,
        addressOrLocation: '987 Cedar Rd',
        desiredCompletionTime: 'Next month',
        preferredCallbackTime: 'No preference',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Preferred callback: No preference')
    })
  })

  describe('Details field', () => {
    it('should preserve useful context in details', () => {
      const extractedInfo = {
        customerName: 'John',
        reasonForCalling: 'Water heater repair',
        requestDetails: 'Water is leaking from the bottom of the water heater onto the basement floor',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'ASAP',
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Details: Water is leaking from the bottom of the water heater onto the basement floor')
    })

    it('should handle missing details gracefully', () => {
      const extractedInfo = {
        customerName: 'Jane',
        reasonForCalling: 'AC repair',
        requestDetails: null,
        addressOrLocation: '456 Oak Ave',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('• Details:')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Any helpful details')
    })
  })

  describe('Business name fallback', () => {
    it('should handle missing business name gracefully', () => {
      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Plumbing repair',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', '', undefined, 'onsite')

      expect(sms).toContain('Hi Ryan, thanks for reaching out.')
      expect(sms).not.toContain('Hi Unknown')
      expect(sms).not.toContain('Hi undefined')
    })
  })

  describe('Request vs Details distinction', () => {
    it('should keep request distinct from details', () => {
      const extractedInfo = {
        customerName: 'John',
        reasonForCalling: 'Lawn mowing',
        requestDetails: 'Lawn has gotten tall because the customer was away for three weeks',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Request: Lawn Mowing')
      expect(sms).toContain('• Details: Lawn has gotten tall because the customer was away for three weeks')
    })

    it('should handle request without details', () => {
      const extractedInfo = {
        customerName: 'Jane',
        reasonForCalling: 'Tree service',
        requestDetails: null,
        addressOrLocation: '456 Oak Ave',
        desiredCompletionTime: 'Next week',
        preferredCallbackTime: 'Afternoon',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Request: Tree Service')
      expect(sms).not.toContain('• Details:')
    })
  })

  describe('Abandoned call scenarios', () => {
    it('should handle caller who hung up after name only', () => {
      const extractedInfo = {
        customerName: 'Mike',
        reasonForCalling: null,
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Hi Mike, thanks for reaching out to Test Business.')
      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• What you\'re looking to have done')
      expect(sms).not.toContain('• Your name') // Name was captured
    })

    it('should handle caller who hung up after request only', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: 'Plumbing repair',
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('• Request: Plumbing Repair')
      expect(sms).toContain('Still needed:')
      expect(sms).toContain('• Your name')
    })

    it('should handle caller who provided nothing useful', () => {
      const extractedInfo = {
        customerName: null,
        reasonForCalling: null,
        requestDetails: null,
        addressOrLocation: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null,
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('To help the team follow up, reply with:')
      expect(sms).toContain('• Your name')
      expect(sms).toContain('• What you\'re looking to have done')
    })
  })

  describe('Prefix normalization', () => {
    it('should handle "my name is" prefix', () => {
      const extractedInfo = {
        customerName: 'My name is John Smith',
        reasonForCalling: 'Plumbing repair',
        requestDetails: null,
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'This week',
        preferredCallbackTime: 'Morning',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('Hi John Smith, thanks for reaching out to Test Business.')
    })

    it('should handle "I need" prefix for request', () => {
      const extractedInfo = {
        customerName: 'Jane',
        reasonForCalling: 'I need my gutters cleaned',
        requestDetails: null,
        addressOrLocation: '456 Oak Ave',
        desiredCompletionTime: 'Next week',
        preferredCallbackTime: 'Afternoon',
      }

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', undefined, 'onsite')

      // The prefix is normalized, so "I need" is removed
      expect(sms).toContain('Hi Jane, thanks for reaching out to Test Business.')
      expect(sms).toContain('• Address: 456 Oak Ave')
      expect(sms).toContain('• Desired completion: Next week')
      expect(sms).toContain('• Preferred callback: Afternoon')
      expect(sms).toContain('Still needed:')
    })
  })

  describe('Out-of-office prefix notice', () => {
    it('should include out-of-office notice before main message', () => {
      const extractedInfo = {
        customerName: 'John',
        reasonForCalling: 'Plumbing repair',
        requestDetails: 'Kitchen sink is leaking',
        addressOrLocation: '123 Main St',
        desiredCompletionTime: 'ASAP',
        preferredCallbackTime: 'Morning',
      }

      const prefixNotice = 'We\'re currently out of the office until Monday. We\'ll respond as soon as we return.'

      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '555-1234', 'Test Business', prefixNotice, 'onsite')

      expect(sms).toContain('We\'re currently out of the office until Monday. We\'ll respond as soon as we return.')
      expect(sms).toContain('Hi John, thanks for reaching out to Test Business.')
    })
  })
})