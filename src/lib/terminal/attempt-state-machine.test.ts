/**
 * Behavioral tests for Terminal attempt state machine
 *
 * Tests for:
 * - Status mapping
 * - Retry permission
 * - New payment blocking
 */

import { describe, it, expect } from 'vitest'
import {
  mapStripeStatusToAttemptState,
  isRetryAllowed,
  shouldBlockNewPayment
} from './attempt-state-machine'

describe('Terminal Attempt State Machine', () => {
  describe('Status Mapping', () => {
    it('should map succeeded to succeeded', () => {
      expect(mapStripeStatusToAttemptState('succeeded')).toBe('succeeded')
    })

    it('should map processing to processing', () => {
      expect(mapStripeStatusToAttemptState('processing')).toBe('processing')
    })

    it('should map requires_capture to processing', () => {
      expect(mapStripeStatusToAttemptState('requires_capture')).toBe('processing')
    })

    it('should map requires_confirmation to processing', () => {
      expect(mapStripeStatusToAttemptState('requires_confirmation')).toBe('processing')
    })

    it('should map requires_action to processing', () => {
      expect(mapStripeStatusToAttemptState('requires_action')).toBe('processing')
    })

    it('should map canceled to canceled', () => {
      expect(mapStripeStatusToAttemptState('canceled')).toBe('canceled')
    })

    it('should map requires_payment_method to failed', () => {
      expect(mapStripeStatusToAttemptState('requires_payment_method')).toBe('failed')
    })

    it('should map unknown status to ambiguous', () => {
      expect(mapStripeStatusToAttemptState('unknown')).toBe('ambiguous')
    })
  })

  describe('Retry Permission', () => {
    it('should allow retry for failed state', () => {
      expect(isRetryAllowed('failed')).toBe(true)
    })

    it('should allow retry for canceled state', () => {
      expect(isRetryAllowed('canceled')).toBe(true)
    })

    it('should allow retry for ambiguous state', () => {
      expect(isRetryAllowed('ambiguous')).toBe(true)
    })

    it('should not allow retry for succeeded state', () => {
      expect(isRetryAllowed('succeeded')).toBe(false)
    })

    it('should not allow retry for processing state', () => {
      expect(isRetryAllowed('processing')).toBe(false)
    })

    it('should not allow retry for creating_payment_intent state', () => {
      expect(isRetryAllowed('creating_payment_intent')).toBe(false)
    })

    it('should not allow retry for collecting state', () => {
      expect(isRetryAllowed('collecting')).toBe(false)
    })
  })

  describe('New Payment Blocking', () => {
    it('should block new payment when creating_payment_intent', () => {
      expect(shouldBlockNewPayment('creating_payment_intent')).toBe(true)
    })

    it('should block new payment when collecting', () => {
      expect(shouldBlockNewPayment('collecting')).toBe(true)
    })

    it('should block new payment when processing', () => {
      expect(shouldBlockNewPayment('processing')).toBe(true)
    })

    it('should block new payment when ambiguous', () => {
      expect(shouldBlockNewPayment('ambiguous')).toBe(true)
    })

    it('should not block new payment when succeeded', () => {
      expect(shouldBlockNewPayment('succeeded')).toBe(false)
    })

    it('should not block new payment when failed', () => {
      expect(shouldBlockNewPayment('failed')).toBe(false)
    })

    it('should not block new payment when canceled', () => {
      expect(shouldBlockNewPayment('canceled')).toBe(false)
    })

    it('should not block new payment when not_started', () => {
      expect(shouldBlockNewPayment('not_started')).toBe(false)
    })
  })
})