/**
 * Cancelled status transition tests
 *
 * These tests verify that:
 * - Cancelled is a protected status
 * - Cancelled does not receive automatic transitions
 * - Cancelled stops follow-up automation
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

    it('cancelled does not transition on inbound_message_received', () => {
      const nextStatus = applyCustomerStatusEvent('cancelled', 'inbound_message_received')
      expect(nextStatus).toBe(null)
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
    it('cancelled has no possible automatic transitions', () => {
      const possibleTransitions = getPossibleTransitions('cancelled')
      expect(possibleTransitions).toEqual([])
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

    it('ignored has no possible automatic transitions', () => {
      const possibleTransitions = getPossibleTransitions('ignored')
      expect(possibleTransitions).toEqual([])
    })

    it('lost has no possible automatic transitions', () => {
      const possibleTransitions = getPossibleTransitions('lost')
      expect(possibleTransitions).toEqual([])
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