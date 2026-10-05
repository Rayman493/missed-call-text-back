/**
 * Google Play Billing — WebView-side wrapper.
 *
 * Native plugin: ReplyflowGooglePlayBilling (android/.../ReplyflowGooglePlayBillingPlugin.java).
 * A purchase result here is only a token — entitlement comes from
 * POST /api/google-play/verify-purchase after server-side verification.
 */

import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase/browser'

export const GOOGLE_PLAY_PRODUCT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_PLAY_PRODUCT_ID || 'replyflow_monthly'

export interface SubscriptionOffer {
  productId: string
  offerToken: string
  basePlanId?: string
  offerId?: string | null
  hasFreeTrial: boolean
  priceFormatted: string
  billingPeriod: string
}

export interface PlayPurchaseResult {
  status: 'purchased' | 'pending' | 'canceled' | 'error'
  purchaseToken?: string
  orderId?: string
  products?: string[]
  code?: number
  message?: string
}

interface GooglePlayBillingPlugin {
  isSupported(): Promise<{ supported: boolean }>
  getSubscriptionOffer(options: { productId: string }): Promise<SubscriptionOffer>
  launchPurchase(options: {
    productId: string
    offerToken: string
    obfuscatedAccountId?: string
  }): Promise<PlayPurchaseResult>
  queryPurchases(): Promise<{
    purchases: Array<{
      purchaseToken: string
      orderId?: string
      products: string[]
      purchaseState: number
      isAcknowledged: boolean
    }>
  }>
}

const GooglePlayBilling = registerPlugin<GooglePlayBillingPlugin>('ReplyflowGooglePlayBilling')

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// TEMP DIAGNOSTICS for the Play "unable to change your subscription plan"
// investigation. Only safe fields are logged — BillingClient codes,
// product/offer/base-plan IDs, order IDs, and short SHA-256 fingerprints.
// Never log raw purchase tokens, raw offer tokens, or session material.
const diag = (event: string, fields: Record<string, unknown>) => {
  console.warn(`[GooglePlayBilling:diag] ${event}`, fields)
}

const tokenFingerprint = async (token?: string | null): Promise<string> => {
  if (!token) return ''
  try { return (await sha256Hex(token)).slice(0, 8) } catch { return '' }
}

export async function getBestSubscriptionOffer(productId = GOOGLE_PLAY_PRODUCT_ID): Promise<SubscriptionOffer> {
  return GooglePlayBilling.getSubscriptionOffer({ productId })
}

interface VerifyPurchaseResult {
  ok: boolean
  entitled?: boolean
  status?: string
  pending?: boolean
  error?: string
  /** HTTP 401 — the local session is missing or no longer valid server-side. */
  unauthorized?: boolean
  /** HTTP status from verify-purchase, when the server responded. */
  httpStatus?: number
  /** fetch() rejected before any HTTP response — network/transport failure. */
  transportFailed?: boolean
}

async function verifyPurchaseToken(
  purchaseToken: string,
  productId: string,
  extra?: { usedTrialOffer?: boolean; obfuscatedExternalAccountId?: string },
  source: string = 'purchase'
): Promise<VerifyPurchaseResult> {
  let res: Response
  try {
    res = await fetch('/api/google-play/verify-purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseToken, productId, ...extra }),
    })
  } catch (e: any) {
    console.warn('[GooglePlayBilling] verify transport failed:', {
      source, productId, error: e?.message,
    })
    return { ok: false, error: e?.message || 'Network error during verification', transportFailed: true }
  }
  const verification = await res.json()
  if (!res.ok || !verification.ok) {
    // Diagnostics for failed verification only: never log the raw token or
    // any session/auth material — a short token hash fingerprint is enough
    // to correlate retries.
    let tokenHash = ''
    try {
      tokenHash = (await sha256Hex(purchaseToken)).slice(0, 8)
    } catch {}
    console.warn('[GooglePlayBilling] verify failed:', {
      status: res.status, source, productId, tokenHash,
      error: verification?.error,
    })
    return {
      ok: false,
      error: verification.error || 'Purchase verification failed',
      unauthorized: res.status === 401,
      httpStatus: res.status,
    }
  }
  return {
    ok: true,
    entitled: verification.entitled,
    status: verification.status,
    pending: verification.pending,
  }
}

