/**
 * Google Play purchase handoff — timeout & session regression tests.
 *
 * Reproduces the observed production stall: after a successful
 * complete-signup, the native billing handoff never settled (billing-service
 * disconnect leaves the PluginCall unresolved), leaving "Creating Account…"
 * forever. Covers:
 *  - supplied userId skips the auth round-trip entirely
 *  - fallback identity uses local getSession(), never network getUser()
 *  - a never-settling native Promise exits via onError after the timeout
 *  - a late entitlement arriving after the timeout is still delivered
 *  - reconcileFirst re-verifies a Play-held purchase instead of relaunching
 *  - cancel / pending / error behavior unchanged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { plugin, getUser, getSession } = vi.hoisted(() => ({
  plugin: {
    isSupported: vi.fn(async () => ({ supported: true })),
    getSubscriptionOffer: vi.fn(),
    launchPurchase: vi.fn(),
    queryPurchases: vi.fn(async () => ({ purchases: [] as any[] })),
  },
  getUser: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
  registerPlugin: () => plugin,
}))
vi.mock('@/lib/supabase/browser', () => ({
  supabase: {
    auth: {
      getUser: (...args: any[]) => getUser(...args),
      getSession: (...args: any[]) => getSession(...args),
    },
  },
}))

import { maybeStartGooglePlaySubscription, PLAY_PURCHASE_TIMEOUT_MS } from '@/lib/subscription-purchase'

const offer = {
  productId: 'replyflow_monthly',
  offerToken: 'tok',
  hasFreeTrial: true,
  priceFormatted: '$9.99',
}

const verifyOk = (extra: object = {}) => ({
  ok: true,
  json: async () => ({ ok: true, entitled: true, status: 'active', ...extra }),
})

const callbacks = () => ({
  onEntitled: vi.fn(),
  onCanceled: vi.fn(),
  onPending: vi.fn(),
  onError: vi.fn(),
})

/**
 * Advance fake time through the pending-settle window in 4s increments.
 * A single large advanceTimersByTimeAsync jumps the virtual clock past
 * sleep timers the loop schedules mid-flight (after real-async sha256Hex
 * resolves), stranding them beyond the target. Stepping at the settle
 * interval guarantees every hop lands inside a future window; the
 * process.nextTick yield between hops lets genuinely-async work (crypto
 * digest, module awaits) resolve under suite-load CPU contention. Total
 * stays under PLAY_PURCHASE_TIMEOUT_MS (120s).
 */
const realTicks = async (n = 3) => {
  for (let i = 0; i < n; i++) await new Promise<void>(r => process.nextTick(r))
}
const advanceSettleWindow = async (hops = 20) => {
  for (let i = 0; i < hops; i++) {
    await vi.advanceTimersByTimeAsync(4000)
    await realTicks()
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  // sha256Hex() runs real crypto.subtle.digest — the one genuinely-async hop
  // in the purchase chain. Stub it deterministic so fake-timer advances can't
  // outrun it under suite-load CPU contention.
  vi.stubGlobal('crypto', {
    subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) },
  })
  getUser.mockReset()
  getSession.mockReset()
  plugin.getSubscriptionOffer.mockReset()
  plugin.launchPurchase.mockReset()
  plugin.queryPurchases.mockReset()
  plugin.getSubscriptionOffer.mockResolvedValue(offer)
  plugin.queryPurchases.mockResolvedValue({ purchases: [] })
  getSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
  getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  vi.stubGlobal('fetch', vi.fn(async () => verifyOk()))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('maybeStartGooglePlaySubscription', () => {
  it('uses the supplied userId without any auth round-trip', async () => {
    plugin.launchPurchase.mockResolvedValue({ status: 'purchased', purchaseToken: 't1', products: ['replyflow_monthly'] })
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'supplied-user', ...cb })
    expect(getUser).not.toHaveBeenCalled()
    expect(getSession).not.toHaveBeenCalled()
    expect(cb.onEntitled).toHaveBeenCalledOnce()
  })

  it('falls back to local getSession — never the network getUser', async () => {
    plugin.launchPurchase.mockResolvedValue({ status: 'purchased', purchaseToken: 't1', products: ['replyflow_monthly'] })
    const cb = callbacks()
    await maybeStartGooglePlaySubscription(cb)
    expect(getSession).toHaveBeenCalledOnce()
    expect(getUser).not.toHaveBeenCalled()
    expect(cb.onEntitled).toHaveBeenCalledOnce()
  })

  it('a never-settling native purchase exits via onError after the timeout', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockReturnValue(new Promise(() => {}))
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await vi.advanceTimersByTimeAsync(PLAY_PURCHASE_TIMEOUT_MS)
    const handled = await run
    expect(handled).toBe(true)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onError.mock.calls[0][0]).toContain('taking longer than expected')
    expect(cb.onEntitled).not.toHaveBeenCalled()
  })

  it('still delivers an entitlement that arrives after the timeout', async () => {
    vi.useFakeTimers()
    let resolvePurchase: (v: any) => void = () => {}
    plugin.launchPurchase.mockReturnValue(new Promise(r => { resolvePurchase = r }))
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await vi.advanceTimersByTimeAsync(PLAY_PURCHASE_TIMEOUT_MS)
    expect(await run).toBe(true)
    expect(cb.onError).toHaveBeenCalledOnce()

    // The original native operation completes late with a real purchase —
    // the legitimate result must not be discarded.
    resolvePurchase({ status: 'purchased', purchaseToken: 't1', products: ['replyflow_monthly'] })
    await vi.advanceTimersByTimeAsync(0)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
  })

  it('reconcileFirst re-verifies a Play-held purchase without relaunching the sheet', async () => {
    plugin.queryPurchases.mockResolvedValue({
      purchases: [{ purchaseToken: 'held', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true }],
    })
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', reconcileFirst: true, ...cb })
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
    expect(plugin.getSubscriptionOffer).not.toHaveBeenCalled()
  })

  it('reconcileFirst launches a fresh purchase when nothing is held', async () => {
    plugin.launchPurchase.mockResolvedValue({ status: 'purchased', purchaseToken: 't1', products: ['replyflow_monthly'] })
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', reconcileFirst: true, ...cb })
    expect(plugin.queryPurchases).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).toHaveBeenCalledOnce()
    expect(cb.onEntitled).toHaveBeenCalledOnce()
  })

  it('a second attempt after timeout finds the held purchase instead of duplicating', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockReturnValue(new Promise(() => {}))
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await vi.advanceTimersByTimeAsync(PLAY_PURCHASE_TIMEOUT_MS)
    await run

    // Retry: the original transaction is now Play-held → reconcile grants it.
    plugin.queryPurchases.mockResolvedValue({
      purchases: [{ purchaseToken: 'held', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true }],
    })
    const retry = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', reconcileFirst: true, ...retry })
    expect(retry.onEntitled).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1) // only the original
  })

  it('cancellation and pending results are unchanged', async () => {
    const cb = callbacks()
    plugin.launchPurchase.mockResolvedValue({ status: 'canceled' })
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    expect(cb.onCanceled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()

    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue({ status: 'pending', products: [] })
    const cb2 = callbacks()
    const run2 = maybeStartGooglePlaySubscription({ userId: 'u', ...cb2 })
    await advanceSettleWindow()
    await run2
    expect(cb2.onPending).toHaveBeenCalledOnce()
  })

  it('native failure still reaches onError', async () => {
    plugin.getSubscriptionOffer.mockRejectedValue(new Error('Billing setup failed'))
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onError.mock.calls[0][0]).toContain('Billing setup failed')
  })

  it('reports sign-in requirement when no session exists', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    const cb = callbacks()
    await maybeStartGooglePlaySubscription(cb)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onError.mock.calls[0][0]).toContain('signed in')
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('timeout constant is ~120 seconds', () => {
    expect(PLAY_PURCHASE_TIMEOUT_MS).toBe(120_000)
  })
})

