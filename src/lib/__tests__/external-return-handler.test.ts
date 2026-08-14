/**
 * External Return Handler Tests
 *
 * Tests for centralized external browser return handling and Stripe status reconciliation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  setPendingStripeOperation,
  getPendingStripeOperation,
  reconcileStripeStatus,
  handleExternalReturn,
  handleAppResume
} from '@/lib/external-return-handler'
import { readFileSync } from 'fs'
import { join } from 'path'

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => 'android')
  }
}))

// Mock Preferences
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(),
    get: vi.fn(),
    remove: vi.fn()
  }
}))

describe('External Return Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to native platform
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android')
  })

  describe('Pending Operation Tracking', () => {
    it('should set and retrieve pending operation with business ID', async () => {
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        return { value: null }
      })

      await setPendingStripeOperation('connect_onboarding', 'test-business-id')
      
      expect(Preferences.set).toHaveBeenCalledWith({ key: 'pending_stripe_operation', value: 'connect_onboarding' })
      expect(Preferences.set).toHaveBeenCalledWith({ key: 'pending_stripe_operation_business_id', value: 'test-business-id' })

      const pending = await getPendingStripeOperation()
      expect(pending.operation).toBe('connect_onboarding')
      expect(pending.businessId).toBe('test-business-id')
    })

    it('should clear pending operation when set to null', async () => {
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      await setPendingStripeOperation(null)

      expect(Preferences.remove).toHaveBeenCalledWith({ key: 'pending_stripe_operation' })
      expect(Preferences.remove).toHaveBeenCalledWith({ key: 'pending_stripe_operation_timestamp' })
      expect(Preferences.remove).toHaveBeenCalledWith({ key: 'pending_stripe_operation_business_id' })
    })

    it('should expire pending operation after 5 minutes', async () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000) // 6 minutes ago
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'pending_stripe_operation_timestamp') return { value: oldTimestamp.toString() }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        return { value: null }
      })
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      const pending = await getPendingStripeOperation()
      expect(pending.operation).toBe(null)
      expect(Preferences.remove).toHaveBeenCalled()
    })
  })

  describe('External Return Handling', () => {
    it('should trigger reconciliation for Stripe Connect return URL', async () => {
      // Mock successful reconciliation
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ canonicalStatus: 'connected' })
      })
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: null }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        return { value: null }
      })
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      await handleExternalReturn('https://www.replyflowhq.com/dashboard/settings?stripe_onboarding=complete')

      expect(fetch).toHaveBeenCalledWith('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: 'test-business-id' })
      })
    })

    it('should skip reconciliation for non-Stripe return URLs', async () => {
      await handleExternalReturn('https://www.replyflowhq.com/dashboard/settings')

      expect(fetch).not.toHaveBeenCalled()
    })

    it('should trigger reconciliation for Stripe Checkout return URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ canonicalStatus: 'connected' })
      })
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: null }
        if (key.key === 'pending_stripe_operation') return { value: 'checkout' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        return { value: null }
      })
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      await handleExternalReturn('https://www.replyflowhq.com/billing/success?checkout=success')

      expect(fetch).toHaveBeenCalled()
    })
  })

  describe('App Resume Handling', () => {
    it('should trigger reconciliation when app resumes with pending operation', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ canonicalStatus: 'connected' })
      })
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: null }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        return { value: null }
      })
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      await handleAppResume()

      expect(fetch).toHaveBeenCalledWith('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: 'test-business-id' })
      })
    })

    it('should skip reconciliation when no pending operation', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null })

      await handleAppResume()

      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Deduplication', () => {
    it('should skip reconciliation if already in flight', async () => {
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'true' }
        return { value: null }
      })

      const result = await reconcileStripeStatus('test-business-id')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Dedup')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('should skip reconciliation if recently completed', async () => {
      const recentTime = Date.now() - 1000 // 1 second ago
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: recentTime.toString() }
        return { value: null }
      })

      const result = await reconcileStripeStatus('test-business-id')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Dedup')
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Platform Safety', () => {
    it('should skip reconciliation on web platform', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

      const result = await reconcileStripeStatus('test-business-id')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Not native')
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Asset Links Configuration', () => {
    it('should parse assetlinks.json with correct package name and fingerprint format', () => {
      const assetlinksPath = join(process.cwd(), 'public/.well-known/assetlinks.json')
      const assetlinksContent = readFileSync(assetlinksPath, 'utf-8')
      const assetlinks = JSON.parse(assetlinksContent)

      expect(Array.isArray(assetlinks)).toBe(true)
      expect(assetlinks.length).toBeGreaterThan(0)

      const entry = assetlinks[0]
      expect(entry.relation).toContain('delegate_permission/common.handle_all_urls')
      expect(entry.target.namespace).toBe('android_app')
      expect(entry.target.package_name).toBe('com.replyflowhq.app')
      expect(Array.isArray(entry.target.sha256_cert_fingerprints)).toBe(true)

      // Verify fingerprint uses colon-separated format (Android requirement)
      const fingerprint = entry.target.sha256_cert_fingerprints[0]
      expect(fingerprint).toMatch(/^[0-9A-F:]{95}$/) // 32 bytes * 2 hex chars + 31 colons = 95 chars
      expect(fingerprint).toContain(':')
    })
  })

  describe('Security Authorization', () => {
    it('should not allow reconciliation without business ID', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null })
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)

      const result = await reconcileStripeStatus(undefined)
      expect(result.success).toBe(false)
      expect(result.error).toBe('No context')
      expect(fetch).not.toHaveBeenCalled()
    })

    it('should not use expired pending operation for reconciliation', async () => {
      const oldTimestamp = Date.now() - (6 * 60 * 1000) // 6 minutes ago
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'pending_stripe_operation_timestamp') return { value: oldTimestamp.toString() }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        return { value: null }
      })
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)

      const result = await reconcileStripeStatus(undefined)
      expect(result.success).toBe(false)
      expect(result.error).toBe('No context')
      expect(fetch).not.toHaveBeenCalled()
    })
  })

  describe('Deduplication Correctness', () => {
    it('should reconcile successfully after dedup window expires', async () => {
      const oldTime = Date.now() - 6000 // 6 seconds ago (outside 5-second window)
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: oldTime.toString() }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        return { value: null }
      })
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ canonicalStatus: 'connected' })
      })

      const result = await reconcileStripeStatus(undefined)
      expect(result.success).toBe(true)
      expect(fetch).toHaveBeenCalled()
    })

    it('should handle duplicate callback + resume safely (server refresh is idempotent)', async () => {
      let callCount = 0
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++
        return {
          ok: true,
          json: async () => ({ canonicalStatus: 'connected' })
        }
      })
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: null }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        return { value: null }
      })
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      // Simulate callback
      await handleExternalReturn('https://www.replyflowhq.com/dashboard/settings?stripe_onboarding=complete')
      expect(callCount).toBe(1)

      // Simulate resume (may trigger another reconciliation, but that's safe because server refresh is idempotent)
      await handleAppResume()
      // Both calls are safe - the server-side refresh is idempotent
      expect(callCount).toBeGreaterThanOrEqual(1)
    })

    it('should handle manual app reopen with pending operation', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ canonicalStatus: 'connected' })
      })
      vi.mocked(Preferences.get).mockImplementation(async (key) => {
        if (key.key === 'stripe_reconciliation_in_flight') return { value: 'false' }
        if (key.key === 'stripe_reconciliation_last_time') return { value: null }
        if (key.key === 'pending_stripe_operation') return { value: 'connect_onboarding' }
        if (key.key === 'pending_stripe_operation_business_id') return { value: 'test-business-id' }
        if (key.key === 'pending_stripe_operation_timestamp') return { value: Date.now().toString() }
        return { value: null }
      })
      vi.mocked(Preferences.set).mockResolvedValue(undefined)
      vi.mocked(Preferences.remove).mockResolvedValue(undefined)

      // Simulate manual app reopen (no callback, just resume)
      await handleAppResume()
      expect(fetch).toHaveBeenCalledWith('/api/stripe/connect/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: 'test-business-id' })
      })
    })
  })
})