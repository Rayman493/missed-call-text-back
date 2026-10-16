/**
 * Apple In-App Purchase — WebView-side wrapper.
 *
 * Native plugin: ReplyflowAppleBilling (ios/App/ReplyflowAppleBillingPlugin.swift).
 * A purchase result here is only a signed transaction — entitlement comes
 * from POST /api/apple/verify-transaction after server-side JWS + App Store
 * Server API verification. Client-side callbacks never grant access.
 */

import { registerPlugin } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import { supabase } from '@/lib/supabase/browser'

export const APPLE_PRODUCT_ID =
  process.env.NEXT_PUBLIC_APPLE_PRODUCT_ID || 'com.replyflowhq.monthly'

export interface AppleSubscriptionOffer {
  productId: string
  displayName: string
  description: string
  displayPrice: string
  price: number
  currency: string
  type: string
  subscriptionPeriod?: string
  introOffer?: {
    displayPrice: string
    paymentMode: 'freeTrial' | 'payAsYouGo' | 'payUpFront' | 'unknown'
    period: string
    periodCount: number
  }
  introOfferEligible?: boolean
}

export interface ApplePurchaseResult {
  status: 'success' | 'pending' | 'userCancelled'
  jwsRepresentation?: string
  transactionId?: string
  originalTransactionId?: string
  productId?: string
}

export interface AppleEntitlement {
  jwsRepresentation: string
  transactionId?: string
  originalTransactionId?: string
  productId?: string
}

interface AppleBillingPlugin {
  isSupported(): Promise<{ supported: boolean }>
  getSubscriptionOffer(options: { productId: string }): Promise<AppleSubscriptionOffer>
  launchPurchase(options: {
    productId: string
    appAccountToken?: string
  }): Promise<ApplePurchaseResult>
  queryEntitlements(): Promise<{ transactions: AppleEntitlement[] }>
  sync(): Promise<{ ok: boolean }>
  finishTransaction(options: { transactionId: string }): Promise<{ finished: boolean }>
  addListener(
    eventName: 'transactionUpdate',
    listenerFunc: (data: AppleEntitlement) => void
  ): Promise<{ remove: () => void }>
  removeAllListeners(): Promise<void>
}

const AppleBilling = registerPlugin<AppleBillingPlugin>('ReplyflowAppleBilling')

