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
import { reconcilePlayPurchases } from '@/lib/google-play-billing'

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
    // reconcileFirst's query + the pre-launch restore check inside purchase.
    expect(plugin.queryPurchases).toHaveBeenCalledTimes(2)
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

  it('a BillingClient "already connecting" race never reaches the user — routes to pending recovery', async () => {
    // Older builds without the single-flight plugin can still throw this —
    // it is internal lifecycle coordination, so it must land on the
    // pending-recovery path, not the raw error UI.
    const raceError = new Error('Client is already in the process of connecting to billing service.')
    plugin.launchPurchase.mockRejectedValue(raceError)
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    expect(cb.onPending).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()

    plugin.getSubscriptionOffer.mockRejectedValueOnce(raceError)
    const cb2 = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb2 })
    expect(cb2.onPending).toHaveBeenCalledOnce()
    expect(cb2.onError).not.toHaveBeenCalled()
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
    // Pre-launch restore check runs first and sees nothing held; the settle
    // poll then finds the PURCHASED token.
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(held(1))
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
    expect(plugin.queryPurchases).toHaveBeenCalledTimes(2)
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
    // First call is the pre-launch restore check — nothing held yet; the
    // purchase then settles to PURCHASED on the next poll.
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(held(1))
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

/**
 * Restore-before-purchase + transient verify-failure recovery.
 *
 * Two proven production sequences collapse into this path:
 *  - The Play account already held the product under a different ReplyFlow
 *    account → launchBillingFlow is rejected by Google (code 5 "account
 *    identifiers don't match the previous subscription"), looping forever.
 *  - A held-purchase verify racing a stale session answered 404
 *    'Business not found' and dead-ended on Retry while the entitlement
 *    verified seconds later.
 * The pre-launch held-purchase check verifies the token through the BARE
 * verify path (no obfuscatedExternalAccountId — the server's ownership
 * rules decide binding) and only launches when the held token proves
 * stale (400) or verified-but-not-entitled. Transient failures get the
 * bounded reconcile; terminal failures surface immediately.
 */
describe('restore-before-purchase and transient verify recovery', () => {
  const heldPurchased = () => ({
    purchases: [{ purchaseToken: 't-held', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true }],
  })
  const errBody = (status: number, error: string) => ({
    ok: false, status, json: async () => ({ ok: false, error }),
  })
  const notEntitled = (status = 'canceled') => ({
    ok: true, json: async () => ({ ok: true, entitled: false, status, pending: false }),
  })
  const purchasedSheet = { status: 'purchased', purchaseToken: 't-new', products: ['replyflow_monthly'] }

  it('held PURCHASED + entitled restores without ever opening the sheet', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    // Bare restore verify — no obfuscatedExternalAccountId.
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.purchaseToken).toBe('t-held')
    expect(body.obfuscatedExternalAccountId).toBeUndefined()
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('held purchase + 409 different live business → conflict onError, no launch, no rebind', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock.mockResolvedValue(errBody(409, 'This Google Play purchase already activates a different business'))

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // No grace reconcile — the only queryPurchases was the pre-launch check.
    expect(plugin.queryPurchases).toHaveBeenCalledTimes(1)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onError.mock.calls[0][0]).toContain('different business')
    expect(cb.onEntitled).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('held purchase + verified but not entitled (expired/canceled) → normal launch proceeds', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    plugin.launchPurchase.mockResolvedValue(purchasedSheet)
    const fetchMock = fetch as any
    fetchMock
      .mockResolvedValueOnce(notEntitled())
      .mockResolvedValueOnce(verifyOk())

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
  })

  it('held purchase + 400 unrecognized token (stale Play cache) → normal launch proceeds', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    plugin.launchPurchase.mockResolvedValue(purchasedSheet)
    const fetchMock = fetch as any
    fetchMock
      .mockResolvedValueOnce(errBody(400, 'Purchase token not recognized by Google Play'))
      .mockResolvedValueOnce(verifyOk())

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
  })

  it('held-purchase verify 404 → bounded reconcile verifies entitled → onEntitled, no launch', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock
      .mockResolvedValueOnce(errBody(404, 'Business not found'))
      .mockResolvedValueOnce(verifyOk())

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(cb.onPending).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('transient 404 resolving on a later bounded attempt still auto-continues', async () => {
    vi.useFakeTimers()
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock
      .mockResolvedValueOnce(errBody(404, 'Business not found'))
      .mockResolvedValueOnce(errBody(404, 'Business not found'))
      .mockResolvedValueOnce(verifyOk())

    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('5xx verify failure resolving during the bounded window auto-continues', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock
      .mockResolvedValueOnce(errBody(500, 'Verification service unavailable'))
      .mockResolvedValueOnce(verifyOk())

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('transport failure (fetch rejects) recovering during the window auto-continues', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(verifyOk())

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('held purchase + 401 stays terminal — does not launch and does not reconcile', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock.mockResolvedValue(errBody(401, 'Authentication required'))

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(plugin.queryPurchases).toHaveBeenCalledTimes(1)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onEntitled).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('transient failure that never resolves falls back to the existing error UI', async () => {
    vi.useFakeTimers()
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const fetchMock = fetch as any
    fetchMock.mockResolvedValue(errBody(404, 'Business not found'))

    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    // 1 pre-launch verify + 3 bounded reconcile verifies.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(cb.onError).toHaveBeenCalledOnce()
    expect(cb.onEntitled).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })

  it('code 5 (identifiers mismatch) launch error recovers the held purchase — no retry loop', async () => {
    // Race: the held purchase only became visible after launchBillingFlow
    // started — the exact production sequence (logcat code=5).
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    plugin.launchPurchase.mockResolvedValue({
      status: 'error', code: 5, message: "Account identifiers don't match the previous subscription.",
    })

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.purchaseToken).toBe('t-held')
    expect(body.obfuscatedExternalAccountId).toBeUndefined()
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1) // no re-launch loop
  })

  it('code 7 launch error still recovers the held purchase', async () => {
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    plugin.launchPurchase.mockResolvedValue({ status: 'error', code: 7 })

    const cb = callbacks()
    expect(await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1)
  })

  it('repeated attempts after a restore never launch BillingFlow again', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const first = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...first })
    expect(first.onEntitled).toHaveBeenCalledOnce()

    // Retry / second signup submit: held + entitled still restores — no sheet.
    const second = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', reconcileFirst: true, ...second })
    expect(second.onEntitled).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).not.toHaveBeenCalled()
  })
})

