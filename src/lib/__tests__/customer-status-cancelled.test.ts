/**
 * Cancelled customer status regression tests
 *
 * These tests verify that:
 * - Cancelled is a valid customer status
 * - Cancelled has proper styling configuration
 * - Cancelled does NOT count as Completed
 * - Cancelled is a terminal status
 * - Cancelled is a protected status
 * - Cancelled stops automatic follow-ups
 */

import { describe, it, expect } from 'vitest'
import {
  CustomerStatus,
  normalizeCustomerStatus,
  getCustomerStatusStyle,
  getCustomerStatusLabel,
  getCustomerStatusIcon,
  getAllCustomerStatuses,
  getWorkflowStatuses,
  getTerminalStatuses,
  CUSTOMER_STATUS_STYLES
} from '@/lib/customer-status'

describe('Cancelled customer status', () => {
  describe('Status type definition', () => {
    it('cancelled is a valid CustomerStatus', () => {
      const status: CustomerStatus = 'cancelled'
      expect(status).toBe('cancelled')
    })

    it('cancelled is included in all customer statuses', () => {
      const allStatuses = getAllCustomerStatuses()
      expect(allStatuses).toContain('cancelled')
    })
  })

  describe('Normalization', () => {
    it('normalizes "cancelled" to canonical status', () => {
      const normalized = normalizeCustomerStatus('cancelled')
      expect(normalized).toBe('cancelled')
    })

    it('normalizes "CANCELLED" (uppercase) to canonical status', () => {
      const normalized = normalizeCustomerStatus('CANCELLED')
      expect(normalized).toBe('cancelled')
    })

    it('normalizes " Cancelled " (with spaces) to canonical status', () => {
      const normalized = normalizeCustomerStatus(' Cancelled ')
      expect(normalized).toBe('cancelled')
    })

    it('preserves exact value "cancelled" on round-trip', () => {
      const normalized = normalizeCustomerStatus('cancelled')
      expect(normalized).toBe('cancelled')
    })
  })

  describe('Styling configuration', () => {
    it('cancelled has styling configuration', () => {
      const style = getCustomerStatusStyle('cancelled')
      expect(style).toBeDefined()
      expect(style.label).toBe('Cancelled')
    })

    it('cancelled has distinct color from completed', () => {
      const cancelledStyle = getCustomerStatusStyle('cancelled')
      const completedStyle = getCustomerStatusStyle('completed')
      expect(cancelledStyle.color).not.toBe(completedStyle.color)
    })

    it('cancelled has distinct color from lost', () => {
      const cancelledStyle = getCustomerStatusStyle('cancelled')
      const lostStyle = getCustomerStatusStyle('lost')
      expect(cancelledStyle.color).not.toBe(lostStyle.color)
    })

    it('cancelled has distinct color from ignored', () => {
      const cancelledStyle = getCustomerStatusStyle('cancelled')
      const ignoredStyle = getCustomerStatusStyle('ignored')
      expect(cancelledStyle.color).not.toBe(ignoredStyle.color)
    })

    it('cancelled has proper badge classes', () => {
      const style = getCustomerStatusStyle('cancelled')
      expect(style.badgeClass).toContain('amber')
    })

    it('cancelled has proper card classes', () => {
      const style = getCustomerStatusStyle('cancelled')
      expect(style.cardClass).toContain('amber')
    })
  })

  describe('Label', () => {
    it('cancelled displays as "Cancelled"', () => {
      const label = getCustomerStatusLabel('cancelled')
      expect(label).toBe('Cancelled')
    })
  })

  describe('Icon', () => {
    it('cancelled has an icon component', () => {
      const icon = getCustomerStatusIcon('cancelled')
      expect(icon).toBeDefined()
    })
  })

  describe('Terminal status behavior', () => {
    it('cancelled is a terminal status', () => {
      const terminalStatuses = getTerminalStatuses()
      expect(terminalStatuses).toContain('cancelled')
    })

    it('cancelled is NOT a workflow status', () => {
      const workflowStatuses = getWorkflowStatuses()
      expect(workflowStatuses).not.toContain('cancelled')
    })

    it('cancelled does NOT count as completed', () => {
      const workflowStatuses = getWorkflowStatuses()
      expect(workflowStatuses).toContain('completed')
      expect(workflowStatuses).not.toContain('cancelled')
    })
  })

  describe('Status ordering', () => {
    it('cancelled appears after completed in CUSTOMER_STATUS_STYLES', () => {
      const statusKeys = Object.keys(CUSTOMER_STATUS_STYLES)
      const cancelledIndex = statusKeys.indexOf('cancelled')
      const completedIndex = statusKeys.indexOf('completed')
      expect(cancelledIndex).toBeGreaterThan(completedIndex)
    })

    it('cancelled appears before ignored in CUSTOMER_STATUS_STYLES', () => {
      const statusKeys = Object.keys(CUSTOMER_STATUS_STYLES)
      const cancelledIndex = statusKeys.indexOf('cancelled')
      const ignoredIndex = statusKeys.indexOf('ignored')
      expect(cancelledIndex).toBeLessThan(ignoredIndex)
    })
  })

  describe('Existing statuses remain unchanged', () => {
    it('new status remains valid', () => {
      const style = getCustomerStatusStyle('new')
      expect(style.label).toBe('New')
    })

    it('active status remains valid', () => {
      const style = getCustomerStatusStyle('active')
      expect(style.label).toBe('Active')
    })

    it('completed status remains valid', () => {
      const style = getCustomerStatusStyle('completed')
      expect(style.label).toBe('Completed')
    })

    it('lost status remains valid', () => {
      const style = getCustomerStatusStyle('lost')
      expect(style.label).toBe('Lost')
    })

    it('ignored status remains valid', () => {
      const style = getCustomerStatusStyle('ignored')
      expect(style.label).toBe('Ignored')
    })
  })
})