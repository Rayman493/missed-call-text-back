/**
 * Regression tests for completed lead repeat-caller routing
 *
 * Tests the fix for the defect where completed customers were incorrectly
 * routed to cooldown voicemail instead of fresh AI intake.
 */

import { describe, it, expect } from 'vitest'
import { determineRepeatCallerRoute } from '../repeat-caller-routing'

describe('Repeat Caller Routing - Completed Lead Fix', () => {
  const businessId = 'test-business-id'
  const callerPhone = '+15551234567'

  describe('Completed lead scenarios', () => {
    it('should route to fresh AI intake when lead is completed with previous ai_failed', async () => {
      const lead = {
        id: 'lead-id',
        status: 'completed',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'ai_failed',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 minute ago
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ai_intake_new_request')
      expect(result.reason).toBe('latest_request_closed')
      expect(result.canRetryAI).toBeUndefined()
    })

    it('should route to fresh AI intake when lead is completed with previous incomplete', async () => {
      const lead = {
        id: 'lead-id',
        status: 'completed',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'incomplete',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 minute ago
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ai_intake_new_request')
      expect(result.reason).toBe('latest_request_closed')
      expect(result.canRetryAI).toBeUndefined()
    })

    it('should route to fresh AI intake when lead is completed with previous completed intake', async () => {
      const lead = {
        id: 'lead-id',
        status: 'completed',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'completed',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 minute ago
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ai_intake_new_request')
      expect(result.reason).toBe('latest_request_closed')
      expect(result.canRetryAI).toBeUndefined()
    })

    it('should route to fresh AI intake when lead is completed and inside retry cooldown window', async () => {
      const lead = {
        id: 'lead-id',
        status: 'completed',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'ai_failed',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago (inside 5-min cooldown)
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ai_intake_new_request')
      expect(result.reason).toBe('latest_request_closed')
      // Cooldown should NOT suppress fresh AI intake for completed leads
      expect(result.canRetryAI).toBeUndefined()
    })
  })

  describe('Active lead scenarios (preserve existing behavior)', () => {
    it('should use voicemail when lead is active with incomplete intake inside cooldown', async () => {
      const lead = {
        id: 'lead-id',
        status: 'active',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'incomplete',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago (inside 5-min cooldown)
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('update_voicemail_active_request')
      expect(result.reason).toBe('retry_window_expired')
      expect(result.canRetryAI).toBe(false)
    })

    it('should allow AI retry when lead is active with incomplete intake after cooldown', async () => {
      const lead = {
        id: 'lead-id',
        status: 'active',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'incomplete',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 minutes ago (outside 5-min cooldown)
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ai_intake_retry')
      expect(result.reason).toBe('incomplete_intake_retry')
      expect(result.canRetryAI).toBe(true)
    })

    it('should use voicemail when lead is needs_reply with active request', async () => {
      const lead = {
        id: 'lead-id',
        status: 'needs_reply',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'completed',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('update_voicemail_active_request')
      expect(result.reason).toBe('active_request_exists')
      expect(result.canRetryAI).toBe(false)
    })
  })

  describe('Ignored contact behavior (preserve existing)', () => {
    it('should preserve ignored behavior for ignored status', async () => {
      const lead = {
        id: 'lead-id',
        status: 'ignored',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'ai_failed',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ignored_customer_existing_behavior')
      expect(result.reason).toBe('ignored_customer')
    })

    it('should preserve ignored behavior for opted_out flag', async () => {
      const lead = {
        id: 'lead-id',
        status: 'completed',
        opted_out: true
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'ai_failed',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ignored_customer_existing_behavior')
      expect(result.reason).toBe('ignored_customer')
    })
  })

  describe('Lost status (closed)', () => {
    it('should route to fresh AI intake when lead is lost', async () => {
      const lead = {
        id: 'lead-id',
        status: 'lost',
        opted_out: false
      }

      const latestAICallRecord = {
        id: 'call-record-id',
        outcome: 'ai_failed',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        conversation_id: 'conv-id'
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord
      })

      expect(result.route).toBe('ai_intake_new_request')
      expect(result.reason).toBe('latest_request_closed')
    })
  })

  describe('No prior AI intake', () => {
    it('should route to fresh AI intake when lead exists but no AI call record', async () => {
      const lead = {
        id: 'lead-id',
        status: 'completed',
        opted_out: false
      }

      const result = await determineRepeatCallerRoute({
        businessId,
        callerPhone,
        lead,
        latestAICallRecord: null
      })

      expect(result.route).toBe('ai_intake_new_request')
      expect(result.reason).toBe('no_prior_completed_intake')
    })
  })
})