/**
 * Google reported SUBSCRIPTION_STATE_PENDING — license-test and deferred
 * transactions can take a few seconds to settle to ACTIVE. Re-check the
 * authoritative verification briefly before reporting pending.
 */
async function retryPendingVerification(purchaseToken: string, productId: string): Promise<VerifyPurchaseResult> {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 4000))
    try {
      const rv = await verifyPurchaseToken(purchaseToken, productId, undefined, 'pending-retry')
      if (rv.ok && rv.entitled) {
        return { ok: true, entitled: true, status: rv.status }
      }
      if (rv.ok && !rv.pending) break
    } catch (e) {
      console.warn('[GooglePlayBilling] Pending re-check failed:', e)
    }
  }
  return { ok: true, pending: true }
}

const PLAY_PENDING_SETTLE_MAX_ATTEMPTS = 10
const PLAY_PENDING_SETTLE_INTERVAL_MS = 4000

/**
 * A native PENDING result is usually transient payment-confirmation lag —
 * the purchase flips to PURCHASED in Play's local cache seconds after the
 * sheet closes, which is why a manual retry finds it instantly. Poll the
 * held-purchase table briefly for that flip so a settled purchase proceeds
 * to server verification instead of showing the pending fallback. Only a
 * purchase that reaches PURCHASED yields a token — a genuinely deferred
 * payment stays pending after the bounded window. Never launches a second
 * purchase.
 */
async function waitForPendingPurchaseSettle(productId: string): Promise<string | null> {
  for (let i = 0; i < PLAY_PENDING_SETTLE_MAX_ATTEMPTS; i++) {
    try {
      const { purchases } = await GooglePlayBilling.queryPurchases()
      const held = purchases.find(p => p.products?.includes(productId))
      if (held?.purchaseState === 1 && held.purchaseToken) {
        diag('pending-settle-held', {
          attempt: i, products: held.products, isAcknowledged: held.isAcknowledged,
          orderId: held.orderId, tokenHash: await tokenFingerprint(held.purchaseToken),
        })
        return held.purchaseToken
      }
    } catch (e) {
      console.warn('[GooglePlayBilling] Pending settle re-query failed:', e)
    }
    if (i < PLAY_PENDING_SETTLE_MAX_ATTEMPTS - 1) {
      await new Promise(r => setTimeout(r, PLAY_PENDING_SETTLE_INTERVAL_MS))
    }
  }
  return null
}

/**
 * Launch the native purchase sheet, then ask the server to verify the token.
 * Returns the server-computed entitlement result.
 */
