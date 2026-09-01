/**
 * Payment Collection Graph Color Resolution Test
 *
 * Tests that STATUS_COLORS correctly extracts color values from PAYMENT_STATUS_STYLES.
 */

import { describe, it, expect } from 'vitest'
import { PAYMENT_STATUS_STYLES, normalizePaymentStatus } from '@/lib/payment-status'

describe('PaymentCollectionGraph - Color Resolution', () => {
  it('should extract valid color for paid status', () => {
    const STATUS_COLORS: Record<string, string> = Object.fromEntries(
      Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
    )

    expect(STATUS_COLORS['paid']).toBe('#10B981')
    expect(STATUS_COLORS['paid']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should extract valid color for pending status', () => {
    const STATUS_COLORS: Record<string, string> = Object.fromEntries(
      Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
    )

    expect(STATUS_COLORS['pending']).toBe('#F59E0B')
    expect(STATUS_COLORS['pending']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should extract valid color for draft status', () => {
    const STATUS_COLORS: Record<string, string> = Object.fromEntries(
      Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
    )

    expect(STATUS_COLORS['draft']).toBe('#94A3B8')
    expect(STATUS_COLORS['draft']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should extract valid color for failed status', () => {
    const STATUS_COLORS: Record<string, string> = Object.fromEntries(
      Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
    )

    expect(STATUS_COLORS['failed']).toBe('#EF4444')
    expect(STATUS_COLORS['failed']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should extract valid color for cancelled status', () => {
    const STATUS_COLORS: Record<string, string> = Object.fromEntries(
      Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
    )

    expect(STATUS_COLORS['cancelled']).toBe('#94A3B8')
    expect(STATUS_COLORS['cancelled']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should extract valid color for expired status', () => {
    const STATUS_COLORS: Record<string, string> = Object.fromEntries(
      Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
    )

    expect(STATUS_COLORS['expired']).toBe('#EF4444')
    expect(STATUS_COLORS['expired']).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should produce chart data with valid color for single paid payment', () => {
    const statusCounts = { paid: 1 }
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
      { name: 'Paid', value: 1, color: '#10B981' }
    ])
    expect(chartData[0].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('should normalize non-canonical status values', () => {
    // Test various non-canonical forms
    expect(normalizePaymentStatus('Paid')).toBe('paid')
    expect(normalizePaymentStatus('PAID')).toBe('paid')
    expect(normalizePaymentStatus('SUCCEEDED')).toBe('draft') // unknown falls back to draft
    expect(normalizePaymentStatus('COMPLETED')).toBe('draft') // unknown falls back to draft
    expect(normalizePaymentStatus(null)).toBe('draft')
    expect(normalizePaymentStatus(undefined)).toBe('draft')
    expect(normalizePaymentStatus('')).toBe('draft')
  })

  it('should handle single pending payment with normalization', () => {
    const rawPayments = [{ status: 'PENDING' }] // non-canonical uppercase
    const statusCounts: { [key: string]: number } = {}
    rawPayments.forEach((payment: any) => {
      const canonicalStatus = normalizePaymentStatus(payment.status)
      statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
    })

    expect(statusCounts).toEqual({ pending: 1 })
  })
})