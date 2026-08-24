/**
 * SMS Detail Fidelity Tests
 *
 * Tests to ensure meaningful customer facts in additionalDetails/importantDetails
 * are preserved in SMS formatting and not arbitrarily truncated.
 *
 * Product invariant:
 * WHAT CUSTOMER SAID ≈ CURRENT CALL INTAKE ≈ REPLYFLOW INTAKE DETAILS ≈ SMS
 */

import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode, formatAdaptiveIntakeSms } from '@/lib/ai-intake-formatter'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'

describe('SMS Detail Fidelity', () => {
  describe('TEST A — >200 character multi-detail preservation', () => {
    it('should preserve all meaningful facts in long details (>200 chars)', () => {
      const longDetails = 'The yard is approximately half an acre. There is a privacy fence around the backyard. The gate is located on the side of the house. The customer does not have lawn equipment. There are rose bushes near the front walkway that should not be damaged.'

      const intakeData = {
        customerName: 'Ryan',
        serviceRequested: 'Lawn Mowing',
        serviceAddress: '123 Main Street',
        additionalDetails: longDetails,
        desiredCompletionTime: 'Friday',
        preferredCallbackTime: 'afternoon'
      }

      const sms = formatAiIntakeSummaryWithMode(intakeData, '+15551234567', 'Test Business')

      // Verify all meaningful facts survive
      expect(sms).toContain('half an acre')
      expect(sms).toContain('privacy fence')
      expect(sms).toContain('gate')
      expect(sms).toContain('side of the house')
      expect(sms).toContain('does not have lawn equipment')
      expect(sms).toContain('rose bushes')
      expect(sms).toContain('front walkway')

      // Verify the details are not truncated with ellipsis
      expect(sms).not.toMatch(/\.\.\.$/)
    })
  })

  describe('TEST B — SMS/Card information parity', () => {
    it('should preserve all meaningful facts from canonical extracted_info in SMS', () => {
      const canonicalExtractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Lawn Mowing',
        addressOrLocation: '123 Main Street',
        importantDetails: 'Half-acre yard. Privacy fence around backyard. Gate on side of house. Customer does not have equipment. Rose bushes near front walkway.',
        desiredCompletionTime: 'Friday',
        preferredCallbackTime: 'afternoon'
      }

      // Simulate lead with current-call extracted_info
      const lead = {
        id: 'lead-1',
        name: 'Ryan',
        caller_phone: '+15551234567',
        raw_metadata: {},
        aiCallRecords: [{
          id: 'acr-1',
          call_sid: 'CA123',
          outcome: 'completed',
          extracted_info: canonicalExtractedInfo
        }]
      }

      // Get Intake Details data
      const intake = getLeadAIIntake(lead)

      // Get SMS data
      const sms = formatAiIntakeSummaryWithMode(canonicalExtractedInfo, '+15551234567', 'Test Business')

      // Verify every meaningful fact available to Intake Details also survives SMS
      expect(intake.customerName).toBe('Ryan')
      expect(sms).toContain('Ryan')

      expect(intake.serviceRequested).toBe('Lawn Mowing')
      expect(sms).toContain('Lawn Mowing')

      expect(intake.serviceAddress).toBe('123 Main Street')
      expect(sms).toContain('123 Main Street')

      // Verify the full details string is preserved (not truncated)
      expect(intake.additionalDetails).toBe('Half-acre yard. Privacy fence around backyard. Gate on side of house. Customer does not have equipment. Rose bushes near front walkway.')
      expect(sms).toContain('Half-acre yard. Privacy fence around backyard. Gate on side of house. Customer does not have equipment. Rose bushes near front walkway.')

      expect(intake.desiredCompletion).toBe('Friday')
      expect(sms).toContain('Friday')

      expect(intake.callbackTime).toBe('Afternoon')
      expect(sms).toContain('Afternoon')
    })
  })

  describe('TEST C — Short details preservation', () => {
    it('should preserve short details without modification', () => {
      const shortDetails = 'Half-acre yard with privacy fence'

      const intakeData = {
        customerName: 'Alex',
        serviceRequested: 'Lawn Mowing',
        additionalDetails: shortDetails
      }

      const sms = formatAiIntakeSummaryWithMode(intakeData, '+15551234567', 'Test Business')

      expect(sms).toContain('Half-acre yard with privacy fence')
      // No truncation ellipsis
      expect(sms).not.toMatch(/\.\.\.$/)
    })
  })

  describe('TEST D — Partial intake isolation', () => {
    it('should show captured details and ask for genuinely missing fields', () => {
      const partialIntake = {
        customerName: 'Ryan',
        serviceRequested: 'Gutter cleaning',
        additionalDetails: 'Three-story house. Rear gutter is overflowing.'
        // Missing: address, completion time, callback time
      }

      const sms = formatAiIntakeSummaryWithMode(partialIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      // Verify captured details are shown
      expect(sms).toContain('Ryan')
      expect(sms).toContain('Gutter')
      expect(sms).toContain('Three-story house')
      expect(sms).toContain('Rear gutter')

      // Verify missing fields are requested
      expect(sms).toContain('Still needed')
      expect(sms).toContain('Service address')
      expect(sms).toContain("When you'd like it completed")
      expect(sms).toContain('Best time to call you')
    })
  })

  describe('TEST E — Empty returning call isolation', () => {
    it('should NOT show historical data when current extracted_info is empty', () => {
      const emptyCurrentCall = {
        // No current-call data
        customerName: null,
        serviceRequested: null,
        additionalDetails: null,
        serviceAddress: null,
        desiredCompletionTime: null,
        preferredCallbackTime: null
      }

      const sms = formatAiIntakeSummaryWithMode(emptyCurrentCall, '+15551234567', 'Test Business')

      // Verify NO historical request/details/address/timing appear
      expect(sms).not.toContain('Request:')
      expect(sms).not.toContain('Details:')
      expect(sms).not.toContain('Address:')
      expect(sms).not.toContain('Desired completion:')
      expect(sms).not.toContain('Preferred callback:')

      // Verify only asks for what's needed
      expect(sms).toContain('Your name')
      expect(sms).toContain("What you're looking to have done")
    })
  })

  describe('Extraction boundary documentation', () => {
    it('should document that transcript→extracted_info fidelity is external', () => {
      // This test documents the system boundary
      // The external Fly.io AI voice service performs structured extraction
      // This codebase guarantees fidelity from extracted_info onward

      const extractedInfo = {
        customerName: 'Ryan',
        reasonForCalling: 'Lawn Mowing',
        importantDetails: 'Half-acre yard'
      }

      // Verify this codebase preserves extracted_info in SMS
      const sms = formatAiIntakeSummaryWithMode(extractedInfo, '+15551234567', 'Test Business')

      expect(sms).toContain('Ryan')
      expect(sms).toContain('Lawn Mowing')
      expect(sms).toContain('Half-acre yard')
    })
  })
})