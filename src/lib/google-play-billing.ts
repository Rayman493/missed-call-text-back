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
    return { ok: true, pending: true }
  }
  // ITEM_ALREADY_OWNED (7): the Google account already holds this subscription
  // — re-verify the existing purchase instead of failing (restore path).
  if (purchase.status === 'error' && purchase.code === 7) {
    const { purchases } = await GooglePlayBilling.queryPurchases()
    const held = purchases.find(p => p.purchaseState === 1 && p.products?.includes(offer.productId))
    if (!held?.purchaseToken) {
      return { ok: false, error: 'Subscription already owned but could not be recovered. Please restart the app.' }
    }
    const res = await fetch('/api/google-play/verify-purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchaseToken: held.purchaseToken, productId: offer.productId }),
    })
    const verification = await res.json()
    if (!res.ok || !verification.ok) {
      return { ok: false, error: verification.error || 'Purchase verification failed' }
    }
    return verification.entitled
      ? { ok: true, entitled: true, status: verification.status }
      : { ok: true, pending: true }
  }

  if (purchase.status !== 'purchased' || !purchase.purchaseToken) {
    return { ok: false, error: purchase.message || 'Purchase failed' }
  }

  const res = await fetch('/api/google-play/verify-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchaseToken: purchase.purchaseToken,
      productId: offer.productId,
      usedTrialOffer: offer.hasFreeTrial,
      obfuscatedExternalAccountId: obfuscatedAccountId,
    }),
  })
  const verification = await res.json()
  if (!res.ok || !verification.ok) {
    return { ok: false, error: verification.error || 'Purchase verification failed' }
  }
  if (verification.pending) {
    // Google reported SUBSCRIPTION_STATE_PENDING — license-test and deferred
    // transactions can take a few seconds to settle to ACTIVE. Retry the
    // authoritative verification briefly before reporting pending.
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 4000))
      try {
        const retry = await fetch('/api/google-play/verify-purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purchaseToken: purchase.purchaseToken, productId: offer.productId }),
        })
        const rv = await retry.json()
        if (retry.ok && rv.ok && rv.entitled) {
          return { ok: true, entitled: true, status: rv.status }
        }
        if (retry.ok && rv.ok && !rv.pending) break
      } catch (e) {
        console.warn('[GooglePlayBilling] Pending re-check failed:', e)
      }
    }
    return { ok: true, pending: true }
  }
  return { ok: true, entitled: verification.entitled, status: verification.status }
}

/**
 * Reconciliation: re-submit all Play-held subscription purchases for
 * server-side verification. Safe to call on resume and cold start.
 */
export async function reconcilePlayPurchases(): Promise<void> {
  const { purchases } = await GooglePlayBilling.queryPurchases()
  for (const p of purchases) {
    if (p.purchaseState !== 1 /* PURCHASED */) continue
    const productId = p.products?.[0]
    if (!productId) continue
    try {
      await fetch('/api/google-play/verify-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseToken: p.purchaseToken, productId }),
      })
    } catch (e) {
      console.warn('[GooglePlayBilling] Reconcile failed for purchase:', e)
    }
  }
}

/** Play Store subscription-management URL (replaces Stripe portal on Android). */
export function getPlaySubscriptionManageUrl(productId = GOOGLE_PLAY_PRODUCT_ID, packageName = 'com.replyflowhq.app'): string {
  return `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(packageName)}`
}
