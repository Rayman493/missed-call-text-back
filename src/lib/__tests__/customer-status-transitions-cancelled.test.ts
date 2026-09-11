/**
 * Cancelled status transition tests
 *
 * These tests verify that:
 * - Cancelled is a protected status (for business/workflow events)
 * - Cancelled IS reactivated to 'active' on inbound_message_received (Batch A universal reactivation)
 * - Cancelled stops follow-up automation for non-inbound events
 */

import { describe, it, expect } from 'vitest'
import {
  applyCustomerStatusEvent,
  isProtectedStatus,
  getPossibleTransitions
} from '@/lib/customer-status-transitions'

describe('Cancelled status transitions', () => {
  describe('Protected status behavior', () => {
    it('cancelled is a protected status', () => {
      const isProtected = isProtectedStatus('cancelled')
      expect(isProtected).toBe(true)
    })

    it('cancelled DOES transition to active on inbound_message_received (Batch A universal reactivation)', () => {
      const nextStatus = applyCustomerStatusEvent('cancelled', 'inbound_message_received')
      expect(nextStatus).toBe('active')
    })

    it('cancelled does not transition on business_reply_sent', () => {
      const nextStatus = applyCustomerStatusEvent('cancelled', 'business_reply_sent')
      expect(nextStatus).toBe(null)
    })

    it('cancelled does not transition on appointment_created', () => {
      const nextStatus = applyCustomerStatusEvent('cancelled', 'appointment_created')
      expect(nextStatus).toBe(null)
    })

    it('cancelled does not transition on payment_succeeded', () => {
      const nextStatus = applyCustomerStatusEvent('cancelled', 'payment_succeeded')
      expect(nextStatus).toBe(null)
    })

    it('cancelled does not transition on workflow_completed', () => {
      const nextStatus = applyCustomerStatusEvent('cancelled', 'workflow_completed')
      expect(nextStatus).toBe(null)
    })
  })

  describe('Possible transitions', () => {
    it('cancelled has inbound_message_received as its only automatic transition', () => {
      const possibleTransitions = getPossibleTransitions('cancelled')
      // Batch A: cancelled now has inbound_message_received → active
      expect(possibleTransitions).toContain('active')
      expect(possibleTransitions.length).toBe(1)
    })
  })

  describe('Existing protected statuses remain unchanged', () => {
    it('ignored is still a protected status', () => {
      const isProtected = isProtectedStatus('ignored')
      expect(isProtected).toBe(true)
    })

    it('lost is still a protected status', () => {
      const isProtected = isProtectedStatus('lost')
      expect(isProtected).toBe(true)
    })

    it('ignored reactivates to active on inbound_message_received (Batch A)', () => {
      const nextStatus = applyCustomerStatusEvent('ignored', 'inbound_message_received')
      expect(nextStatus).toBe('active')
    })

    it('lost reactivates to active on inbound_message_received (Batch A)', () => {
      const nextStatus = applyCustomerStatusEvent('lost', 'inbound_message_received')
      expect(nextStatus).toBe('active')
    })

    it('ignored has inbound_message_received as its only automatic transition', () => {
      const possibleTransitions = getPossibleTransitions('ignored')
      expect(possibleTransitions).toContain('active')
      expect(possibleTransitions.length).toBe(1)
    })

    it('lost has inbound_message_received as its only automatic transition', () => {
      const possibleTransitions = getPossibleTransitions('lost')
      expect(possibleTransitions).toContain('active')
      expect(possibleTransitions.length).toBe(1)
    })
  })

  describe('Workflow statuses remain unchanged', () => {
    it('new is not protected and has transitions', () => {
      const isProtected = isProtectedStatus('new')
      expect(isProtected).toBe(false)

      const possibleTransitions = getPossibleTransitions('new')
      expect(possibleTransitions.length).toBeGreaterThan(0)
    })

    it('active is not protected and has transitions', () => {
      const isProtected = isProtectedStatus('active')
      expect(isProtected).toBe(false)

      const possibleTransitions = getPossibleTransitions('active')
      expect(possibleTransitions.length).toBeGreaterThan(0)
    })
  })
})