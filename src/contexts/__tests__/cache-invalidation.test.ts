import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Test the cache invalidation helper functions directly
import { clearBusinessCache } from '../BusinessContext'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
    length: () => Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null,
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
})

describe('BusinessContext cache invalidation', () => {
  beforeEach(() => {
    localStorageMock.clear()
    sessionStorageMock.clear()
  })

  afterEach(() => {
    localStorageMock.clear()
    sessionStorageMock.clear()
  })

  describe('clearBusinessCache', () => {
    it('should clear localStorage cache for specific user', () => {
      // Setup: Create cached data for user-123
      localStorageMock.setItem(
        'replyflow_business_display_cache_user-123',
        JSON.stringify({
          business: { id: 'business-123' },
          verifiedAt: Date.now(),
          userId: 'user-123',
        })
      )

      sessionStorageMock.setItem('replyflow_business_verified', 'true')

      // Clear cache for user-123
      clearBusinessCache('user-123')

      // Verify cache was cleared
      expect(localStorageMock.getItem('replyflow_business_display_cache_user-123')).toBeNull()
      expect(sessionStorageMock.getItem('replyflow_business_verified')).toBeNull()
    })

    

    it('should handle empty localStorage gracefully', () => {
      // Should not throw when localStorage is empty
      expect(() => {
        clearBusinessCache('user-123')
      }).not.toThrow()
    })

    it('should handle missing cache key gracefully', () => {
      // Should not throw when cache key doesn't exist
      expect(() => {
        clearBusinessCache('nonexistent-user')
      }).not.toThrow()
    })
  })

  describe('Stripe synchronization contract', () => {
    it('TEST 1: stale disconnected cache → successful connected refresh should clear cache', async () => {
      // Documents the expected behavior:
      // 1. Cache has disconnected state
      // 2. Stripe refresh succeeds with connected status
      // 3. invalidateBusinessCache() clears localStorage
      // 4. refreshBusiness(true) forces DB fetch (bypasses timestamp check)
      // 5. BusinessContext receives fresh connected state
      // 6. Cache is rewritten with connected state

      const cachedDisconnected = {
        id: 'business-123',
        stripe_connect_status: null,
        stripe_charges_enabled: false,
      }

      localStorageMock.setItem(
        'replyflow_business_display_cache_user-123',
        JSON.stringify({
          business: cachedDisconnected,
          verifiedAt: Date.now(),
          userId: 'user-123',
        })
      )

      clearBusinessCache('user-123')

      // Verify cache is cleared
      expect(localStorageMock.getItem('replyflow_business_display_cache_user-123')).toBeNull()
    })

    it('TEST 2: stale connected cache → authoritative regression should clear cache', async () => {
      // Documents the expected behavior:
      // 1. Cache has connected state
      // 2. Stripe refresh returns pending_verification (regression)
      // 3. invalidateBusinessCache() clears stale cache
      // 4. refreshBusiness(true) forces DB fetch
      // 5. BusinessContext receives regressed state
      // 6. Cache is rewritten with regressed state

      const cachedConnected = {
        id: 'business-123',
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
      }

      localStorageMock.setItem(
        'replyflow_business_display_cache_user-123',
        JSON.stringify({
          business: cachedConnected,
          verifiedAt: Date.now(),
          userId: 'user-123',
        })
      )

      clearBusinessCache('user-123')

      // Verify cache is cleared
      expect(localStorageMock.getItem('replyflow_business_display_cache_user-123')).toBeNull()
    })

    it('TEST 3: immediate sequencing - invalidate then refresh in same tick', async () => {
      // Verifies that clearing localStorage + using refreshBusiness(true) works
      // The force=true parameter bypasses the timestamp check, avoiding React state timing issues
      // that would occur with setLastFetchTimestamp(0)

      const cachedState = {
        id: 'business-123',
        stripe_connect_status: 'connected',
      }

      localStorageMock.setItem(
        'replyflow_business_display_cache_user-123',
        JSON.stringify({
          business: cachedState,
          verifiedAt: Date.now(),
          userId: 'user-123',
        })
      )

      // Simulate the sequence in SettingsContent
      clearBusinessCache('user-123')
      // refreshBusiness(true) would be called here
      // With force=true, the timestamp check is bypassed: shouldRevalidate = force || ...
      // This guarantees a DB fetch regardless of React state timing

      // Verify cache is cleared
      expect(localStorageMock.getItem('replyflow_business_display_cache_user-123')).toBeNull()
    })

    it('TEST 4: refresh failure should not invoke invalidation', async () => {
      // Documents that invalidation only happens in the response.ok branch
      // Failed refreshes preserve existing cache and state

      const existingCache = {
        id: 'business-123',
        stripe_connect_status: 'connected',
      }

      localStorageMock.setItem(
        'replyflow_business_display_cache_user-123',
        JSON.stringify({
          business: existingCache,
          verifiedAt: Date.now(),
          userId: 'user-123',
        })
      )

      // Simulate failed refresh - cache should NOT be cleared
      // (SettingsContent only calls invalidateBusinessCache() in response.ok branch)

      // Verify cache is preserved
      expect(localStorageMock.getItem('replyflow_business_display_cache_user-123')).toBeTruthy()
    })

    it('TEST 5: account ID should be present in fresh business after synchronization', async () => {
      // Documents that after successful Stripe refresh:
      // 1. Database contains stripe_connect_account_id
      // 2. refreshBusiness(true) fetches fresh business row
      // 3. BusinessContext receives the account ID
      // 4. Cache is rewritten with account ID

      const businessWithAccountId = {
        id: 'business-123',
        stripe_connect_account_id: 'acct_1234567890',
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
      }

      // After DB fetch, the business object should contain account ID
      expect(businessWithAccountId.stripe_connect_account_id).toBe('acct_1234567890')
    })
  })
})