/**
 * Last-mile entitlement grace — the production false-Retry defect.
 *
 * Sequence observed on 1.0.2: sheet returned PURCHASED, verify-purchase
 * answered 200 with pending while Google's subscription record was still
 * SUBSCRIPTION_STATE_PENDING, all bounded re-polls stayed pending, and the
 * UI dead-ended on Retry Checkout. Seconds later the same reconcile that
 * Retry runs found the entitlement instantly — the first pass simply never
 * re-checked after its last poll. These tests pin the grace reconcile that
 * now runs before a recoverable pending state surfaces.
 */
describe('post-purchase entitlement grace (false-Retry fix)', () => {
  const purchased = { status: 'purchased', purchaseToken: 't1', products: ['replyflow_monthly'] }
  const heldPurchased = () => ({
    purchases: [{ purchaseToken: 't1', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true }],
  })
  const pendingVerify = {
    ok: true,
    json: async () => ({ ok: true, entitled: false, status: 'none', pending: true }),
  }

  it('verify pending that settles during the grace window auto-continues — no Retry', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(purchased)
    const fetchMock = fetch as any
    // Initial verify + 4 pending-retry polls all still PENDING; the grace
    // reconcile's verify is where Google finally reports ACTIVE.
    for (let i = 0; i < 5; i++) fetchMock.mockResolvedValueOnce(pendingVerify)
    fetchMock.mockResolvedValue(verifyOk())
    // First queryPurchases is the pre-launch restore check — nothing held.
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
    expect(cb.onError).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1) // no duplicate sheet
  })

  it('a stale first grace read recovers on the bounded refresh', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(purchased)
    const fetchMock = fetch as any
    // 5 pending (verify loop) + grace reconcile #1 still pending;
    // grace reconcile #2 sees the settled entitlement.
    for (let i = 0; i < 6; i++) fetchMock.mockResolvedValueOnce(pendingVerify)
    fetchMock.mockResolvedValue(verifyOk())
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
  })

  it('an entitled:false non-pending snapshot (e.g. UNSPECIFIED) also gets the grace reconcile', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(purchased)
    const fetchMock = fetch as any
    // First verify: ok but neither entitled nor pending — the old code went
    // straight to onPending with zero re-checks. Grace reconcile finds it.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, entitled: false, status: 'none' }),
    })
    fetchMock.mockResolvedValue(verifyOk())
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onEntitled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
    // Exactly one pending-loop-free verify plus the reconcile's verify.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('entitlement genuinely unresolved after the bounded window still shows Retry (onPending)', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(purchased)
    ;(fetch as any).mockResolvedValue(pendingVerify) // never settles
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    expect(await run).toBe(true)
    expect(cb.onPending).toHaveBeenCalledOnce()
    expect(cb.onEntitled).not.toHaveBeenCalled()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1)
    // 1 initial + 4 pending retries + 3 grace reconciles = 8 verify calls.
    expect(fetch).toHaveBeenCalledTimes(8)
  })

  it('user cancellation never enters the grace reconcile', async () => {
    plugin.launchPurchase.mockResolvedValue({ status: 'canceled' })
    const cb = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    expect(cb.onCanceled).toHaveBeenCalledOnce()
    expect(cb.onPending).not.toHaveBeenCalled()
    // Only the pre-launch restore check — never a reconcile query.
    expect(plugin.queryPurchases).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('grace-exhausted pending then manual Retry reconciles idempotently — still no second sheet', async () => {
    vi.useFakeTimers()
    plugin.launchPurchase.mockResolvedValue(purchased)
    ;(fetch as any).mockResolvedValue(pendingVerify)
    plugin.queryPurchases
      .mockResolvedValueOnce({ purchases: [] })
      .mockResolvedValue(heldPurchased())
    const cb = callbacks()
    const run = maybeStartGooglePlaySubscription({ userId: 'u', ...cb })
    await advanceSettleWindow()
    await run
    expect(cb.onPending).toHaveBeenCalledOnce()

    // Retry re-verifies the already-held purchase — a re-verification of the
    // same token, never a second purchase, so no double-charge is possible.
    ;(fetch as any).mockResolvedValue(verifyOk())
    const retry = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', reconcileFirst: true, ...retry })
    expect(retry.onEntitled).toHaveBeenCalledOnce()
    expect(plugin.launchPurchase).toHaveBeenCalledTimes(1)
  })
})