export function isNativeIOS(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/**
 * Startup diagnostic — proves the native plugin is compiled into the binary
 * AND registered (registerPluginInstance ran). A stale/misbuilt binary throws
 * UNIMPLEMENTED here at boot instead of surfacing inside the purchase flow.
 */
export async function probeAppleBilling(): Promise<boolean> {
  if (!isNativeIOS()) return false
  try {
    const { supported } = await AppleBilling.isSupported()
    console.log(`[APPLE BILLING] native plugin probe: ok supported=${supported}`)
    return true
  } catch (e: any) {
    console.error('[APPLE BILLING] native plugin probe FAILED — StoreKit bridge missing from this binary:', e?.message || e)
    return false
  }
}

async function sha256Bytes(text: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(digest)
}

/**
 * Deterministic appAccountToken — MUST match the server-side derivation in
 * src/lib/apple/billing-service.ts byte-for-byte so the App Store Server API
 * records the same UUID we verify against.
 */
export async function appleAppAccountTokenForUserId(userId: string): Promise<string> {
  const bytes = await sha256Bytes(`replyflow-apple:${userId}`)
  const b = bytes.slice(0, 16)
  b[6] = (b[6] & 0x0f) | 0x50
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export async function getSubscriptionOffer(productId = APPLE_PRODUCT_ID): Promise<AppleSubscriptionOffer> {
  return AppleBilling.getSubscriptionOffer({ productId })
}

interface VerifyResult {
  ok: boolean
  entitled?: boolean
  status?: string
  pending?: boolean
  error?: string
  unauthorized?: boolean
  httpStatus?: number
  transportFailed?: boolean
}

async function postVerify(body: Record<string, unknown>, source: string): Promise<VerifyResult> {
  let res: Response
  try {
    res = await fetch('/api/apple/verify-transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e: any) {
    console.warn('[AppleBilling] verify transport failed:', { source, error: e?.message })
    return { ok: false, error: e?.message || 'Network error during verification', transportFailed: true }
  }
  const verification = await res.json().catch(() => ({}))
  if (!res.ok || !verification.ok) {
    console.warn('[AppleBilling] verify failed:', {
      status: res.status, source, error: verification?.error,
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

async function verifySignedTransaction(jws: string, source: string): Promise<VerifyResult> {
  return postVerify({ signedTransactionInfo: jws }, source)
}

/**
 * Server re-verification with a bounded retry — Apple's subscription-status
 * record can lag the local purchase result by a few seconds. Mirrors the GP
 * pending-retry behavior.
 */
async function retryPendingVerification(jws: string): Promise<VerifyResult> {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 4000))
    const rv = await verifySignedTransaction(jws, 'pending-retry')
    if (rv.ok && rv.entitled) {
      return { ok: true, entitled: true, status: rv.status }
    }
    if (rv.ok && !rv.pending) break
  }
  return { ok: true, pending: true }
}

/**
 * Launch the native purchase sheet, then ask the server to verify the signed
 * transaction. The transaction is finished (marked complete) only after the
 * server confirms — an unverified transaction stays in the unfinished queue
 * and is retried by reconciliation instead of being lost.
 */
export async function purchaseSubscription(
  userId: string,
  productId = APPLE_PRODUCT_ID
): Promise<{ ok: boolean; entitled?: boolean; status?: string; error?: string; canceled?: boolean; pending?: boolean; httpStatus?: number; transportFailed?: boolean; unauthorized?: boolean }> {
  const offer = await getSubscriptionOffer(productId)
  const appAccountToken = await appleAppAccountTokenForUserId(userId)

  // Restore-before-purchase: when the App Store account already holds this
  // subscription, StoreKit shows an "already subscribed" sheet instead of a
  // purchase — verify the held entitlement directly instead (same-business
  // restores idempotently; a different-business subscription 409s and must
  // never be rebound).
  const { transactions: heldBefore } = await AppleBilling.queryEntitlements()
  const held = heldBefore.find(t => t.productId === offer.productId)
  if (held?.jwsRepresentation) {
    const verification = await verifySignedTransaction(held.jwsRepresentation, 'pre-launch-restore')
    if (verification.ok && verification.entitled) {
      return { ok: true, entitled: true, status: verification.status }
    }
    // Only a 400 (transaction unrecognized) may proceed to a normal launch.
    // Every other failure — 409 ownership conflict, 401, transient 404/5xx/
    // transport — must not launch while ownership or entitlement is
    // uncertain.
    if (!verification.ok && verification.httpStatus !== 400) {
      return {
        ok: false,
        error: verification.error,
        httpStatus: verification.httpStatus,
        unauthorized: verification.unauthorized,
        transportFailed: verification.transportFailed,
      }
    }
  }

  const purchase = await AppleBilling.launchPurchase({
    productId: offer.productId,
    appAccountToken,
  })

  if (purchase.status === 'userCancelled') {
    return { ok: true, canceled: true }
  }
  if (purchase.status === 'pending') {
    // Ask to Buy / SCA — the transaction arrives via Transaction.updates
    // when approved; the listener verifies it in the background.
    return { ok: true, pending: true }
  }
  if (purchase.status !== 'success' || !purchase.jwsRepresentation) {
    return { ok: false, error: 'Purchase failed' }
  }

  const verification = await verifySignedTransaction(purchase.jwsRepresentation, 'purchase')
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
    return retryPendingVerification(purchase.jwsRepresentation)
  }
  // Server confirmed — finish the transaction so StoreKit stops re-delivering it.
  if (purchase.transactionId) {
    try {
      await AppleBilling.finishTransaction({ transactionId: purchase.transactionId })
    } catch (e) {
      console.warn('[AppleBilling] finishTransaction failed (will retry via queue):', e)
    }
  }
  return { ok: true, entitled: verification.entitled, status: verification.status }
}

/**
 * Reconciliation: re-submit all held entitlements for server verification.
 * When the device reports none, ask the server to re-check the stored
 * subscription — an empty device view can never strip an entitlement Apple
 * still reports as live. Safe to call on every resume and cold start.
 */
export async function reconcileApplePurchases(): Promise<{ entitled: boolean }> {
  // verify-transaction requires an authenticated cookie session — skip the
  // reconcile entirely when signed out so it never emits guaranteed-failure
  // verification requests.
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { entitled: false }
  } catch {
    return { entitled: false }
  }

  const { transactions } = await AppleBilling.queryEntitlements()
  let entitled = false
  for (const t of transactions) {
    if (!t.jwsRepresentation) continue
    try {
      const verification = await verifySignedTransaction(t.jwsRepresentation, 'reconcile')
      if (verification.ok && verification.entitled) entitled = true
      if (verification.unauthorized) break
    } catch (e) {
      console.warn('[AppleBilling] Reconcile failed for transaction:', e)
    }
  }

  if (transactions.length === 0) {
    // Empty device view — reconcile against the stored subscription so
    // Apple's authoritative status (not the local snapshot) decides.
    try {
      const verification = await postVerify({ reconcile: true }, 'reconcile-empty')
      if (verification.ok && verification.entitled) entitled = true
    } catch (e) {
      console.warn('[AppleBilling] Empty reconcile failed:', e)
    }
  }
  return { entitled }
}

/** Restore Purchases — force a StoreKit sync then re-verify held entitlements. */
export async function restoreApplePurchases(): Promise<{ entitled: boolean }> {
  try {
    await AppleBilling.sync()
  } catch (e) {
    console.warn('[AppleBilling] AppStore.sync failed:', e)
  }
  return reconcileApplePurchases()
}

/**
 * Subscribe to Transaction.updates pushes (renewals, Ask-to-Buy approvals,
 * restores from other devices) — each is verified server-side in the
 * background. Register once at app start on iOS.
 */
export function registerTransactionUpdateListener(): void {
  if (!isNativeIOS()) return
  void AppleBilling.addListener('transactionUpdate', (data) => {
    if (!data?.jwsRepresentation) return
    void verifySignedTransaction(data.jwsRepresentation, 'transaction-update').then(v => {
      if (v.ok && v.entitled && data.transactionId) {
        AppleBilling.finishTransaction({ transactionId: data.transactionId }).catch(() => {})
      }
    })
  })
}

/** Apple subscription-management URL (replaces Stripe portal on iOS). */
export function getAppleSubscriptionManageUrl(): string {
  return 'https://apps.apple.com/account/subscriptions'
}
