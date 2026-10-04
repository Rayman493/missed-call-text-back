/**
 * Regression tests for POST /api/payments/create lead verification.
 *
 * Proven production failure: the lead lookup selected `leads.name`, which does
 * not exist in the production schema → PostgreSQL 42703 → the route surfaced
 * "Lead not found or unauthorized" (404), masking a query failure as an
 * ownership failure. Every payment request (stripe, venmo, paypal) died here.
 *
 * These tests execute the real route handler with a mocked Supabase client
 * and assert:
 *   - valid owned lead passes the lookup (venmo + paypal reach creation)
 *   - lead owned by a different business → 403
 *   - missing lead → 404
 *   - lead query error (e.g. 42703 schema error) → 500, NEVER a 404
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const BUSINESS_ID = '11111111-1111-1111-1111-111111111111'
const LEAD_ID = '22222222-2222-2222-2222-222222222222'

interface LookupResult {
  data: any
  error: any
}

const state = {
  leadResult: { data: null, error: null } as LookupResult,
  conversationInsert: { id: 'conv_new', business_id: BUSINESS_ID, lead_id: LEAD_ID } as any,
  insertedPaymentRequest: {
    id: 'pr_new',
    status: 'pending',
    token: 'tok_new',
    checkout_url: null as string | null,
    created_at: '2026-10-04T00:00:00Z',
  } as any,
  paymentRequestInsertPayload: null as any,
}

// A chainable, awaitable query-builder node: any combination of
// eq/gte/order/single/maybeSingle resolves to `result` when awaited.
function chain(result: LookupResult): any {
  const node: any = {
    eq: () => node,
    gte: () => node,
    order: () => node,
    single: async () => result,
    maybeSingle: async () => result,
    then: (res: any) => Promise.resolve(result).then(res),
  }
  return node
}

const BUSINESS_ROW = {
  id: BUSINESS_ID,
  user_id: 'user_1',
  name: 'Test Biz',
  venmo_username: 'testbiz',
  paypal_payment_link: 'https://paypal.me/testbiz',
  twilio_phone_number: '+15550001111',
}

function makeTableHandler(table: string) {
  if (table === 'businesses') {
    return { select: vi.fn(() => chain({ data: BUSINESS_ROW, error: null })) }
  }

  if (table === 'leads') {
    return {
      select: vi.fn(() => chain(state.leadResult)),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    }
  }

  if (table === 'conversations') {
    return {
      select: vi.fn(() => chain({ data: [], error: null })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: state.conversationInsert, error: null })),
        })),
      })),
    }
  }

  if (table === 'payment_requests') {
    return {
      select: vi.fn(() => chain({ data: null, error: null })),
      insert: vi.fn((payload: any) => {
        state.paymentRequestInsertPayload = payload
        return {
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: state.insertedPaymentRequest, error: null })),
          })),
        }
      }),
    }
  }

  return { select: vi.fn(() => chain({ data: null, error: null })) }
}

const mockSupabase = {
  auth: {
    getUser: vi.fn(async () => ({
      data: { user: { id: 'user_1', email: 'owner@test.com' } },
      error: null,
    })),
  },
  from: vi.fn((table: string) => makeTableHandler(table)),
}

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => mockSupabase),
}))

vi.mock('@/lib/stripe', () => ({
  default: vi.fn(() => ({
    checkout: { sessions: { create: vi.fn() } },
    paymentIntents: { update: vi.fn() },
  })),
}))

vi.mock('@/lib/twilio', () => ({
  sendSms: vi.fn(async () => ({ sid: 'SM_test' })),
}))

vi.mock('@/lib/event-timeline', () => ({
  timelineEvents: {},
}))

vi.mock('@/lib/notifications-server', () => ({
  notificationServiceServer: {
    notifyPaymentCreated: vi.fn(async () => {}),
    notifyPaymentRequested: vi.fn(async () => {}),
  },
}))

import { POST } from '../create/route'

function makeRequest(body: any): any {
  return { json: vi.fn(async () => body) }
}

function baseBody(overrides: any = {}) {
  return {
    business_id: BUSINESS_ID,
    lead_id: LEAD_ID,
    amount_cents: 5000,
    payment_provider: 'venmo',
    skip_sms: true,
    ...overrides,
  }
}

describe('POST /api/payments/create — lead verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.leadResult = { data: null, error: null }
    state.paymentRequestInsertPayload = null
  })

  it('succeeds past the lead lookup for a valid owned lead (venmo)', async () => {
    state.leadResult = {
      data: { id: LEAD_ID, business_id: BUSINESS_ID, caller_phone: '+15551234567', raw_metadata: {}, status: 'new', contact_name: 'Pat' },
      error: null,
    }

    const res = await POST(makeRequest(baseBody()))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.payment_request_id).toBe('pr_new')
    // Payment creation was reached with the venmo provider
    expect(state.paymentRequestInsertPayload?.payment_provider).toBe('venmo')
    expect(state.paymentRequestInsertPayload?.checkout_url).toContain('venmo.com')
  })

  it('reaches payment creation for paypal', async () => {
    state.leadResult = {
      data: { id: LEAD_ID, business_id: BUSINESS_ID, caller_phone: '+15551234567', raw_metadata: {}, status: 'new', contact_name: 'Pat' },
      error: null,
    }

    const res = await POST(makeRequest(baseBody({ payment_provider: 'paypal' })))
    expect(res.status).toBe(200)
    expect(state.paymentRequestInsertPayload?.payment_provider).toBe('paypal')
    expect(state.paymentRequestInsertPayload?.checkout_url).toContain('paypal.me')
  })

  it('rejects a lead owned by a different business', async () => {
    state.leadResult = {
      data: { id: LEAD_ID, business_id: 'other-biz', caller_phone: '+15551234567', raw_metadata: {}, status: 'new' },
      error: null,
    }

    const res = await POST(makeRequest(baseBody()))
    expect(res.status).toBe(403)
    expect(state.paymentRequestInsertPayload).toBeNull()
  })

  it('rejects a missing lead with 404', async () => {
    state.leadResult = { data: null, error: null }

    const res = await POST(makeRequest(baseBody()))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Lead not found or unauthorized')
    expect(state.paymentRequestInsertPayload).toBeNull()
  })

  it('returns 500 — never 404 — when the lead query itself fails', async () => {
    // The exact production failure: PostgreSQL 42703 (schema drift).
    state.leadResult = {
      data: null,
      error: { code: '42703', message: 'column leads.name does not exist' },
    }

    const res = await POST(makeRequest(baseBody()))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).not.toBe('Lead not found or unauthorized')
    expect(state.paymentRequestInsertPayload).toBeNull()
  })
})
