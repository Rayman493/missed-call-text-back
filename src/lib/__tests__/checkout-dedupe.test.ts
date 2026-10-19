/**
 * Final closeout — concurrent Stripe checkout dedupe.
 *
 * Design under test (Stripe-native, no DB migration):
 *  1) Reuse an existing OPEN subscription Checkout session for the same
 *     customer+business — concurrent requests that arrive after the first
 *     session exists get the same URL.
 *  2) sessions.create carries a STABLE idempotency key derived from the
 *     operation identity (business + customer + price + mode), so requests
 *     that race past the list — or retries after timeout/crash — replay
 *     the original Stripe response rather than duplicating it.
 *  3) A replayed-but-dead session (expired/completed) triggers a one-time
 *     retry with a fresh key — legitimate checkouts are never blocked.
 *  4) customers.create uses a stable per-business key with the same
 *     fresh-key fallback on idempotency_conflict.
 *
 * These tests exercise the real request pipeline by mocking the Stripe
 * SDK surface the route uses — the dedupe contract is Stripe-side, so
 * what's asserted is that the route always issues the correct key and
 * reuse/fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const routeSrc = readFileSync(
  join(__dirname, '../../app/api/stripe/create-checkout-session/route.ts'), 'utf8')

// --- hoisted mocks -----------------------------------------------------
const sessionsCreate = vi.fn()
const sessionsList = vi.fn()
const customersCreate = vi.fn()
const pricesRetrieve = vi.fn()

vi.mock('@/lib/stripe', () => ({
  default: () => ({
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate, list: sessionsList } },
    prices: { retrieve: pricesRetrieve },
  }),
}))

const authUser = { id: 'user-1', email: 'owner@biz.com' }
const bizRow = {
  id: 'biz-1', name: 'Biz', user_id: 'user-1',
  subscription_status: null, subscription_provider: null,
  stripe_customer_id: 'cus_1', stripe_subscription_id: null,
  business_phone_number: '+15550001111',
  onboarding_status: 'completed',
}

const createServerClientMock = vi.fn(() => ({
  auth: { getUser: async () => ({ data: { user: authUser } }) },
  from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
}))
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => createServerClientMock(),
}))

const resolveBusinessForUserMock = vi.fn(async () => ({ business: bizRow, role: 'owner' }))
vi.mock('@/lib/team-access', () => ({
  resolveBusinessForUser: () => resolveBusinessForUserMock(),
}))
vi.mock('@/lib/supabase/admin', () => ({
  db: { getOrCreateBusiness: async () => bizRow },
  supabaseAdmin: {},
}))
vi.mock('@/lib/trial-eligibility', () => ({
  checkTrialEligibility: async () => ({ ok: true, eligible: true }),
}))
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}))
vi.mock('@/lib/urls', () => ({
  getAppBaseUrl: () => 'https://app.test',
  logUrlResolution: () => {},
}))

const { POST } = await import('../../app/api/stripe/create-checkout-session/route')

function req(body: any = {}) {
  return new Request('https://app.test/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ checkout_mode: 'trial', business_id: 'biz-1', ...body }),
  })
}

const openSession = (id: string) => ({
  id, status: 'open', url: `https://checkout.stripe.com/${id}`,
  mode: 'subscription', metadata: { business_id: 'biz-1' },
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'price_1'
  process.env.STRIPE_SECRET_KEY = 'sk_test_x'
  pricesRetrieve.mockResolvedValue({ id: 'price_1', active: true, livemode: false })
  sessionsList.mockResolvedValue({ data: [] })
  sessionsCreate.mockResolvedValue(openSession('cs_new'))
  resolveBusinessForUserMock.mockResolvedValue({ business: bizRow, role: 'owner' })
  createServerClientMock.mockReturnValue({
    auth: { getUser: async () => ({ data: { user: authUser } }) },
    from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }),
  } as any)
})

describe('concurrent checkout dedupe', () => {
  it('two simultaneous requests converge on one session via the stable idempotency key', async () => {
    const [r1, r2] = await Promise.all([POST(req()), POST(req())])
    const [j1, j2] = [await r1.json(), await r2.json()]
    expect(j1.url).toBe(j2.url)
    const keys = sessionsCreate.mock.calls.map((c) => c[1]?.idempotencyKey)
    // every create used the same stable key → Stripe returns one session
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('checkout-biz-1-cus_1-price_1-trial')
  })

  it('a later request reuses the still-open session instead of creating another', async () => {
    sessionsList.mockResolvedValue({ data: [openSession('cs_existing')] })
    const res = await POST(req())
    const json = await res.json()
    expect(json.url).toBe('https://checkout.stripe.com/cs_existing')
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('ignores open sessions belonging to a different business', async () => {
    sessionsList.mockResolvedValue({
      data: [{ ...openSession('cs_other'), metadata: { business_id: 'biz-2' } }],
    })
    await POST(req())
    expect(sessionsCreate).toHaveBeenCalled()
  })

  it('retries with a fresh key when the replayed session is expired/completed', async () => {
    sessionsCreate
      .mockResolvedValueOnce({ id: 'cs_dead', status: 'expired', url: null })
      .mockResolvedValueOnce(openSession('cs_fresh'))
    const res = await POST(req())
    expect((await res.json()).url).toBe('https://checkout.stripe.com/cs_fresh')
    const keys = sessionsCreate.mock.calls.map((c) => c[1]?.idempotencyKey)
    expect(keys[0]).toBe('checkout-biz-1-cus_1-price_1-trial')
    expect(keys[1]).toMatch(/^checkout-biz-1-cus_1-price_1-trial-\d+$/)
  })

  it('recovers from an idempotency conflict by retrying once with a fresh key', async () => {
    sessionsCreate
      .mockRejectedValueOnce(Object.assign(new Error('idempotency key reuse with different params'), { code: 'idempotency_error' }))
      .mockResolvedValueOnce(openSession('cs_fresh'))
    const res = await POST(req())
    expect((await res.json()).url).toBe('https://checkout.stripe.com/cs_fresh')
  })

  it('proceeds when the open-session listing fails (non-blocking optimization)', async () => {
    sessionsList.mockRejectedValue(new Error('stripe down'))
    const res = await POST(req())
    expect((await res.json()).url).toBe('https://checkout.stripe.com/cs_new')
    expect(sessionsCreate).toHaveBeenCalled()
  })
})

describe('guardrails preserved', () => {
  it('rejects non-owner members', async () => {
    resolveBusinessForUserMock.mockResolvedValueOnce({ business: bizRow, role: 'member' } as any)
    const res = await POST(req())
    expect(res.status).toBe(403)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('rejects businesses with an existing Stripe subscription', async () => {
    resolveBusinessForUserMock.mockResolvedValueOnce({
      business: { ...bizRow, subscription_status: 'active', stripe_subscription_id: 'sub_1' },
      role: 'owner',
    } as any)
    const res = await POST(req())
    expect(res.status).toBe(400)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('rejects native-managed subscriptions (Apple/Google Play)', async () => {
    resolveBusinessForUserMock.mockResolvedValueOnce({
      business: {
        ...bizRow,
        subscription_status: 'active', subscription_provider: 'apple',
        apple_original_transaction_id: 'tx1',
      },
      role: 'owner',
    } as any)
    const res = await POST(req())
    expect(res.status).toBe(409)
    const json = await res.json()
    expect(json.reason).toBe('native_managed_subscription')
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('canceled subscription can resubscribe (fresh session allowed)', async () => {
    resolveBusinessForUserMock.mockResolvedValueOnce({
      business: { ...bizRow, subscription_status: 'canceled', stripe_subscription_id: 'sub_old' },
      role: 'owner',
    } as any)
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(sessionsCreate).toHaveBeenCalled()
  })

  it('rejects unauthenticated requests', async () => {
    createServerClientMock.mockReturnValueOnce({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ update: () => ({ eq: async () => ({}) }) }),
    } as any)
    const res = await POST(req())
    expect(res.status).toBe(401)
  })
})

describe('structural safety', () => {
  it('no DB transaction spans the Stripe network call', () => {
    // no .transaction()/rpc around sessions.create — claim is Stripe-side
    const idx = routeSrc.indexOf('stripe.checkout.sessions.create')
    const slice = routeSrc.slice(idx - 800, idx + 2000)
    expect(slice).not.toMatch(/\.transaction\(|BEGIN|COMMIT/)
    expect(routeSrc).toContain("status: 'open'")
    expect(routeSrc).toContain('checkout-${business.id}-${customerId}-${priceId}-${finalCheckoutMode}')
    expect(routeSrc).toContain('existingOpen')
  })

  it('native guard, owner guard, and dup guard all precede session creation', () => {
    const guards = [
      routeSrc.indexOf("reason: 'owner_required'"),
      routeSrc.indexOf("reason: 'active_subscription_exists'"),
      routeSrc.indexOf("reason: 'native_managed_subscription'"),
    ]
    const createIdx = routeSrc.indexOf('stripe.checkout.sessions.create')
    for (const g of guards) {
      expect(g).toBeGreaterThan(-1)
      expect(g).toBeLessThan(createIdx)
    }
  })
})
