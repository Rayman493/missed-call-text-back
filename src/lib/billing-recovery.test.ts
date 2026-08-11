import { describe, it, expect } from 'vitest'
import { shouldTriggerAppRecovery, needsNativeReturnMarker } from './billing-recovery'

describe('billing-recovery', () => {
  describe('shouldTriggerAppRecovery', () => {
    it('returns true when return_to_app marker is present and recovery marker is absent', () => {
      const url = 'https://replyflowhq.com/billing/success?session_id=cs_test&return_to_app=1'
      expect(shouldTriggerAppRecovery(url)).toBe(true)
    })

    it('returns false when recovery marker is present (already recovered)', () => {
      const url = 'https://replyflowhq.com/billing/success?session_id=cs_test&return_to_app=1&recovery=1'
      expect(shouldTriggerAppRecovery(url)).toBe(false)
    })

    it('returns false when return_to_app marker is absent (desktop/web checkout)', () => {
      const url = 'https://replyflowhq.com/billing/success?session_id=cs_test'
      expect(shouldTriggerAppRecovery(url)).toBe(false)
    })

    it('returns false for invalid URLs', () => {
      expect(shouldTriggerAppRecovery('not-a-url')).toBe(false)
    })

    it('returns false when only recovery marker is present (should not happen)', () => {
      const url = 'https://replyflowhq.com/billing/success?session_id=cs_test&recovery=1'
      expect(shouldTriggerAppRecovery(url)).toBe(false)
    })
  })

  describe('needsNativeReturnMarker', () => {
    it('returns true for native iOS', () => {
      expect(needsNativeReturnMarker(true, 'ios')).toBe(true)
    })

    it('returns false for native Android', () => {
      expect(needsNativeReturnMarker(true, 'android')).toBe(false)
    })

    it('returns false for web platform', () => {
      expect(needsNativeReturnMarker(false, 'web')).toBe(false)
    })

    it('returns false for native web (edge case)', () => {
      expect(needsNativeReturnMarker(true, 'web')).toBe(false)
    })

    it('returns false for non-native iOS (should not happen)', () => {
      expect(needsNativeReturnMarker(false, 'ios')).toBe(false)
    })
  })
})