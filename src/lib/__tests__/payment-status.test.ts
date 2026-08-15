/**
 * Payment Status Utility Tests
 *
 * Tests for src/lib/payment-status.ts
 *
 * Critical invariants:
 * - Unknown payment statuses do NOT display as "New"
 * - All canonical statuses have proper labels and styling
 * - Normalization handles both 'cancelled' and 'canceled' spellings
 */

import { describe, it, expect } from '@jest/globals'
import {
  normalizePaymentStatus,
  getPaymentStatusStyle,
  getPaymentStatusLabel,
  PAYMENT_STATUS_STYLES,
  getAllPaymentStatuses
} from '@/lib/payment-status'

describe('Payment Status Utility', () => {
  describe('normalizePaymentStatus', () => {
    it('should normalize canonical statuses', () => {
      expect(normalizePaymentStatus('draft')).toBe('draft')
      expect(normalizePaymentStatus('pending')).toBe('pending')
      expect(normalizePaymentStatus('paid')).toBe('paid')
      expect(normalizePaymentStatus('failed')).toBe('failed')
      expect(normalizePaymentStatus('cancelled')).toBe('cancelled')
      expect(normalizePaymentStatus('expired')).toBe('expired')
    })

    it('should handle both cancelled and canceled spellings', () => {
      expect(normalizePaymentStatus('cancelled')).toBe('cancelled')
      expect(normalizePaymentStatus('canceled')).toBe('cancelled')
    })

    it('should handle case insensitivity', () => {
      expect(normalizePaymentStatus('DRAFT')).toBe('draft')
      expect(normalizePaymentStatus('Pending')).toBe('pending')
      expect(normalizePaymentStatus('PAID')).toBe('paid')
    })

    it('should handle whitespace', () => {
      expect(normalizePaymentStatus('  draft  ')).toBe('draft')
      expect(normalizePaymentStatus(' pending ')).toBe('pending')
    })

    it('should fall back to draft for unknown statuses', () => {
      expect(normalizePaymentStatus('unknown')).toBe('draft')
      expect(normalizePaymentStatus('random')).toBe('draft')
      expect(normalizePaymentStatus('')).toBe('draft')
      expect(normalizePaymentStatus(null)).toBe('draft')
      expect(normalizePaymentStatus(undefined)).toBe('draft')
    })

    it('should NOT fall back to "new" for unknown statuses', () => {
      // This is the critical invariant - unknown statuses should NOT become "new"
      const result = normalizePaymentStatus('unknown')
      expect(result).not.toBe('new')
      expect(result).toBe('draft')
    })
  })

  describe('getPaymentStatusStyle', () => {
    it('should return correct style for draft', () => {
      const style = getPaymentStatusStyle('draft')
      expect(style.label).toBe('Draft')
      expect(style.badgeClass).toContain('gray')
      expect(style.color).toBe('#94A3B8')
    })

    it('should return correct style for pending', () => {
      const style = getPaymentStatusStyle('pending')
      expect(style.label).toBe('Pending')
      expect(style.badgeClass).toContain('yellow')
      expect(style.color).toBe('#F59E0B')
    })

    it('should return correct style for paid', () => {
      const style = getPaymentStatusStyle('paid')
      expect(style.label).toBe('Paid')
      expect(style.badgeClass).toContain('green')
      expect(style.color).toBe('#10B981')
    })

    it('should return correct style for failed', () => {
      const style = getPaymentStatusStyle('failed')
      expect(style.label).toBe('Failed')
      expect(style.badgeClass).toContain('red')
      expect(style.color).toBe('#EF4444')
    })

    it('should return correct style for cancelled', () => {
      const style = getPaymentStatusStyle('cancelled')
      expect(style.label).toBe('Canceled')
      expect(style.badgeClass).toContain('gray')
      expect(style.color).toBe('#94A3B8')
    })

    it('should return correct style for canceled (alternative spelling)', () => {
      const style = getPaymentStatusStyle('canceled')
      expect(style.label).toBe('Canceled')
      expect(style.badgeClass).toContain('gray')
      expect(style.color).toBe('#94A3B8')
    })

    it('should return correct style for expired', () => {
      const style = getPaymentStatusStyle('expired')
      expect(style.label).toBe('Expired')
      expect(style.badgeClass).toContain('red')
      expect(style.color).toBe('#EF4444')
    })

    it('should return draft style for unknown statuses', () => {
      const style = getPaymentStatusStyle('unknown')
      expect(style.label).toBe('Draft')
      expect(style.badgeClass).toContain('gray')
    })

    it('should NOT return "New" label for unknown statuses', () => {
      const style = getPaymentStatusStyle('unknown')
      expect(style.label).not.toBe('New')
    })
  })

  describe('getPaymentStatusLabel', () => {
    it('should return correct labels for all statuses', () => {
      expect(getPaymentStatusLabel('draft')).toBe('Draft')
      expect(getPaymentStatusLabel('pending')).toBe('Pending')
      expect(getPaymentStatusLabel('paid')).toBe('Paid')
      expect(getPaymentStatusLabel('failed')).toBe('Failed')
      expect(getPaymentStatusLabel('cancelled')).toBe('Canceled')
      expect(getPaymentStatusLabel('expired')).toBe('Expired')
    })

    it('should NOT return "New" for unknown statuses', () => {
      const label = getPaymentStatusLabel('unknown')
      expect(label).not.toBe('New')
    })
  })

  describe('PAYMENT_STATUS_STYLES', () => {
    it('should have styles for all canonical statuses', () => {
      const statuses = ['draft', 'pending', 'paid', 'failed', 'cancelled', 'expired']
      statuses.forEach(status => {
        expect(PAYMENT_STATUS_STYLES).toHaveProperty(status)
        expect(PAYMENT_STATUS_STYLES[status]).toHaveProperty('label')
        expect(PAYMENT_STATUS_STYLES[status]).toHaveProperty('badgeClass')
        expect(PAYMENT_STATUS_STYLES[status]).toHaveProperty('color')
      })
    })

    it('should NOT have a "new" status', () => {
      expect(PAYMENT_STATUS_STYLES).not.toHaveProperty('new')
    })
  })

  describe('getAllPaymentStatuses', () => {
    it('should return all canonical payment statuses', () => {
      const statuses = getAllPaymentStatuses()
      expect(statuses).toContain('draft')
      expect(statuses).toContain('pending')
      expect(statuses).toContain('paid')
      expect(statuses).toContain('failed')
      expect(statuses).toContain('cancelled')
      expect(statuses).toContain('expired')
    })

    it('should NOT return "new" as a payment status', () => {
      const statuses = getAllPaymentStatuses()
      expect(statuses).not.toContain('new')
    })
  })

  describe('Critical Invariants', () => {
    it('unknown status → Draft (NOT New)', () => {
      const label = getPaymentStatusLabel('unknown_status')
      expect(label).toBe('Draft')
      expect(label).not.toBe('New')
    })

    it('null status → Draft (NOT New)', () => {
      const label = getPaymentStatusLabel(null)
      expect(label).toBe('Draft')
      expect(label).not.toBe('New')
    })

    it('undefined status → Draft (NOT New)', () => {
      const label = getPaymentStatusLabel(undefined)
      expect(label).toBe('Draft')
      expect(label).not.toBe('New')
    })

    it('empty string → Draft (NOT New)', () => {
      const label = getPaymentStatusLabel('')
      expect(label).toBe('Draft')
      expect(label).not.toBe('New')
    })
  })
})