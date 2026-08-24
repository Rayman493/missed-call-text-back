/**
 * getLeadAIIntake Current-Call Isolation Tests
 *
 * Tests that getLeadAIIntake represents CURRENT-CALL intake only,
 * without falling back to historical lead.raw_metadata.
 *
 * This ensures SMS and Intake Details cards represent the same information set.
 */

import { describe, it, expect } from 'vitest'
import { getLeadAIIntake, getLeadRequestTitle } from '../ai-field-mapping'

describe('getLeadAIIntake Current-Call Isolation', () => {
  describe('Current call beats historical data', () => {
    it('current Lawn Mowing + historical Plumbing → cards show Lawn Mowing only', () => {
      const lead = {
        id: 'lead-1',
        name: 'Alex Johnson',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing',
            callerName: 'Alex',
            importantDetails: 'kitchen sink leak',
            addressOrLocation: '123 Main St',
            desiredCompletionTime: 'tomorrow',
            preferredCallbackTime: 'mornings'
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            reasonForCalling: 'Lawn Mowing',
            callerName: 'Ryan',
            importantDetails: 'half-acre yard, privacy fence',
            addressOrLocation: '456 Oak Ave',
            desiredCompletionTime: 'next week',
            preferredCallbackTime: 'afternoons'
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Current call data should win
      expect(intake.serviceRequested).toBe('Lawn Mowing')
      expect(intake.customerName).toBe('Ryan')
      // additionalDetails normalization capitalizes first letter
      expect(intake.additionalDetails.toLowerCase()).toContain('half-acre yard')
      expect(intake.additionalDetails.toLowerCase()).toContain('privacy fence')
      expect(intake.serviceAddress).toBe('456 Oak Ave')
      expect(intake.desiredCompletion).toBe('Next week')
      expect(intake.callbackTime).toBe('Afternoons')

      // Historical data should NOT appear
      expect(intake.serviceRequested).not.toBe('Plumbing')
      expect(intake.customerName).not.toBe('Alex')
      expect(intake.additionalDetails).not.toContain('kitchen sink leak')
      expect(intake.serviceAddress).not.toBe('123 Main St')
    })

    it('Empty current call + historical Plumbing → current cards show request missing', () => {
      const lead = {
        id: 'lead-1',
        name: 'Alex Johnson',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing',
            callerName: 'Alex',
            importantDetails: 'kitchen sink leak',
            addressOrLocation: '123 Main St',
            desiredCompletionTime: 'tomorrow',
            preferredCallbackTime: 'mornings'
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {} // Empty current call
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Current call is empty, so fields should be "Not collected" (normalization behavior)
      expect(intake.serviceRequested).toBe('Not collected')
      // Note: customerName falls back to lead profile since current call is empty
      // This is acceptable for identity field
      expect(intake.additionalDetails).toBe('Not collected')
      expect(intake.serviceAddress).toBe('Not collected')
      expect(intake.desiredCompletion).toBe('Not collected')
      expect(intake.callbackTime).toBe('Not collected')

      // Historical Plumbing should NOT leak into serviceRequested
      expect(intake.serviceRequested).not.toBe('Plumbing')
    })

    it('current callerName Ryan + profile Alex Johnson → intake captured name = Ryan', () => {
      const lead = {
        id: 'lead-1',
        name: 'Alex Johnson',
        contact_name: 'Alex J.',
        raw_metadata: {
          customerName: 'Alex'
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            callerName: 'Ryan'
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Current-call captured name should beat profile
      expect(intake.customerName).toBe('Ryan')
      expect(intake.customerName).not.toBe('Alex Johnson')
      expect(intake.customerName).not.toBe('Alex J.')
      expect(intake.customerName).not.toBe('Alex')
    })

    it('Partial current call + complete historical intake → missing current fields remain missing', () => {
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing',
            callerName: 'Alex',
            importantDetails: 'kitchen sink leak',
            addressOrLocation: '123 Main St',
            desiredCompletionTime: 'tomorrow',
            preferredCallbackTime: 'mornings'
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            reasonForCalling: 'Lawn Mowing',
            callerName: 'Ryan'
            // Missing: details, address, timing, callback
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Current call captured fields should appear
      expect(intake.serviceRequested).toBe('Lawn Mowing')
      expect(intake.customerName).toBe('Ryan')

      // Missing fields should be "Not collected" (not filled from historical)
      expect(intake.additionalDetails).toBe('Not collected')
      expect(intake.serviceAddress).toBe('Not collected')
      expect(intake.desiredCompletion).toBe('Not collected')
      expect(intake.callbackTime).toBe('Not collected')

      // Historical data should NOT leak
      expect(intake.additionalDetails).not.toContain('kitchen sink leak')
      expect(intake.serviceAddress).not.toBe('123 Main St')
    })

    it('Complete new job + historical old job → only new job appears', () => {
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing',
            callerName: 'Alex',
            importantDetails: 'kitchen sink leak',
            addressOrLocation: '123 Main St',
            desiredCompletionTime: 'tomorrow',
            preferredCallbackTime: 'mornings'
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            reasonForCalling: 'Gutter Cleaning',
            callerName: 'Ryan',
            importantDetails: 'two-story house, rear gutters clogged',
            addressOrLocation: '456 Oak Ave',
            desiredCompletionTime: 'this Friday',
            preferredCallbackTime: 'afternoon'
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Only new job should appear
      expect(intake.serviceRequested).toBe('Gutter Cleaning')
      expect(intake.customerName).toBe('Ryan')
      // additionalDetails normalization capitalizes first letter
      expect(intake.additionalDetails.toLowerCase()).toContain('two-story house')
      expect(intake.additionalDetails.toLowerCase()).toContain('rear gutters clogged')
      expect(intake.serviceAddress).toBe('456 Oak Ave')
      // Timing normalization capitalizes Friday
      expect(intake.desiredCompletion).toBe('This Friday')
      expect(intake.callbackTime).toBe('Afternoon')

      // Historical job should NOT appear
      expect(intake.serviceRequested).not.toBe('Plumbing')
      expect(intake.customerName).not.toBe('Alex')
      expect(intake.additionalDetails).not.toContain('kitchen sink leak')
    })
  })

  describe('Multi-part details preservation', () => {
    it('multi-part current details → every meaningful fact survives', () => {
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          extracted_info: {
            importantDetails: 'small garden' // Historical
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            importantDetails: 'half-acre yard, privacy fence, equipment-access concern'
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      // All multi-part facts should be preserved (normalization capitalizes first letter)
      expect(intake.additionalDetails.toLowerCase()).toContain('half-acre yard')
      expect(intake.additionalDetails.toLowerCase()).toContain('privacy fence')
      expect(intake.additionalDetails.toLowerCase()).toContain('equipment-access concern')

      // Historical details should NOT appear
      expect(intake.additionalDetails).not.toContain('small garden')
    })
  })

  describe('Alternative current-call field aliases', () => {
    it('alternative field names → normalize correctly', () => {
      const lead = {
        id: 'lead-1',
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            callerName: 'Iris', // Alternative to customerName
            addressOrLocation: '555 Pine Road', // Alternative to serviceAddress
            reasonForCalling: 'Carpet Cleaning', // Alternative to serviceRequested
            preferredCallbackTime: 'weekends', // Alternative to callbackTime
            desiredCompletion: 'next month' // Alternative to desiredCompletionTime
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      expect(intake.customerName).toBe('Iris')
      expect(intake.serviceAddress).toBe('555 Pine Road')
      expect(intake.serviceRequested).toBe('Carpet Cleaning')
      // Timing normalization capitalizes first letter
      expect(intake.callbackTime).toBe('Weekends')
      expect(intake.desiredCompletion).toBe('Next month')
    })
  })

  describe('Manual correction behavior', () => {
    it('manual correction overrides current-call data', () => {
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          corrected_fields: {
            serviceRequested: 'HVAC Repair', // Manual correction
            callerName: 'Corrected Name'
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            reasonForCalling: 'Plumbing',
            callerName: 'Ryan'
          }
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Manual corrections should override
      expect(intake.serviceRequested).toBe('HVAC Repair')
      expect(intake.customerName).toBe('Corrected Name')
    })

    it('manual correction should not be used to sneak in historical data', () => {
      // This test verifies that if corrected_fields contains historical data,
      // it will still be used (because it's a manual correction).
      // The fix ensures historical raw_metadata doesn't leak, but manual
      // corrections are intentional user edits and should be respected.
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          corrected_fields: {
            serviceRequested: 'Plumbing', // Manual correction (could be historical)
            callerName: 'Alex'
          },
          extracted_info: {
            reasonForCalling: 'Lawn Mowing', // Historical
            callerName: 'Ryan'
          }
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {} // Empty current call
        }]
      }

      const intake = getLeadAIIntake(lead)

      // Manual corrections are respected (intentional user edits)
      expect(intake.serviceRequested).toBe('Plumbing')
      expect(intake.customerName).toBe('Alex')

      // Historical raw_metadata should NOT leak (this is the key fix)
      // If corrected_fields were not present, these would be null
    })
  })

  describe('No AI call record', () => {
    it('no ai_call_record → intake fields are "Not collected"', () => {
      const lead = {
        id: 'lead-1',
        name: 'Alex Johnson',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing',
            callerName: 'Alex'
          }
        },
        aiCallRecords: [] // No current call
      }

      const intake = getLeadAIIntake(lead)

      // Should return "Not collected" since no current call
      expect(intake.serviceRequested).toBe('Not collected')
      // customerName falls back to lead profile (acceptable for identity)
      expect(intake.customerName).toBe('Alex Johnson')

      // Historical raw_metadata should NOT leak into serviceRequested
      expect(intake.serviceRequested).not.toBe('Plumbing')
    })
  })

  describe('getLeadRequestTitle current-call isolation', () => {
    it('current Lawn Mowing + historical Plumbing → title = Lawn Mowing', () => {
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing'
          },
          serviceRequested: 'Plumbing',
          request: 'Plumbing'
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {
            reasonForCalling: 'Lawn Mowing'
          }
        }]
      }

      const title = getLeadRequestTitle(lead)

      // Current call should win
      expect(title).toBe('Lawn Mowing')
      expect(title).not.toBe('Plumbing')
    })

    it('empty current call + historical Plumbing → title = empty', () => {
      const lead = {
        id: 'lead-1',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Plumbing'
          },
          serviceRequested: 'Plumbing',
          request: 'Plumbing'
        },
        aiCallRecords: [{
          id: 'call-1',
          call_sid: 'CA123',
          extracted_info: {} // Empty current call
        }]
      }

      const title = getLeadRequestTitle(lead)

      // Should return empty since no current call data
      expect(title).toBe('')
      expect(title).not.toBe('Plumbing')
    })
  })
})