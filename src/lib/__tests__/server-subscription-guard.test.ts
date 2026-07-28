import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the subscription utils
vi.mock('../subscription-utils', () => ({
  hasActiveAccess: vi.fn((business: any) => {
    if (!business) return false
    const activeStatuses = ['active', 'trialing', 'beta', 'comped']
    if (activeStatuses.includes(business.subscription_status)) return true
    if (business.manual_access_enabled && business.manual_access_expires_at) {
      const expiresAt = new Date(business.manual_access_expires_at)
      return expiresAt > new Date()
    }
    return false
  }),
  hasActiveManualAccess: vi.fn((business: any) => {
    if (!business || !business.manual_access_enabled) return false
    if (!business.manual_access_expires_at) return false
    const expiresAt = new Date(business.manual_access_expires_at)
    return expiresAt > new Date()
  })
}))

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn()
      }))
    }))
  }))
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}))

import { requireSubscriptionAccessWithClient } from '../server-subscription-guard'

describe('Server Subscription Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('requireSubscriptionAccessWithClient', () => {
    it('should return success for active subscription', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'active',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.business).toEqual(mockBusiness)
      }
    })

    it('should return success for trialing subscription', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'trialing',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.business).toEqual(mockBusiness)
      }
    })

    it('should return success for beta subscription', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'beta',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.business).toEqual(mockBusiness)
      }
    })

    it('should return success for comped subscription', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'comped',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.business).toEqual(mockBusiness)
      }
    })

    it('should return success for active manual access', async () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 30)

      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'past_due',
        manual_access_enabled: true,
        manual_access_expires_at: futureDate.toISOString()
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.business).toEqual(mockBusiness)
      }
    })

    it('should return error for inactive subscription', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'past_due',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(403)
        expect(result.code).toBe('SUBSCRIPTION_REQUIRED')
      }
    })

    it('should return error for canceled subscription', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'canceled',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(403)
        expect(result.code).toBe('SUBSCRIPTION_REQUIRED')
      }
    })

    it('should return error for expired manual access', async () => {
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 30)

      const mockBusiness = {
        id: 'biz1',
        user_id: 'user1',
        subscription_status: 'past_due',
        manual_access_enabled: true,
        manual_access_expires_at: pastDate.toISOString()
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(403)
        expect(result.code).toBe('SUBSCRIPTION_REQUIRED')
      }
    })

    it('should return 404 when business not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { code: 'PGRST116' } }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(404)
        expect(result.code).toBe('BUSINESS_NOT_FOUND')
      }
    })

    it('should throw error for unexpected Supabase query errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: { code: '42501', message: 'Permission denied' } }))
          }))
        }))
      })

      await expect(requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')).rejects.toThrow('Business lookup failed')
    })

    it('should return 403 when user does not own business', async () => {
      const mockBusiness = {
        id: 'biz1',
        user_id: 'different_user',
        subscription_status: 'active',
        manual_access_enabled: false,
        manual_access_expires_at: null
      }

      mockSupabase.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: mockBusiness, error: null }))
          }))
        }))
      })

      const result = await requireSubscriptionAccessWithClient(mockSupabase as any, 'user1')

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.statusCode).toBe(403)
        expect(result.code).toBe('FORBIDDEN')
      }
    })
  })
})
