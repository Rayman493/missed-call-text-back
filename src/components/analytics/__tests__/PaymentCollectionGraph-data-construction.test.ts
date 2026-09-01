/**
 * Payment Collection Graph Data Construction Test
 *
 * Tests the data flow from raw payments to chart data to summary.
 * This reproduces the exact scenario: 1 paid payment, 0 pending.
 */

import { describe, it, expect } from 'vitest'
import { normalizePaymentStatus, PAYMENT_STATUS_STYLES } from '@/lib/payment-status'

describe('PaymentCollectionGraph - Data Construction', () => {
  describe('Single Paid Payment Scenario', () => {
    it('should construct chart data with one non-zero status', () => {
      // Simulate raw payments from database
      const rawPayments = [
        { status: 'paid' }
      ]

      // Count by status using canonical normalization (matching component implementation)
      const statusCounts: { [key: string]: number } = {}
      rawPayments.forEach((payment: any) => {
        const canonicalStatus = normalizePaymentStatus(payment.status)
        statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
      })

      // Expected: { paid: 1 }
      expect(statusCounts).toEqual({ paid: 1 })

      // Status order (line 78)
      const statusOrder = ['pending', 'paid', 'draft', 'failed', 'expired', 'cancelled']

      // Use canonical payment status configuration from payment-status.ts
      const STATUS_COLORS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
      )
      const STATUS_LABELS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.label])
      )

      // Map to chart data (lines 79-87)
      const chartData = statusOrder.map((status) => {
        const count = statusCounts[status] || 0
        if (count === 0) return null
        return {
          name: STATUS_LABELS[status] || status,
          value: count,
          color: STATUS_COLORS[status] || '#94A3B8'
        }
      }).filter((item): item is any => item !== null)

      // Expected: only Paid with value 1
      expect(chartData).toEqual([
        { name: 'Paid', value: 1, color: '#10B981' }
      ])
      expect(chartData.length).toBe(1)

      // Calculate summary KPIs (lines 104-106)
      const totalPayments = chartData.reduce((sum, item) => sum + item.value, 0)
      const paidPayments = chartData.find(d => d.name === 'Paid')?.value || 0
      const pendingPayments = chartData.find(d => d.name === 'Pending')?.value || 0

      // Expected summary
      expect(totalPayments).toBe(1)
      expect(paidPayments).toBe(1)
      expect(pendingPayments).toBe(0)

      // isEmpty check (line 101)
      const isEmpty = chartData.length === 0
      expect(isEmpty).toBe(false)

      // Chart should render (line 126)
      const shouldRenderChart = !isEmpty
      expect(shouldRenderChart).toBe(true)
    })

    it('should construct chart data with one pending payment', () => {
      const rawPayments = [
        { status: 'pending' }
      ]

      const statusCounts: { [key: string]: number } = {}
      rawPayments.forEach((payment: any) => {
        const canonicalStatus = normalizePaymentStatus(payment.status)
        statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
      })

      expect(statusCounts).toEqual({ pending: 1 })

      const statusOrder = ['pending', 'paid', 'draft', 'failed', 'expired', 'cancelled']
      const STATUS_COLORS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
      )
      const STATUS_LABELS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.label])
      )

      const chartData = statusOrder.map((status) => {
        const count = statusCounts[status] || 0
        if (count === 0) return null
        return {
          name: STATUS_LABELS[status] || status,
          value: count,
          color: STATUS_COLORS[status] || '#94A3B8'
        }
      }).filter((item): item is any => item !== null)

      expect(chartData).toEqual([
        { name: 'Pending', value: 1, color: '#F59E0B' }
      ])

      const totalPayments = chartData.reduce((sum, item) => sum + item.value, 0)
      const paidPayments = chartData.find(d => d.name === 'Paid')?.value || 0
      const pendingPayments = chartData.find(d => d.name === 'Pending')?.value || 0

      expect(totalPayments).toBe(1)
      expect(paidPayments).toBe(0)
      expect(pendingPayments).toBe(1)
    })

    it('should construct chart data with zero payments', () => {
      const rawPayments: any[] = []

      const statusCounts: { [key: string]: number } = {}
      rawPayments.forEach((payment: any) => {
        const canonicalStatus = normalizePaymentStatus(payment.status)
        statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
      })

      expect(statusCounts).toEqual({})

      const statusOrder = ['pending', 'paid', 'draft', 'failed', 'expired', 'cancelled']
      const STATUS_COLORS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
      )
      const STATUS_LABELS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.label])
      )

      const chartData = statusOrder.map((status) => {
        const count = statusCounts[status] || 0
        if (count === 0) return null
        return {
          name: STATUS_LABELS[status] || status,
          value: count,
          color: STATUS_COLORS[status] || '#94A3B8'
        }
      }).filter((item): item is any => item !== null)

      expect(chartData).toEqual([])

      const isEmpty = chartData.length === 0
      expect(isEmpty).toBe(true)
    })

    it('should construct chart data with multiple statuses', () => {
      const rawPayments = [
        { status: 'paid' },
        { status: 'paid' },
        { status: 'pending' },
        { status: 'draft' }
      ]

      const statusCounts: { [key: string]: number } = {}
      rawPayments.forEach((payment: any) => {
        const canonicalStatus = normalizePaymentStatus(payment.status)
        statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
      })

      expect(statusCounts).toEqual({ paid: 2, pending: 1, draft: 1 })

      const statusOrder = ['pending', 'paid', 'draft', 'failed', 'expired', 'cancelled']
      const STATUS_COLORS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
      )
      const STATUS_LABELS: Record<string, string> = Object.fromEntries(
        Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.label])
      )

      const chartData = statusOrder.map((status) => {
        const count = statusCounts[status] || 0
        if (count === 0) return null
        return {
          name: STATUS_LABELS[status] || status,
          value: count,
          color: STATUS_COLORS[status] || '#94A3B8'
        }
      }).filter((item): item is any => item !== null)

      expect(chartData).toEqual([
        { name: 'Pending', value: 1, color: '#F59E0B' },
        { name: 'Paid', value: 2, color: '#10B981' },
        { name: 'Draft', value: 1, color: '#94A3B8' }
      ])

      const totalPayments = chartData.reduce((sum, item) => sum + item.value, 0)
      expect(totalPayments).toBe(4)
    })
  })
})