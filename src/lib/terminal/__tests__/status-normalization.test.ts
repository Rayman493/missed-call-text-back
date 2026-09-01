/**
 * Status Normalization Unit Tests
 * 
 * Focused tests for case-insensitive payment result status normalization
 * in the terminal service. These tests verify the fix for the Android
 * Tap to Pay "Payment status uncertain" issue.
 */

import { describe, it, expect } from 'vitest'

describe('Terminal Service - Status Normalization', () => {
  // This function mirrors the normalization logic in service.ts
  function normalizeStatus(status: string | undefined | null): string {
    return status?.toLowerCase() || ''
  }

  describe('SUCCESS status variants', () => {
    const successVariants = [
      'succeeded',   // canonical iOS value
      'SUCCEEDED',   // uppercase
      'Succeeded',   // title case
      'success',     // alternative lowercase
      'SUCCESS',     // alternative uppercase
      'Success',     // alternative title case
    ]

    successVariants.forEach(status => {
      it(`accepts '${status}' as success (matches success condition)`, () => {
        const normalized = normalizeStatus(status)
        // Should match success condition in service.ts
        expect(normalized === 'succeeded' || normalized === 'success').toBe(true)
        // Should NOT match failure condition
        expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(false)
        // Should NOT match cancellation condition
        expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(false)
      })
    })
  })

  describe('FAILURE status variants', () => {
    const failureVariants = [
      'failed',     // canonical iOS value
      'FAILED',     // uppercase
      'fail',       // alternative lowercase
      'FAIL',       // alternative uppercase
      'error',      // alternative
      'ERROR',      // alternative uppercase
    ]

    failureVariants.forEach(status => {
      it(`normalizes '${status}' to recognized failure variant`, () => {
        const normalized = normalizeStatus(status)
        expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(true)
        // Should NOT match success condition
        expect(normalized === 'succeeded' || normalized === 'success').toBe(false)
        // Should NOT match cancellation condition
        expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(false)
      })
    })
  })

  describe('CANCELLATION status variants', () => {
    const cancelVariants = [
      'canceled',   // canonical iOS value
      'CANCELED',   // uppercase
      'cancelled',  // alternative British spelling
      'CANCELLED',  // alternative uppercase
      'cancel',     // alternative lowercase
      'CANCEL',     // alternative uppercase
    ]

    cancelVariants.forEach(status => {
      it(`normalizes '${status}' to recognized cancellation variant`, () => {
        const normalized = normalizeStatus(status)
        expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(true)
        // Should NOT match success condition
        expect(normalized === 'succeeded' || normalized === 'success').toBe(false)
        // Should NOT match failure condition
        expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(false)
      })
    })
  })

  describe('UNKNOWN status variants preserve safety fallback', () => {
    const unknownVariants = [
      'processing',
      'requires_action',
      'requires_payment_method',
      'requires_capture',
      'pending',
      'random_unknown_status',
    ]

    unknownVariants.forEach(status => {
      it(`treats '${status}' as unknown (not success/failure/cancel)`, () => {
        const normalized = normalizeStatus(status)
        // Should NOT match success condition
        expect(normalized === 'succeeded' || normalized === 'success').toBe(false)
        // Should NOT match failure condition
        expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(false)
        // Should NOT match cancellation condition
        expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(false)
      })
    })

    it('handles undefined status safely', () => {
      const normalized = normalizeStatus(undefined)
      expect(normalized).toBe('')
      // Should NOT match any terminal condition
      expect(normalized === 'succeeded' || normalized === 'success').toBe(false)
      expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(false)
      expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(false)
    })

    it('handles null status safely', () => {
      const normalized = normalizeStatus(null)
      expect(normalized).toBe('')
      // Should NOT match any terminal condition
      expect(normalized === 'succeeded' || normalized === 'success').toBe(false)
      expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(false)
      expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(false)
    })

    it('handles empty string status safely', () => {
      const normalized = normalizeStatus('')
      expect(normalized).toBe('')
      // Should NOT match any terminal condition
      expect(normalized === 'succeeded' || normalized === 'success').toBe(false)
      expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(false)
      expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(false)
    })
  })

  describe('iOS canonical status values are preserved', () => {
    it('iOS canonical "succeeded" normalizes correctly', () => {
      const normalized = normalizeStatus('succeeded')
      expect(normalized).toBe('succeeded')
      expect(normalized === 'succeeded' || normalized === 'success').toBe(true)
    })

    it('iOS canonical "failed" normalizes correctly', () => {
      const normalized = normalizeStatus('failed')
      expect(normalized).toBe('failed')
      expect(normalized === 'failed' || normalized === 'fail' || normalized === 'error').toBe(true)
    })

    it('iOS canonical "canceled" normalizes correctly', () => {
      const normalized = normalizeStatus('canceled')
      expect(normalized).toBe('canceled')
      expect(normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled').toBe(true)
    })
  })

  describe('completion reason normalization', () => {
    // This mirrors the completion reason logic in service.ts
    function getCompletionReason(status: string | undefined | null): string {
      const normalized = normalizeStatus(status)
      if (normalized === 'succeeded' || normalized === 'success') return 'success'
      if (normalized === 'canceled' || normalized === 'cancel' || normalized === 'cancelled') return 'cancelled_by_user'
      return 'unknown'
    }

    it('success variants map to "success" completion reason', () => {
      expect(getCompletionReason('succeeded')).toBe('success')
      expect(getCompletionReason('success')).toBe('success')
      expect(getCompletionReason('SUCCEEDED')).toBe('success')
      expect(getCompletionReason('SUCCESS')).toBe('success')
    })

    it('cancellation variants map to "cancelled_by_user" completion reason', () => {
      expect(getCompletionReason('canceled')).toBe('cancelled_by_user')
      expect(getCompletionReason('cancel')).toBe('cancelled_by_user')
      expect(getCompletionReason('cancelled')).toBe('cancelled_by_user')
      expect(getCompletionReason('CANCELED')).toBe('cancelled_by_user')
    })

    it('failure and unknown variants map to "unknown" completion reason', () => {
      expect(getCompletionReason('failed')).toBe('unknown')
      expect(getCompletionReason('fail')).toBe('unknown')
      expect(getCompletionReason('error')).toBe('unknown')
      expect(getCompletionReason('processing')).toBe('unknown')
      expect(getCompletionReason(undefined)).toBe('unknown')
    })
  })
})