export async function purchaseSubscription(
  userId: string,
  productId = GOOGLE_PLAY_PRODUCT_ID
): Promise<{ ok: boolean; entitled?: boolean; status?: string; error?: string; canceled?: boolean; pending?: boolean; httpStatus?: number; transportFailed?: boolean; unauthorized?: boolean }> {
  const offer = await getBestSubscriptionOffer(productId)
  const obfuscatedAccountId = await sha256Hex(userId)
  diag('offer-selected', {
    productId: offer.productId, basePlanId: offer.basePlanId, offerId: offer.offerId,
    hasFreeTrial: offer.hasFreeTrial, billingPeriod: offer.billingPeriod,
    offerTokenHash: await tokenFingerprint(offer.offerToken),
  })

  const purchase = await GooglePlayBilling.launchPurchase({
    productId: offer.productId,
    offerToken: offer.offerToken,
    obfuscatedAccountId,
  })
  diag('launch-result', {
    status: purchase.status, code: purchase.code, message: purchase.message,
    products: purchase.products, orderId: purchase.orderId,
    tokenHash: await tokenFingerprint(purchase.purchaseToken),
  })

  if (purchase.status === 'canceled') {
    return { ok: true, canceled: true }
  }
  if (purchase.status === 'pending') {
    // The sheet closed with the payment still confirming — wait for the
    // held purchase to settle to PURCHASED, then run the same server
    // verification. A purchase that never settles is genuine pending.
    const settledToken = await waitForPendingPurchaseSettle(offer.productId)
    if (!settledToken) return { ok: true, pending: true }
    const verification = await verifyPurchaseToken(settledToken, offer.productId, {
      usedTrialOffer: offer.hasFreeTrial,
      obfuscatedExternalAccountId: obfuscatedAccountId,
    }, 'settle')
    return verification.pending
      ? retryPendingVerification(settledToken, offer.productId)
      : verification
  }
  // ITEM_ALREADY_OWNED (7): the Google account already holds this subscription
  // — re-verify the existing purchase instead of failing (restore path).
  if (purchase.status === 'error' && purchase.code === 7) {
    const { purchases } = await GooglePlayBilling.queryPurchases()
    const held = purchases.find(p => p.purchaseState === 1 && p.products?.includes(offer.productId))
    diag('owned-recovery-held', {
      heldCount: purchases.length, found: !!held,
      products: held?.products, purchaseState: held?.purchaseState,
      isAcknowledged: held?.isAcknowledged, orderId: held?.orderId,
      tokenHash: await tokenFingerprint(held?.purchaseToken),
    })
    if (!held?.purchaseToken) {
      return { ok: false, error: 'Subscription already owned but could not be recovered. Please restart the app.' }
    }
    const verification = await verifyPurchaseToken(held.purchaseToken, offer.productId, undefined, 'owned-recovery')
    if (!verification.ok) {
      return {
        ok: false,
        error: verification.error,
        httpStatus: verification.httpStatus,
        unauthorized: verification.unauthorized,
        transportFailed: verification.transportFailed,
      }
    }
    return verification.entitled
      ? { ok: true, entitled: true, status: verification.status }
      : { ok: true, pending: true }
  }

  if (purchase.status !== 'purchased' || !purchase.purchaseToken) {
    return { ok: false, error: purchase.message || 'Purchase failed' }
  }

  const verification = await verifyPurchaseToken(purchase.purchaseToken, offer.productId, {
    usedTrialOffer: offer.hasFreeTrial,
    obfuscatedExternalAccountId: obfuscatedAccountId,
  }, 'purchase')
  if (!verification.ok) {
    return {
      ok: false,
      error: verification.error,
      httpStatus: verification.httpStatus,
      unauthorized: verification.unauthorized,
      transportFailed: verification.transportFailed,
    }
  }
  if (verification.pending) {
    return retryPendingVerification(purchase.purchaseToken, offer.productId)
  }
  return { ok: true, entitled: verification.entitled, status: verification.status }
}

/**
 * Reconciliation: re-submit all Play-held subscription purchases for
 * server-side verification. Safe to call on resume and cold start.
 */
export async function reconcilePlayPurchases(): Promise<{ entitled: boolean }> {
  // verify-purchase requires an authenticated cookie session — the route
  // always answers 401 without one. Skip the reconcile entirely when signed
  // out (cold start / app resume on the auth or signup screen) so it never
  // emits guaranteed-failure verification requests.
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { entitled: false }
  } catch {
    return { entitled: false }
  }

  const { purchases } = await GooglePlayBilling.queryPurchases()
  diag('reconcile-held', {
    count: purchases.length,
    purchases: await Promise.all(purchases.map(async p => ({
      products: p.products, purchaseState: p.purchaseState,
      isAcknowledged: p.isAcknowledged, orderId: p.orderId,
      tokenHash: await tokenFingerprint(p.purchaseToken),
    }))),
  })
  let entitled = false
  for (const p of purchases) {
    if (p.purchaseState !== 1 /* PURCHASED */) continue
    const productId = p.products?.[0]
    if (!productId) continue
    try {
      const verification = await verifyPurchaseToken(p.purchaseToken, productId, undefined, 'reconcile')
      diag('reconcile-verify', {
        productId, tokenHash: await tokenFingerprint(p.purchaseToken),
        ok: verification.ok, entitled: verification.entitled,
        status: verification.status, pending: verification.pending,
        httpStatus: verification.httpStatus,
      })
      if (verification.ok && verification.entitled) entitled = true
      // A 401 means the local session is stale server-side — every further
      // token verification in this invocation is guaranteed to fail the same
      // way. Stop rather than producing a retry storm.
      if (verification.unauthorized) break
    } catch (e) {
      console.warn('[GooglePlayBilling] Reconcile failed for purchase:', e)
    }
  }
  return { entitled }
}

/** Play Store subscription-management URL (replaces Stripe portal on Android). */
export function getPlaySubscriptionManageUrl(productId = GOOGLE_PLAY_PRODUCT_ID, packageName = 'com.replyflowhq.app'): string {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(packageName)}`
}
