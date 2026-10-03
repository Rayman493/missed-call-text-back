/**
 * Regression: merchant-side Stripe Connect RequestOptions placement
 *
 * Defect: payments/[id]/reconcile and payments/[id]/cancel passed
 * { stripeAccount } in the params position (2nd arg) of retrieve/expire calls.
 * stripe-node v22 expects RequestOptions in the 3rd argument, so the
 * Stripe-Account header was never sent and connected-account resources
 * returned resource_missing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const retrieveSession = vi.fn()
const expireSession = vi.fn()
const retrievePI = vi.fn()

const mockStripe = {
  checkout: { sessions: { retrieve: retrieveSession, expire: expireSession } },
  paymentIntents: { retrieve: retrievePI },
}

let paymentRequestRow: any = null
let businessRow: any = { id: 'biz_1', user_id: 'u1' }

vi.mock('@/lib/stripe', () => ({ default: vi.fn(() => mockStripe) }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: vi.fn() })),
}))
vi.mock('@/lib/team-access', () => ({
  getUserRoleForBusiness: vi.fn(async () => 'member'),
}))
vi.mock('@/lib/payments/completion-side-effects', () => ({
  ensurePaymentCompletedSideEffects: vi.fn(async () => {}),
}))
vi.mock('@/lib/event-timeline', () => ({
  timelineEvents: new Proxy({}, { get: () => vi.fn(async () => ({})) }),
}))

const builder = (resolveData: any): any => {
  const b: any = {}
  for (const m of ['select', 'eq', 'update', 'insert', 'limit', 'order', 'neq', 'is', 'gte']) {
    b[m] = vi.fn(() => b)
  }
  b.single = vi.fn(async () => ({ data: resolveData, error: resolveData ? null : { code: 'PGRST116' } }))
  b.maybeSingle = vi.fn(async () => ({ data: resolveData, error: null }))
  b.then = (res: any) => res({ data: resolveData, error: null })
  return b
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === 'payment_requests') return builder(paymentRequestRow)
      if (table === 'businesses') return builder(businessRow)
      return builder(null)
    }),
  })),
}))

import { POST as reconcilePOST } from '../[id]/reconcile/route'
import { POST as cancelPOST } from '../[id]/cancel/route'

const req = (id: string) => [
  { json: async () => ({}) } as any,
  { params: Promise.resolve({ id }) },
] as const

beforeEach(() => {
  vi.clearAllMocks()
  retrieveSession.mockResolvedValue({ id: 'cs_1', status: 'open', payment_status: 'unpaid' })
  expireSession.mockResolvedValue({ id: 'cs_1', status: 'expired' })
  retrievePI.mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method' })
})

describe('stripeAccount RequestOptions placement', () => {
  it('reconcile: connected-account session retrieve sends stripeAccount as 3rd-arg RequestOptions', async () => {
    paymentRequestRow = {
      id: 'pay_1', business_id: 'biz_1', status: 'pending',
      payment_method_type: 'card', stripe_payment_intent_id: null,
      stripe_checkout_session_id: 'cs_1', stripe_connect_account_id: 'acct_connect1',
    }
    await reconcilePOST(...req('pay_1'))
    expect(retrieveSession).toHaveBeenCalledWith('cs_1', {}, { stripeAccount: 'acct_connect1' })
  })

  it('reconcile: platform-account session retrieve passes undefined RequestOptions', async () => {
    paymentRequestRow = {
      id: 'pay_2', business_id: 'biz_1', status: 'pending',
      payment_method_type: 'card', stripe_payment_intent_id: null,
      stripe_checkout_session_id: 'cs_2', stripe_connect_account_id: null,
    }
    await reconcilePOST(...req('pay_2'))
    expect(retrieveSession).toHaveBeenCalledWith('cs_2', {}, undefined)
  })

  it('cancel: connected-account session retrieve + expire use 3rd-arg RequestOptions', async () => {
    paymentRequestRow = {
      id: 'pay_3', business_id: 'biz_1', status: 'pending',
      payment_provider: 'stripe', payment_method_type: 'card',
      stripe_checkout_session_id: 'cs_3', stripe_payment_intent_id: null,
      stripe_connect_account_id: 'acct_connect1',
    }
    await cancelPOST(...req('pay_3'))
    expect(retrieveSession).toHaveBeenCalledWith('cs_3', {}, { stripeAccount: 'acct_connect1' })
    expect(expireSession).toHaveBeenCalledWith('cs_3', {}, { stripeAccount: 'acct_connect1' })
  })

  it('cancel: PaymentIntent retrieve sends stripeAccount as 3rd-arg RequestOptions', async () => {
    paymentRequestRow = {
      id: 'pay_4', business_id: 'biz_1', status: 'pending',
      payment_provider: 'stripe', payment_method_type: 'card_present',
      stripe_checkout_session_id: null, stripe_payment_intent_id: 'pi_4',
      stripe_connect_account_id: 'acct_connect1',
    }
    await cancelPOST(...req('pay_4'))
    expect(retrievePI).toHaveBeenCalledWith('pi_4', {}, { stripeAccount: 'acct_connect1' })
  })
})
