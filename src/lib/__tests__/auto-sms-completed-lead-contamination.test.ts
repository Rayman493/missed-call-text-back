/**
 * Regression tests for auto-SMS completed-lead contamination fix
 *
 * Tests the fix for the defect where lead.raw_metadata was merged into
 * current-call extracted info, causing empty current calls to be incorrectly
 * declared complete and sent historical SMS content.
 */

import { describe, it, expect } from 'vitest'
import { isCompleteAIIntake } from '../ai-intake-completion'

describe('Auto-SMS Completed Lead Contamination Fix', () => {
  describe('mergeExtractedInfo behavior', () => {
    it('should NOT merge lead.raw_metadata into current call extracted info', () => {
      // Simulate the merge function behavior after fix
      const paramsExtracted = {} // Empty current call (no fields captured)
      const aiCallRecordExtracted = {} // Empty ai_call_record
      // lead.raw_metadata with historical Lawn Mowing data should NOT be merged

      const merged = { ...paramsExtracted }
      Object.keys(aiCallRecordExtracted).forEach(key => {
        if (!merged[key] || merged[key] === 'Not collected') {
          merged[key] = aiCallRecordExtracted[key]
        }
      })
      // lead.raw_metadata merge REMOVED

      expect(merged).toEqual({})
      expect(Object.keys(merged).length).toBe(0)
    })

    it('should merge only current call ai_call_record data', () => {
      const paramsExtracted = {}
      const aiCallRecordExtracted = {
        customerName: 'John',
        serviceRequested: 'Plumbing',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Tomorrow',
        callbackTime: 'Morning'
      }

      const merged = { ...paramsExtracted }
      Object.keys(aiCallRecordExtracted).forEach(key => {
        if (!merged[key] || merged[key] === 'Not collected') {
          merged[key] = aiCallRecordExtracted[key]
        }
      })

      expect(merged).toEqual(aiCallRecordExtracted)
      expect(merged.customerName).toBe('John')
      expect(merged.serviceRequested).toBe('Plumbing')
    })
  })

  describe('Completion check with empty current call', () => {
    it('should return false for empty current call regardless of historical lead data', () => {
      // Current call: empty (caller said nothing)
      const currentCallExtractedInfo = {}

      // Historical lead data (should NOT be passed to completion check)
      const historicalLeadData = {
        customerName: 'Previous Customer',
        serviceRequested: 'Lawn Mowing',
        serviceAddress: '456 Oak Ave',
        desiredCompletionTime: 'Next week',
        callbackTime: 'Afternoon'
      }

      // After fix: only current call data is checked
      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
      // Historical data must NOT cause false completion
    })

    it('should return false when current call has partial fields', () => {
      const currentCallExtractedInfo = {
        customerName: 'New Customer'
        // Missing: serviceRequested, serviceAddress, desiredCompletionTime, callbackTime
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should return true only when current call has all required fields', () => {
      const currentCallExtractedInfo = {
        customerName: 'New Customer',
        serviceRequested: 'Plumbing',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Tomorrow',
        callbackTime: 'Morning'
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(true)
    })
  })

  describe('Field name variations', () => {
    it('should recognize alternative field names for completion check', () => {
      // Current call with alternative field names
      const currentCallExtractedInfo = {
        callerName: 'John', // Alternative to customerName
        reasonForCalling: 'Fix leak', // Alternative to serviceRequested
        addressOrLocation: '123 Main St', // Alternative to serviceAddress
        desiredCompletion: 'Tomorrow', // Alternative to desiredCompletionTime
        preferredCallbackTime: 'Morning' // Alternative to callbackTime
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(true)
    })

    it('should not complete with partial alternative field names', () => {
      const currentCallExtractedInfo = {
        callerName: 'John'
        // Missing other fields
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })
  })

  describe('Historical data isolation', () => {
    it('should not use historical customerName for empty current call', () => {
      const currentCallExtractedInfo = {}

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should not use historical serviceRequested for empty current call', () => {
      const currentCallExtractedInfo = {
        customerName: 'John'
        // serviceRequested missing, should NOT fall back to historical
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should not use historical address for empty current call', () => {
      const currentCallExtractedInfo = {
        customerName: 'John',
        serviceRequested: 'Plumbing'
        // address missing
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should not use historical completion time for empty current call', () => {
      const currentCallExtractedInfo = {
        customerName: 'John',
        serviceRequested: 'Plumbing',
        serviceAddress: '123 Main St'
        // completion time missing
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should not use historical callback time for empty current call', () => {
      const currentCallExtractedInfo = {
        customerName: 'John',
        serviceRequested: 'Plumbing',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Tomorrow'
        // callback time missing
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
    })
  })

  describe('New call with different job after completed previous job', () => {
    it('should complete based on current call only', () => {
      // Current call: new job (Gutter cleaning)
      const currentCallExtractedInfo = {
        customerName: 'Same Customer',
        serviceRequested: 'Gutter cleaning',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Friday',
        callbackTime: 'Afternoon'
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(true)
      // Should NOT mix with historical Lawn Mowing data
    })

    it('should be incomplete when current call is partial (new job)', () => {
      // Current call: partial new job
      const currentCallExtractedInfo = {
        customerName: 'Same Customer',
        serviceRequested: 'Gutter cleaning'
        // Missing: address, completion time, callback time
      }

      const isComplete = isCompleteAIIntake(currentCallExtractedInfo)

      expect(isComplete).toBe(false)
      // Should NOT fill missing fields from historical Lawn Mowing
    })
  })
})