describe('native pending purchase settle (post-purchase false-pending fix)', () => {
  const pendingSheet = { status: 'pending', products: ['replyflow_monthly'] }
  const held = (state: number) => ({
    purchases: [{ purchaseToken: 't-pend', purchaseState: state, products: ['replyflow_monthly'], isAcknowledged: false }],
  })

  it('transient pending auto-reconciles once the purchase settles — no Retry tap', async () => {
    // Production bug: sheet returns PENDING on payment-confirmation lag,
    // purchase flips to PURCHASED seconds later — first return must wait
    // for that flip instead of showing the pending fallback.
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(pendingSheet)
    plugin.queryPurchases
      .mockResolvedValueOnce(held(2))   // still PENDING on first poll
      .mockResolvedValue(held(1))       // settled by second poll
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1)
    // The settled token was server-verified, not blindly trusted.
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse((fetch as any).mock.calls[0][1].body).purchaseToken).toBe('t-pend')
  })

  it('already-settled purchase on return advances immediately (zero sleeps)', async () => {
    plugin.launchPurchase.mockResolvedValue(pendingSheet)
    plugin.queryPurchases.mockResolvedValue(held(1))
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
    expect(plugin.queryPurchases).toHaveBeenCalledTimes(1)
  })

  it('genuine deferred payment that never settles still shows the pending fallback', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(pendingSheet)
    plugin.queryPurchases.mockResolvedValue(held(2)) // stays PENDING
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onPending).toHaveBeenCalledOnce()
    expect(cb.onEntitled).not.toHaveBeenCalled()
    // No token ever existed → no server verification attempt, no entitlement.
    expect(fetch).not.toHaveBeenCalled()
  })

  it('retry after a genuine pending reconciles the held purchase — never a second sheet', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(pendingSheet)
    plugin.queryPurchases.mockResolvedValue(held(2))
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    await run
    expect(cb.onPending).toHaveBeenCalledOnce()

    // By the time the user taps Retry, Play has settled the purchase:
    // reconcileFirst verifies it server-side without launching the sheet.
    plugin.queryPurchases.mockResolvedValue(held(1))
    const retry = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', reconcileFirst: true, ...retry })
    expect(retry.onEntitled).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1) // only the original
  })

  it('a settle that lands on a server-side pending still gets the verify retry loop', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(pendingSheet)
    plugin.queryPurchases.mockResolvedValue(held(1))
    const fetchMock = fetch as any
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, entitled: false, pending: true }) })
      .mockResolvedValue(verifyOk()) // second verification: Google settled to ACTIVE
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
