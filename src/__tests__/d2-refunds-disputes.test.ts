/**
 * D2 — Stripe-managed refunds & disputes
 *
 * Covers:
 *  - computeRefundState: full/partial/multiple/pending/failed refund derivation
 *    from an authoritative Stripe charge (never client data).
 *  - mapDisputeStatus: Stripe dispute statuses -> stored open/won/lost.
 *  - getEffectivePaymentStatus/Style + dispute badge helpers: UI consistency
 *    so one transaction cannot appear refunded on one surface and paid on
 *    another.
 *  - management-link handoff route: owner-only, server-side business/account
 *    resolution, payment scoping, manual-payment ineligibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeRefundState, mapDisputeStatus } from '@/lib/payment-refund-dispute'
import {
  getEffectivePaymentStatus,
  getEffectivePaymentStatusStyle,
  getDisputeStatusLabel,
  getDisputeStatusBadgeClass,
} from '@/lib/payment-status'

// ---------- computeRefundState ----------

describe('computeRefundState', () => {
  it('reports a full refund', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 5000,
      refunds: { data: [{ status: 'succeeded' }] },
    })
    expect(result).toEqual({ refund_status: 'refunded', refunded_amount_cents: 5000 })
  })

  it('reports a single partial refund', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 2000,
      refunds: { data: [{ status: 'succeeded' }] },
    })
    expect(result).toEqual({ refund_status: 'partially_refunded', refunded_amount_cents: 2000 })
  })

  it('accumulates multiple partial refunds from the authoritative total', () => {
    // Two $10 refunds on a $50 payment — Stripe reports the summed total.
    const result = computeRefundState(5000, {
      amount_refunded: 2000,
      refunds: { data: [{ status: 'succeeded' }, { status: 'succeeded' }] },
    })
    expect(result).toEqual({ refund_status: 'partially_refunded', refunded_amount_cents: 2000 })
  })

  it('multiple partial refunds reaching the full amount become refunded', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 5000,
      refunds: { data: [{ status: 'succeeded' }, { status: 'succeeded' }] },
    })
    expect(result).toEqual({ refund_status: 'refunded', refunded_amount_cents: 5000 })
  })

  it('never reports more refunded than the original amount', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 9999,
      refunds: { data: [{ status: 'succeeded' }] },
    })
    expect(result).toEqual({ refund_status: 'refunded', refunded_amount_cents: 5000 })
  })

  it('reports a pending refund before money has moved', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 0,
      refunds: { data: [{ status: 'pending' }] },
    })
    expect(result).toEqual({ refund_status: 'pending', refunded_amount_cents: 0 })
  })

  it('a failed refund never displays as completed', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 0,
      refunds: { data: [{ status: 'failed' }] },
    })
    expect(result).toEqual({ refund_status: 'failed', refunded_amount_cents: 0 })
  })

  it('a canceled refund never displays as completed', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 0,
      refunds: { data: [{ status: 'canceled' }] },
    })
    expect(result).toEqual({ refund_status: 'failed', refunded_amount_cents: 0 })
  })

  it('an actual partial refund wins over a later failed attempt', () => {
    // $20 already refunded; a second refund attempt then failed.
    const result = computeRefundState(5000, {
      amount_refunded: 2000,
      refunds: { data: [{ status: 'succeeded' }, { status: 'failed' }] },
    })
    expect(result).toEqual({ refund_status: 'partially_refunded', refunded_amount_cents: 2000 })
  })

  it('pending beats failed when both refund attempts exist', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 0,
      refunds: { data: [{ status: 'failed' }, { status: 'pending' }] },
    })
    expect(result).toEqual({ refund_status: 'pending', refunded_amount_cents: 0 })
  })

  it('succeeded refunds with zero amount_refunded stay pending (contradictory Stripe data)', () => {
    const result = computeRefundState(5000, {
      amount_refunded: 0,
      refunds: { data: [{ status: 'succeeded' }] },
    })
    expect(result).toEqual({ refund_status: 'pending', refunded_amount_cents: 0 })
  })

  it('no refunds returns null state', () => {
    const result = computeRefundState(5000, { amount_refunded: 0, refunds: { data: [] } })
    expect(result).toEqual({ refund_status: null, refunded_amount_cents: 0 })
  })

  it('handles missing refunds expansion defensively', () => {
    const result = computeRefundState(5000, { amount_refunded: 0, refunds: null })
    expect(result).toEqual({ refund_status: null, refunded_amount_cents: 0 })
  })
})

// ---------- mapDisputeStatus ----------

describe('mapDisputeStatus', () => {
  it('maps open dispute states to open', () => {
    for (const s of ['needs_response', 'under_review', 'warning_needs_response', 'warning_under_review', 'charge_refunded']) {
      expect(mapDisputeStatus(s)).toBe('open')
    }
  })

  it('maps won to won — without implying funds were reinstated', () => {
    expect(mapDisputeStatus('won')).toBe('won')
  })

  it('maps lost and warning_closed to lost', () => {
    expect(mapDisputeStatus('lost')).toBe('lost')
    expect(mapDisputeStatus('warning_closed')).toBe('lost')
  })
})

// ---------- effective status / UI consistency ----------

describe('getEffectivePaymentStatus', () => {
  it('a paid payment with a full refund derives refunded', () => {
    expect(getEffectivePaymentStatus({ status: 'paid', refund_status: 'refunded' })).toBe('refunded')
  })

  it('a paid payment with a partial refund derives partially_refunded', () => {
    expect(getEffectivePaymentStatus({ status: 'paid', refund_status: 'partially_refunded' })).toBe('partially_refunded')
  })

  it('a paid payment with a pending refund still shows paid (no money moved)', () => {
    expect(getEffectivePaymentStatus({ status: 'paid', refund_status: 'pending' })).toBe('paid')
  })

  it('a paid payment with a failed refund still shows paid', () => {
    expect(getEffectivePaymentStatus({ status: 'paid', refund_status: 'failed' })).toBe('paid')
  })

  it('a paid payment with no refund shows paid', () => {
    expect(getEffectivePaymentStatus({ status: 'paid', refund_status: null })).toBe('paid')
  })

  it('non-paid statuses are unaffected by refund fields', () => {
    expect(getEffectivePaymentStatus({ status: 'pending', refund_status: 'refunded' })).toBe('pending')
    expect(getEffectivePaymentStatus({ status: 'cancelled', refund_status: null })).toBe('cancelled')
  })

  it('styles exist for derived statuses on every surface using the helper', () => {
    expect(getEffectivePaymentStatusStyle({ status: 'paid', refund_status: 'refunded' }).label).toBe('Refunded')
    expect(getEffectivePaymentStatusStyle({ status: 'paid', refund_status: 'partially_refunded' }).label).toBe('Partially refunded')
    expect(getEffectivePaymentStatusStyle({ status: 'paid', refund_status: null }).label).toBe('Paid')
  })
})

describe('dispute display helpers', () => {
  it('labels open/won/lost disputes', () => {
    expect(getDisputeStatusLabel('open')).toBe('Disputed')
    expect(getDisputeStatusLabel('won')).toBe('Dispute won')
    expect(getDisputeStatusLabel('lost')).toBe('Dispute lost')
    expect(getDisputeStatusLabel(null)).toBeNull()
    expect(getDisputeStatusLabel('garbage')).toBeNull()
  })

  it('returns a badge class for each stored state', () => {
    expect(getDisputeStatusBadgeClass('open')).toContain('red')
    expect(getDisputeStatusBadgeClass('won')).toContain('green')
    expect(getDisputeStatusBadgeClass('lost')).toContain('gray')
    expect(getDisputeStatusBadgeClass(null)).toBeTruthy()
  })
})

// ---------- management-link handoff route ----------

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockCreateLoginLink = vi.fn()
const mockResolveBusinessForUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

vi.mock('@/lib/team-access', () => ({
  resolveBusinessForUser: (...args: any[]) => mockResolveBusinessForUser(...args),
}))

vi.mock('@/lib/stripe', () => ({
  default: () => ({ accounts: { createLoginLink: mockCreateLoginLink } }),
}))

import { POST } from '@/app/api/stripe/connect/management-link/route'

function makeRequest(body: any) {
  return new Request('http://localhost/api/stripe/connect/management-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

const OWNER_ACCESS = {
  business: { id: 'biz-1', stripe_connect_account_id: 'acct_1' },
  role: 'owner',
  membershipId: 'mem-1',
}

function mockPaymentLookup(payment: any) {
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: payment, error: payment ? null : { code: 'PGRST116' } }),
        }),
      }),
    }),
  })
}

describe('management-link handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    mockResolveBusinessForUser.mockResolvedValue(OWNER_ACCESS)
    mockCreateLoginLink.mockResolvedValue({ url: 'https://connect.stripe.com/express/test-login' })
  })

  it('rejects unauthenticated requests', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') })
    const res = await POST(makeRequest({ business_id: 'biz-1' }))
    expect(res.status).toBe(401)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('rejects non-owner members', async () => {
    mockResolveBusinessForUser.mockResolvedValue({ ...OWNER_ACCESS, role: 'member' })
    const res = await POST(makeRequest({ business_id: 'biz-1' }))
    expect(res.status).toBe(403)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('rejects when resolved business differs from requested business', async () => {
    const res = await POST(makeRequest({ business_id: 'biz-other' }))
    expect(res.status).toBe(404)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('rejects when Stripe is not connected', async () => {
    mockResolveBusinessForUser.mockResolvedValue({
      ...OWNER_ACCESS,
      business: { id: 'biz-1', stripe_connect_account_id: null },
    })
    const res = await POST(makeRequest({ business_id: 'biz-1' }))
    expect(res.status).toBe(400)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('issues a login link for a valid owner handoff', async () => {
    const res = await POST(makeRequest({ business_id: 'biz-1' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.url).toBe('https://connect.stripe.com/express/test-login')
    expect(mockCreateLoginLink).toHaveBeenCalledWith('acct_1')
  })

  it('issues a login link for a payment belonging to the business account', async () => {
    mockPaymentLookup({
      id: 'pay-1',
      business_id: 'biz-1',
      stripe_connect_account_id: 'acct_1',
      payment_provider: 'stripe',
    })
    const res = await POST(makeRequest({ business_id: 'biz-1', payment_request_id: 'pay-1' }))
    expect(res.status).toBe(200)
    expect(mockCreateLoginLink).toHaveBeenCalledWith('acct_1')
  })

  it('rejects a payment not found for the business (wrong-business ids)', async () => {
    mockPaymentLookup(null)
    const res = await POST(makeRequest({ business_id: 'biz-1', payment_request_id: 'pay-other' }))
    expect(res.status).toBe(404)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('rejects a payment recorded on a different connected account', async () => {
    mockPaymentLookup({
      id: 'pay-1',
      business_id: 'biz-1',
      stripe_connect_account_id: 'acct_other',
      payment_provider: 'stripe',
    })
    const res = await POST(makeRequest({ business_id: 'biz-1', payment_request_id: 'pay-1' }))
    expect(res.status).toBe(404)
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })

  it('rejects manual (non-Stripe) payments', async () => {
    for (const provider of ['venmo', 'paypal']) {
      mockPaymentLookup({
        id: 'pay-1',
        business_id: 'biz-1',
        stripe_connect_account_id: 'acct_1',
        payment_provider: provider,
      })
      const res = await POST(makeRequest({ business_id: 'biz-1', payment_request_id: 'pay-1' }))
      expect(res.status).toBe(404)
    }
    expect(mockCreateLoginLink).not.toHaveBeenCalled()
  })
})
