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

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
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

    plugin.launchPurchase.mockResolvedValue({ status: 'pending', products: [] })
    const cb2 = callbacks()
    await maybeStartGooglePlaySubscription({ userId: 'u', ...cb2 })
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
