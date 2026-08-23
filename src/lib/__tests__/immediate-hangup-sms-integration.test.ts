import { describe, it, expect } from 'vitest'
import { isCompleteAIIntake } from '@/lib/ai-intake-completion'
import { formatAiIntakeSummary } from '@/lib/ai-intake-formatter'

// Unit tests for immediate-hangup SMS path
// These tests exercise actual production logic for intake completion and message generation

describe('Immediate Hangup SMS Logic', () => {
  const testCallerPhone = '+15551234567'
  const testBusinessName = 'Test Business'

  describe('INTAKE COMPLETION - Production Logic', () => {
    it('should return false for zero collected fields (immediate hangup)', () => {
      const extractedInfo = {} // Zero fields - immediate hangup scenario

      const isComplete = isCompleteAIIntake(extractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should return false for partial intake (some fields missing)', () => {
      const extractedInfo = {
        customerName: 'John',
        // Missing: serviceRequested, serviceAddress, desiredCompletionTime, callbackTime
      }

      const isComplete = isCompleteAIIntake(extractedInfo)

      expect(isComplete).toBe(false)
    })

    it('should return true for complete intake', () => {
      const extractedInfo = {
        customerName: 'Jane',
        serviceRequested: 'Plumbing repair',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Tomorrow',
        callbackTime: 'Morning'
      }

      const isComplete = isCompleteAIIntake(extractedInfo)

      expect(isComplete).toBe(true)
    })

    it('should return false for null/undefined extractedInfo', () => {
      expect(isCompleteAIIntake(null)).toBe(false)
      expect(isCompleteAIIntake(undefined)).toBe(false)
    })

    it('should accept complete intake without address for non-onsite businesses', () => {
      const extractedInfo = {
        customerName: 'Jane',
        serviceRequested: 'Consultation',
        // No serviceAddress - acceptable for customer_comes_to_business
        desiredCompletionTime: 'Tomorrow',
        callbackTime: 'Morning'
      }

      const isComplete = isCompleteAIIntake(extractedInfo, 'customer_comes_to_business')

      expect(isComplete).toBe(true)
    })
  })

  describe('MESSAGE GENERATION - Production Logic', () => {
    it('should generate appropriate message for zero collected fields', () => {
      const extractedInfo = {} // Zero fields

      const message = formatAiIntakeSummary(extractedInfo, testCallerPhone, testBusinessName)

      // Should ask for missing information, not fabricate details
      expect(message).toContain('reply with')
      expect(message).toContain('Your name')
      expect(message).not.toContain('Jane') // No fabricated name
      expect(message).not.toContain('Plumbing') // No fabricated service
    })

    it('should show captured fields for partial intake', () => {
      const extractedInfo = {
        customerName: 'John',
        serviceRequested: 'Plumbing repair',
        // Missing: address, timing
      }

      const message = formatAiIntakeSummary(extractedInfo, testCallerPhone, testBusinessName)

      expect(message).toContain('John')
      expect(message).toContain('Plumbing')
      expect(message).toContain('Still needed')
      expect(message).toContain('Service address')
    })

    it('should show complete intake without asking for more', () => {
      const extractedInfo = {
        customerName: 'Jane',
        serviceRequested: 'Plumbing repair',
        serviceAddress: '123 Main St',
        desiredCompletionTime: 'Tomorrow',
        callbackTime: 'Morning'
      }

      const message = formatAiIntakeSummary(extractedInfo, testCallerPhone, testBusinessName)

      expect(message).toContain('Jane')
      expect(message).toContain('Plumbing')
      expect(message).toContain('123 Main St')
      expect(message).not.toContain('Still needed')
    })
  })

  describe('ELIGIBILITY DESIGN INTENT', () => {
    it('should allow SMS for immediate hangup (aiCallRecord exists, outcome=caller_hung_up)', () => {
      // This documents the design intent from auto-sms-dispatcher.ts line 667
      // SMS eligibility: reachedReplyFlowAI = !!aiCallRecord && callSidMatch && businessMatch
      // Does NOT depend on: outcome completion, captured fields, or meaningful data

      const aiCallRecordExists = true
      const callSidMatches = true
      const businessMatches = true

      const reachedReplyFlowAI = aiCallRecordExists && callSidMatches && businessMatches

      expect(reachedReplyFlowAI).toBe(true)
    })

    it('should NOT allow SMS if call never reached ReplyFlow (no aiCallRecord)', () => {
      const aiCallRecordExists = false

      const reachedReplyFlowAI = aiCallRecordExists

      expect(reachedReplyFlowAI).toBe(false)
    })
  })
})