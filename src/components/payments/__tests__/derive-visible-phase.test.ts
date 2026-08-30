/**
 * Tests for deriveVisiblePhase function
 *
 * Tests:
 * - waiting_for_card shows waiting_for_card by default
 * - waiting_for_card shows processing when card interaction has progressed
 * - failure states show correct phases
 * - cancel shows canceled
 * - success shows success
 * - processing with reconciliation evidence shows confirming
 */

import { describe, it, expect } from 'vitest'
import { deriveVisiblePhase, type PresentationPhase } from '../QuickTapToPayModal'

describe('deriveVisiblePhase', () => {
  const mockTerminalService = {
    getCurrentAttemptId: () => 'attempt-123',
    getSessionId: () => 'session-456',
  }

  describe('waiting_for_card state', () => {
    it('should show waiting_for_card when payment intent is just created', () => {
      const phase = deriveVisiblePhase('waiting_for_card', 'payment_intent_created', null, mockTerminalService)
      expect(phase).toBe('waiting_for_card')
    })

    it('should show processing when card interaction has progressed (native succeeded)', () => {
      const phase = deriveVisiblePhase('waiting_for_card', 'payment_native_succeeded', null, mockTerminalService)
      expect(phase).toBe('processing')
    })

    it('should show processing when reconciliation has started', () => {
      const phase = deriveVisiblePhase('waiting_for_card', 'reconciliation_started', null, mockTerminalService)
      expect(phase).toBe('processing')
    })

    it('should show waiting_for_card for other lastSuccessfulStage values', () => {
      const phase = deriveVisiblePhase('waiting_for_card', 'connected', null, mockTerminalService)
      expect(phase).toBe('waiting_for_card')
    })
  })

  describe('processing state', () => {
    it('should show processing by default', () => {
      const phase = deriveVisiblePhase('processing', 'payment_intent_created', null, mockTerminalService)
      expect(phase).toBe('processing')
    })

    it('should show confirming when native payment succeeded', () => {
      const phase = deriveVisiblePhase('processing', 'payment_native_succeeded', null, mockTerminalService)
      expect(phase).toBe('confirming')
    })

    it('should show confirming when reconciliation started', () => {
      const phase = deriveVisiblePhase('processing', 'reconciliation_started', null, mockTerminalService)
      expect(phase).toBe('confirming')
    })
  })

  describe('failure states', () => {
    it('should show declined for declined payment', () => {
      const phase = deriveVisiblePhase('failure', 'payment_intent_created', { title: 'Payment declined' }, mockTerminalService)
      expect(phase).toBe('declined')
    })

    it('should show uncertain for ambiguous outcome', () => {
      const phase = deriveVisiblePhase('failure', 'payment_intent_created', { title: 'Payment in Progress' }, mockTerminalService)
      expect(phase).toBe('uncertain')
    })

    it('should show uncertain for back action', () => {
      const phase = deriveVisiblePhase('failure', 'payment_intent_created', { action: 'back' }, mockTerminalService)
      expect(phase).toBe('uncertain')
    })

    it('should show recoverable_error for other errors', () => {
      const phase = deriveVisiblePhase('failure', 'payment_intent_created', { title: 'Network error' }, mockTerminalService)
      expect(phase).toBe('recoverable_error')
    })

    it('should show recoverable_error when no mapped error', () => {
      const phase = deriveVisiblePhase('failure', 'payment_intent_created', null, mockTerminalService)
      expect(phase).toBe('recoverable_error')
    })
  })

  describe('cancel behavior', () => {
    it('should show canceled when paymentState is canceled', () => {
      const phase = deriveVisiblePhase('canceled', 'payment_native_succeeded', null, mockTerminalService)
      expect(phase).toBe('canceled')
    })

    it('canceled takes precedence over lastSuccessfulStage', () => {
      const phase = deriveVisiblePhase('canceled', 'reconciliation_started', null, mockTerminalService)
      expect(phase).toBe('canceled')
    })
  })

  describe('success behavior', () => {
    it('should show success when paymentState is success', () => {
      const phase = deriveVisiblePhase('success', 'payment_native_succeeded', null, mockTerminalService)
      expect(phase).toBe('success')
    })
  })

  describe('preparation states', () => {
    it('should show preparing for preparing', () => {
      const phase = deriveVisiblePhase('preparing', 'initializing', null, mockTerminalService)
      expect(phase).toBe('preparing')
    })

    it('should show preparing for connecting_reader', () => {
      const phase = deriveVisiblePhase('connecting_reader', 'connecting_reader', null, mockTerminalService)
      expect(phase).toBe('preparing')
    })

    it('should show preparing for creating_payment_intent', () => {
      const phase = deriveVisiblePhase('creating_payment_intent', 'payment_intent_created', null, mockTerminalService)
      expect(phase).toBe('preparing')
    })
  })

  describe('education states', () => {
    it('should show education_pending', () => {
      const phase = deriveVisiblePhase('education_pending', 'none', null, mockTerminalService)
      expect(phase).toBe('education_pending')
    })

    it('should show education_waiting_for_confirmation', () => {
      const phase = deriveVisiblePhase('education_waiting_for_confirmation', 'education_presented', null, mockTerminalService)
      expect(phase).toBe('education_waiting_for_confirmation')
    })
  })

  describe('ready state', () => {
    it('should show ready when paymentState is ready', () => {
      const phase = deriveVisiblePhase('ready', 'none', null, mockTerminalService)
      expect(phase).toBe('ready')
    })
  })

  describe('ambiguous/pending states', () => {
    it('should show uncertain for ambiguous', () => {
      const phase = deriveVisiblePhase('ambiguous', 'none', null, mockTerminalService)
      expect(phase).toBe('uncertain')
    })

    it('should show uncertain for pending', () => {
      const phase = deriveVisiblePhase('pending', 'none', null, mockTerminalService)
      expect(phase).toBe('uncertain')
    })
  })

  describe('default fallback', () => {
    it('should default to ready for unknown states', () => {
      const phase = deriveVisiblePhase('unknown_state', 'none', null, mockTerminalService)
      expect(phase).toBe('ready')
    })
  })
})