/**
 * Pre-auth reconcile gating — production defect on 1.0.2.
 *
 * handleAppResume() fires reconcilePlayPurchases() on every cold start and
 * resume, including while sitting on the signup screen with no session.
 * With a Play-held purchase present that emitted POST /api/google-play/
 * verify-purchase → 401 (no authenticated cookie session) *before*
 * complete-signup had even created the account. The reconcile now gates on
 * a local session and treats a 401 as terminal for the invocation.
 */
describe('reconcilePlayPurchases auth gating (pre-signup 401 fix)', () => {
  const heldPurchased = () => ({
    purchases: [{ purchaseToken: 'held', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true }],
  })

  it('no session → no queryPurchases, no verify fetch, returns not entitled', async () => {
    // Cold start on the signup screen: nothing authenticated yet.
    getSession.mockResolvedValue({ data: { session: null } })
    const res = await reconcilePlayPurchases()
    expect(res.entitled).toBe(false)
    expect(plugin.queryPurchases).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('session read failure also gates cleanly — no verify fetch', async () => {
    getSession.mockRejectedValue(new Error('storage unavailable'))
    const res = await reconcilePlayPurchases()
    expect(res.entitled).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('valid session + held PURCHASED token still verifies and entitles', async () => {
    plugin.queryPurchases.mockResolvedValue(heldPurchased())
    const res = await reconcilePlayPurchases()
    expect(getSession).toHaveBeenCalledOnce()
    expect(plugin.queryPurchases).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(res.entitled).toBe(true)
  })

  it('a 401 mid-reconcile stops verification — no retry storm, no throw', async () => {
    // Stale session: local session exists but the account was deleted —
    // every verify answers 401. Second held token must never be verified.
    plugin.queryPurchases.mockResolvedValue({
      purchases: [
        { purchaseToken: 'tok-a', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true },
        { purchaseToken: 'tok-b', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true },
      ],
    })
    ;(fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, error: 'Authentication required' }),
    })
    const res = await reconcilePlayPurchases()
    expect(res.entitled).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a non-401 verification failure still continues to the next purchase', async () => {
    plugin.queryPurchases.mockResolvedValue({
      purchases: [
        { purchaseToken: 'tok-a', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true },
        { purchaseToken: 'tok-b', purchaseState: 1, products: ['replyflow_monthly'], isAcknowledged: true },
      ],
    })
    ;(fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ ok: false, error: 'Verification failed' }) })
      .mockResolvedValueOnce(verifyOk())
    const res = await reconcilePlayPurchases()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(res.entitled).toBe(true)
  })
})
