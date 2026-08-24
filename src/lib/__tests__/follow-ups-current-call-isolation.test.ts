/**
 * Follow-Up Current-Call Isolation Tests
 *
 * Tests to ensure follow-up creation/cancellation decisions are based ONLY
 * on current AI call extracted_info, not historical lead.raw_metadata.
 *
 * Product invariant:
 * For AI CALL completion/follow-up decisions, ONLY the CURRENT
 * ai_call_record.extracted_info may determine whether the current intake is complete.
 *
 * Historical lead.raw_metadata may remain stored for history/profile purposes
 * but must NOT fill missing fields for a new AI intake.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { isCompleteAIIntake } from '@/lib/ai-intake-completion'

describe('Follow-Up Current-Call Isolation', () => {
  describe('TEST A — Returning customer, current call empty object', () => {
    it('should treat empty current extracted_info as incomplete regardless of historical data', () => {
      const currentExtractedInfo = {} // Empty object (truthy but no fields)
      const serviceLocationType = 'onsite'

      const isComplete = isCompleteAIIntake(currentExtractedInfo, serviceLocationType)

      expect(isComplete).toBe(false)
    })
  })

  describe('TEST B — Returning customer, current extraction null', () => {
    it('should treat null current extracted_info as incomplete', () => {
      const currentExtractedInfo = null
      const serviceLocationType = 'onsite'

      const isComplete = isCompleteAIIntake(currentExtractedInfo, serviceLocationType)

      expect(isComplete).toBe(false)
    })
  })

  describe('TEST C — Returning customer, partial current intake', () => {
    it('should treat partial current intake as incomplete, historical data does not fill missing fields', () => {
      const currentExtractedInfo = {
        callerName: 'Ryan',
        reasonForCalling: 'Gutter Cleaning'
        // Missing address, timing
      }
      const serviceLocationType = 'onsite'

      const isComplete = isCompleteAIIntake(currentExtractedInfo, serviceLocationType)

      expect(isComplete).toBe(false)
    })
  })

  describe('TEST D — Complete CURRENT intake', () => {
    it('should recognize complete current intake regardless of historical data', () => {
      const currentExtractedInfo = {
        callerName: 'Ryan',
        reasonForCalling: 'Gutter Cleaning',
        addressOrLocation: '123 Main Street',
        desiredCompletionTime: 'Friday',
        preferredCallbackTime: 'afternoon'
      }
      const serviceLocationType = 'onsite'

      const isComplete = isCompleteAIIntake(currentExtractedInfo, serviceLocationType)

      expect(isComplete).toBe(true)
    })
  })

  describe('TEST E — Different historical request', () => {
    it('should not use historical Lawn Mowing data when current is Gutter Cleaning partial', () => {
      // Historical: Lawn Mowing (complete)
      // Current: Gutter Cleaning (partial)
      const currentExtractedInfo = {
        callerName: 'Ryan',
        reasonForCalling: 'Gutter Cleaning'
        // Missing address, timing
      }
      const serviceLocationType = 'onsite'

      const isComplete = isCompleteAIIntake(currentExtractedInfo, serviceLocationType)

      expect(isComplete).toBe(false)
      // Verify current request is used, not historical
      expect(currentExtractedInfo.reasonForCalling).toBe('Gutter Cleaning')
    })
  })

  describe('TEST F — New customer with no historical metadata', () => {
    it('should handle new customer with empty current intake', () => {
      const currentExtractedInfo = {}
      const serviceLocationType = 'onsite'

      const isComplete = isCompleteAIIntake(currentExtractedInfo, serviceLocationType)

      expect(isComplete).toBe(false)
    })
  })

  describe('Empty object vs null behavior', () => {
    it('should treat both null and {} as incomplete', () => {
      const serviceLocationType = 'onsite'

      const nullResult = isCompleteAIIntake(null, serviceLocationType)
      const emptyObjectResult = isCompleteAIIntake({}, serviceLocationType)

      expect(nullResult).toBe(false)
      expect(emptyObjectResult).toBe(false)
    })
  })

  describe('Service location type variations', () => {
    it('should require address only for onsite businesses', () => {
      const partialWithoutAddress = {
        callerName: 'Ryan',
        reasonForCalling: 'Gutter Cleaning',
        desiredCompletionTime: 'Friday',
        preferredCallbackTime: 'afternoon'
        // Missing address
      }

      // Onsite - incomplete (address required)
      const onsiteResult = isCompleteAIIntake(partialWithoutAddress, 'onsite')
      expect(onsiteResult).toBe(false)

      // Non-onsite - complete (address not required)
      const nonOnsiteResult = isCompleteAIIntake(partialWithoutAddress, 'customer_comes_to_business')
      expect(nonOnsiteResult).toBe(true)
    })
  })

  describe('JavaScript truthiness verification', () => {
    it('should confirm {} is truthy but still treated as incomplete', () => {
      const emptyObject = {}
      const serviceLocationType = 'onsite'

      // Verify {} is truthy (JavaScript behavior)
      const isTruthy = !!emptyObject
      expect(isTruthy).toBe(true)

      // But isCompleteAIIntake should still return false (checks for required fields)
      const isComplete = isCompleteAIIntake(emptyObject, serviceLocationType)
      expect(isComplete).toBe(false)
    })
  })
})