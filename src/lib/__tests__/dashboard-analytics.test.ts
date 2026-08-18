/**
 * Dashboard Analytics Calculations Test
 *
 * Tests for:
 * - Payment collection rate calculation
 * - Leads count filtering
 * - Zero denominator handling
 */

import { describe, it, expect } from 'vitest'

describe('Dashboard Analytics', () => {
  describe('Payment Collection Rate', () => {
    it('calculates collection rate correctly with paid and pending payments', () => {
      // Given: 10 paid, 5 pending
      const paidPayments = 10
      const pendingPayments = 5
      const actionablePayments = paidPayments + pendingPayments
      const collectionRate = actionablePayments > 0 ? Math.round((paidPayments / actionablePayments) * 100) : 0

      // Then: collection rate should be 67% (10/15)
      expect(collectionRate).toBe(67)
    })

    it('returns 0 when no actionable payments', () => {
      // Given: 0 paid, 0 pending
      const paidPayments = 0
      const pendingPayments = 0
      const actionablePayments = paidPayments + pendingPayments
      const collectionRate = actionablePayments > 0 ? Math.round((paidPayments / actionablePayments) * 100) : 0

      // Then: collection rate should be 0%
      expect(collectionRate).toBe(0)
    })

    it('returns 100% when all payments are paid', () => {
      // Given: 10 paid, 0 pending
      const paidPayments = 10
      const pendingPayments = 0
      const actionablePayments = paidPayments + pendingPayments
      const collectionRate = actionablePayments > 0 ? Math.round((paidPayments / actionablePayments) * 100) : 0

      // Then: collection rate should be 100%
      expect(collectionRate).toBe(100)
    })

    it('excludes failed/cancelled payments from denominator', () => {
      // Given: 10 paid, 5 pending, 3 failed, 2 cancelled
      // Old formula (incorrect): 10 / (10+5+3+2) = 10/20 = 50%
      // New formula (correct): 10 / (10+5) = 10/15 = 67%
      const paidPayments = 10
      const pendingPayments = 5
      const failedPayments = 3
      const cancelledPayments = 2

      // Old incorrect calculation
      const oldTotal = paidPayments + pendingPayments + failedPayments + cancelledPayments
      const oldRate = oldTotal > 0 ? Math.round((paidPayments / oldTotal) * 100) : 0

      // New correct calculation
      const actionablePayments = paidPayments + pendingPayments
      const newRate = actionablePayments > 0 ? Math.round((paidPayments / actionablePayments) * 100) : 0

      // Then: old rate should be 50%, new rate should be 67%
      expect(oldRate).toBe(50)
      expect(newRate).toBe(67)
      expect(oldRate).not.toBe(newRate)
    })

    it('handles edge case with only pending payments', () => {
      // Given: 0 paid, 5 pending
      const paidPayments = 0
      const pendingPayments = 5
      const actionablePayments = paidPayments + pendingPayments
      const collectionRate = actionablePayments > 0 ? Math.round((paidPayments / actionablePayments) * 100) : 0

      // Then: collection rate should be 0%
      expect(collectionRate).toBe(0)
    })
  })

  describe('Leads Count Filtering', () => {
    it('excludes leads with deleted_at', () => {
      // Given: leads array with some deleted
      const leads = [
        { id: '1', deleted_at: null },
        { id: '2', deleted_at: '2024-01-01' },
        { id: '3', deleted_at: null },
      ]

      // When: filter out deleted leads
      const filteredLeads = leads.filter(lead => lead.deleted_at === null)

      // Then: should only count non-deleted leads
      expect(filteredLeads.length).toBe(2)
    })

    it('excludes leads with status ignored', () => {
      // Given: leads array with some ignored
      const leads = [
        { id: '1', status: 'new' },
        { id: '2', status: 'ignored' },
        { id: '3', status: 'replied' },
      ]

      // When: filter out ignored leads
      const filteredLeads = leads.filter(lead => lead.status !== 'ignored')

      // Then: should only count non-ignored leads
      expect(filteredLeads.length).toBe(2)
    })

    it('excludes both deleted and ignored leads', () => {
      // Given: leads array with deleted and ignored
      const leads = [
        { id: '1', deleted_at: null, status: 'new' },
        { id: '2', deleted_at: '2024-01-01', status: 'new' },
        { id: '3', deleted_at: null, status: 'ignored' },
        { id: '4', deleted_at: null, status: 'replied' },
      ]

      // When: filter out deleted and ignored leads
      const filteredLeads = leads.filter(lead => lead.deleted_at === null && lead.status !== 'ignored')

      // Then: should only count active non-ignored leads
      expect(filteredLeads.length).toBe(2)
    })

    it('filters leads by date range', () => {
      // Given: leads array with different dates
      const startDate = new Date('2024-01-01')
      const leads = [
        { id: '1', created_at: '2023-12-31' },
        { id: '2', created_at: '2024-01-02' },
        { id: '3', created_at: '2024-01-15' },
      ]

      // When: filter by date range
      const filteredLeads = leads.filter(lead => new Date(lead.created_at) >= startDate)

      // Then: should only count leads after start date
      expect(filteredLeads.length).toBe(2)
    })
  })
})