/**
 * Google Play Billing — WebView-side wrapper.
 *
 * Native plugin: ReplyflowGooglePlayBilling (android/.../ReplyflowGooglePlayBillingPlugin.java).
 * A purchase result here is only a token — entitlement comes from
 * POST /api/google-play/verify-purchase after server-side verification.
 */

import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'

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

export async function getBestSubscriptionOffer(productId = GOOGLE_PLAY_PRODUCT_ID): Promise<SubscriptionOffer> {
  return GooglePlayBilling.getSubscriptionOffer({ productId })
}

interface VerifyPurchaseResult {
  ok: boolean
  entitled?: boolean
  status?: string
  pending?: boolean
  error?: string
}

async function verifyPurchaseToken(
  purchaseToken: string,
  productId: string,
  extra?: { usedTrialOffer?: boolean; obfuscatedExternalAccountId?: string }
): Promise<VerifyPurchaseResult> {
  const res = await fetch('/api/google-play/verify-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purchaseToken, productId, ...extra }),
  })
  const verification = await res.json()
  if (!res.ok || !verification.ok) {
    return { ok: false, error: verification.error || 'Purchase verification failed' }
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
      const rv = await verifyPurchaseToken(purchaseToken, productId)
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
): Promise<{ ok: boolean; entitled?: boolean; status?: string; error?: string; canceled?: boolean; pending?: boolean }> {
  const offer = await getBestSubscriptionOffer(productId)
  const obfuscatedAccountId = await sha256Hex(userId)

  const purchase = await GooglePlayBilling.launchPurchase({
    productId: offer.productId,
    offerToken: offer.offerToken,
    obfuscatedAccountId,
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
    })
    return verification.pending
      ? retryPendingVerification(settledToken, offer.productId)
      : verification
  }
  // ITEM_ALREADY_OWNED (7): the Google account already holds this subscription
  // — re-verify the existing purchase instead of failing (restore path).
  if (purchase.status === 'error' && purchase.code === 7) {
    const { purchases } = await GooglePlayBilling.queryPurchases()
    const held = purchases.find(p => p.purchaseState === 1 && p.products?.includes(offer.productId))
    if (!held?.purchaseToken) {
      return { ok: false, error: 'Subscription already owned but could not be recovered. Please restart the app.' }
    }
    const verification = await verifyPurchaseToken(held.purchaseToken, offer.productId)
    if (!verification.ok) {
      return { ok: false, error: verification.error }
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
  })
  if (!verification.ok) {
    return { ok: false, error: verification.error }
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
  const { purchases } = await GooglePlayBilling.queryPurchases()
  let entitled = false
  for (const p of purchases) {
    if (p.purchaseState !== 1 /* PURCHASED */) continue
    const productId = p.products?.[0]
    if (!productId) continue
    try {
      const verification = await verifyPurchaseToken(p.purchaseToken, productId)
      if (verification.ok && verification.entitled) entitled = true
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
