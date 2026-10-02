/**
 * Checkout-status repair path: stripe_customer_id persistence
 *
 * Regression tests for the defect where the webhook-lag repair path wrote
 * `stripe_customer_id: session.customer as string` while the Checkout Session
 * was retrieved with `expand: ['customer']` — persisting an expanded Customer
 * object instead of a canonical 'cus_...' string.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const updateCalls: any[] = []
let mockBusinessRow: any = null
let mockSession: any = null

const mockStripe = {
  checkout: {
    sessions: {
      retrieve: vi.fn(async () => mockSession),
    },
  },
}

const mockSupabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: mockBusinessRow, error: null })),
        })),
      })),
    })),
    update: vi.fn((payload: any) => {
      updateCalls.push(payload)
      return { eq: vi.fn(async () => ({ error: null })) }
    }),
  })),
}

vi.mock('@/lib/stripe', () => ({
  default: vi.fn(() => mockStripe),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase),
}))

vi.mock('@/lib/manual-access', () => ({
  hasActiveManualAccess: vi.fn(() => false),
  getManualAccessStatus: vi.fn(() => 'none'),
}))

vi.mock('@/lib/subscription', () => ({
  isEligibleForProvisioning: vi.fn(() => false),
}))

import { POST } from '../route'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

const makeRequest = () =>
  ({ json: async () => ({ session_id: 'cs_test_123' }) }) as any

const baseSession = {
  id: 'cs_test_123',
  status: 'complete',
  payment_status: 'paid',
  subscription: {
    id: 'sub_test_1',
    status: 'trialing',
    trial_end: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
    current_period_end: null,
    items: { data: [{ price: { id: 'price_test' } }] },
  },
  metadata: { business_id: 'biz_1', user_id: 'user_1' },
}

beforeEach(() => {
  vi.clearAllMocks()
  updateCalls.length = 0
  // Business with no subscription_status triggers the repair path
  mockBusinessRow = {
    id: 'biz_1',
    user_id: 'user_1',
    subscription_status: null,
    stripe_customer_id: 'cus_original',
    stripe_subscription_id: null,
    twilio_phone_number: null,
    provisioning_status: 'pending',
    manual_access_enabled: false,
    manual_access_expires_at: null,
  }
})

describe('checkout-status repair — stripe_customer_id', () => {
  it('A: persists the customer string directly when session.customer is a string', async () => {
    mockSession = { ...baseSession, customer: 'cus_123' }

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].stripe_customer_id).toBe('cus_123')
  })

  it('B: persists customer.id when session.customer is an expanded Customer object', async () => {
    mockSession = {
      ...baseSession,
      customer: { id: 'cus_456', object: 'customer', email: 'user@example.com' },
    }

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0].stripe_customer_id).toBe('cus_456')
  })

  it('C: persists no malformed value when the session has no valid customer ID', async () => {
    mockSession = { ...baseSession, customer: null }

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(updateCalls).toHaveLength(1)
    expect(updateCalls[0]).not.toHaveProperty('stripe_customer_id')
    expect(JSON.stringify(updateCalls[0])).not.toContain('[object Object]')
  })
})
