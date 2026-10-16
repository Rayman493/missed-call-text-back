/**
 * Apple In-App Purchase — server-side subscription verification & entitlement.
 *
 * Mirrors google-play/billing-service.ts: client-supplied data is never
 * trusted. Transaction JWS payloads are signature-verified against Apple's
 * x5c chain, then the authoritative subscription state is re-fetched from
 * the App Store Server API before any entitlement write.
 *
 * Identity model differs from Google Play:
 *  - Apple: originalTransactionId is stable across renewals/restores — it is
 *    the purchase identity (analogous to the Play purchase token).
 *  - Account binding: appAccountToken (UUID derived from the user id, set at
 *    purchase) — the analogue of Play's obfuscatedExternalAccountId.
 *  - Environment: signedTransactionInfo.environment ('Production' |
 *    'Sandbox') selects which App Store Server API host is queried.
 *
 * Reuses businesses.subscription_status ('trialing' | 'active' | 'past_due'
 * | 'canceled' | null) so BusinessGuard / hasBillingAccess / provisioning
 * checks work unchanged.
 */

import { createHash } from 'crypto'
import { createAppleServerToken, getAppleBundleId } from './auth'
import { verifyAppleJws, decodeAppleJwsUnsafe } from './jws'

export const APPLE_API_BASE_PRODUCTION = 'https://api.storekit.itunes.apple.com'
export const APPLE_API_BASE_SANDBOX = 'https://api.storekit-sandbox.itunes.apple.com'

const ALLOWED_PRODUCT_IDS = (process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS || 'replyflow_monthly_apple')
  .split(',').map(s => s.trim()).filter(Boolean)

/** App Store Server API getAllSubscriptionStatuses status enum. */
export const APPLE_SUBSCRIPTION_STATUS = {
  ACTIVE: 1,
  EXPIRED: 2,
  BILLING_RETRY: 3,
  BILLING_GRACE: 4,
  REVOKED: 5,
} as const

const APPLE_STATUS_NAMES: Record<string, number> = {
  Active: APPLE_SUBSCRIPTION_STATUS.ACTIVE,
  Expired: APPLE_SUBSCRIPTION_STATUS.EXPIRED,
  'Billing Retry': APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY,
  'Billing Grace Period': APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE,
  Revoked: APPLE_SUBSCRIPTION_STATUS.REVOKED,
}

/** REST surfaces the enum as an integer; defensively accept label strings. */
export function parseSubscriptionStatus(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return APPLE_STATUS_NAMES[v] ?? 0
  return 0
}

/** JWS transaction payload offerType: 1 = introductory (our free trial). */
export const APPLE_OFFER_TYPE = {
  INTRODUCTORY: 1,
  PROMOTIONAL: 2,
  OFFER_CODE: 3,
  WIN_BACK: 4,
} as const

export interface AppleTransactionInfo {
  transactionId?: string
  originalTransactionId?: string
  webOrderLineItemId?: string
  bundleId?: string
  productId?: string
  subscriptionGroupIdentifier?: string
  purchaseDate?: number
  originalPurchaseDate?: number
  expiresDate?: number
  quantity?: number
  type?: string
  inAppOwnershipType?: string
  signedDate?: number
  revocationDate?: number
  revocationReason?: number
  offerType?: number
  offerIdentifier?: string
  environment?: string
  storefront?: string
  storefrontId?: string
  price?: number
  currency?: string
  appAccountToken?: string
  transactionReason?: string
  isUpgraded?: boolean
}

export interface AppleRenewalInfo {
  originalTransactionId?: string
  autoRenewProductId?: string
  productId?: string
  autoRenewStatus?: number // 0 = off, 1 = on
  isInBillingRetryPeriod?: boolean
  expirationIntent?: number
  gracePeriodExpiresDate?: number
  priceIncreaseStatus?: number
  renewalDate?: number
  renewalPrice?: number
  currency?: string
  offerIdentifier?: string
  offerType?: number
  signedDate?: number
  environment?: string
}

export interface AppleSubscriptionData {
  status: number
  transactionInfo: AppleTransactionInfo
  renewalInfo: AppleRenewalInfo | null
}

export type ApplyResult =
  | { ok: true; entitled: boolean; status: string; businessId: string; alreadyOwned?: boolean; pending?: boolean;
      apple?: { status: number; expiresDate: string | null; environment: string | null; sandbox: boolean } }
  | { ok: false; error: string; status?: number }

/**
 * Deterministic appAccountToken (UUID) binding an Apple purchase to one
 * ReplyFlow user — the analogue of Play's obfuscatedExternalAccountId.
 * Derived (never stored) so verify + purchase agree without a column.
 */
export function appleAppAccountTokenForUser(userId: string): string {
  const hash = createHash('sha256').update(`replyflow-apple:${userId}`).digest()
  const b = Buffer.from(hash.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x50 // version 5
  b[8] = (b[8] & 0x3f) | 0x80 // variant
  const hex = b.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function apiBaseForEnvironment(environment?: string | null): string {
  if (process.env.APPLE_STOREKIT_API_BASE) return process.env.APPLE_STOREKIT_API_BASE
  return environment === 'Sandbox' ? APPLE_API_BASE_SANDBOX : APPLE_API_BASE_PRODUCTION
}

async function appleApi(path: string, environment?: string | null): Promise<Response> {
  const token = createAppleServerToken()
  if ('error' in token) throw new Error(token.error)
  return fetch(`${apiBaseForEnvironment(environment)}${path}`, {
    headers: { Authorization: `Bearer ${token.token}` },
  })
}

/**
 * getAllSubscriptionStatuses — authoritative state for one
 * originalTransactionId. Picks the lastTransactions entry matching the id,
 * verifies both JWS blobs against the Apple x5c chain, and returns the
 * decoded payloads. Returns null on Apple's TransactionIdNotFound (404).
 */
export async function fetchSubscriptionStatus(
  originalTransactionId: string,
  environment?: string | null
): Promise<AppleSubscriptionData | null> {
  const res = await appleApi(
    `/inApps/v1/subscriptions/${encodeURIComponent(originalTransactionId)}`,
    environment
  )
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`subscriptions status failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const json = await res.json() as {
    data?: Array<{
      subscriptionGroupIdentifier?: string
      lastTransactions?: Array<{
        originalTransactionId?: string
        status?: number
        signedTransactionInfo?: string
        signedRenewalInfo?: string
      }>
    }>
    environment?: string
  }

  const entry = (json.data ?? [])
    .flatMap(d => d.lastTransactions ?? [])
    .find(t => t.originalTransactionId === originalTransactionId)
  if (!entry?.signedTransactionInfo) {
    throw new Error('Apple returned no signed transaction data for originalTransactionId')
  }

  const tx = verifyAppleJws<AppleTransactionInfo>(entry.signedTransactionInfo)
  if ('error' in tx) throw new Error(`Transaction JWS verification failed: ${tx.error}`)

  let renewalInfo: AppleRenewalInfo | null = null
  if (entry.signedRenewalInfo) {
    const ri = verifyAppleJws<AppleRenewalInfo>(entry.signedRenewalInfo)
    if ('error' in ri) throw new Error(`Renewal info JWS verification failed: ${ri.error}`)
    renewalInfo = ri.payload
  }

  if (tx.payload.originalTransactionId &&
      tx.payload.originalTransactionId !== originalTransactionId) {
    throw new Error('Transaction JWS does not match requested originalTransactionId')
  }

  return {
    status: parseSubscriptionStatus(entry.status),
    transactionInfo: tx.payload,
    renewalInfo,
  }
}

function msToIso(ms?: number | null): string | null {
  return typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : null
}

/**
 * Map Apple subscription status + JWS payloads onto the ReplyFlow status
 * model — the analogue of mapPlayEntitlement.
 *
 *  - REVOKED / forceRevoked / revocationDate → 'canceled' immediately
 *    (refund/revoke ends entitlement now, not at period end).
 *  - ACTIVE → 'trialing' when the latest transaction is still the
 *    introductory offer, else 'active'.
 *  - BILLING_GRACE → 'active' through gracePeriodExpiresDate (access is
 *    preserved during Apple's grace window, mirroring Play's grace→active).
 *  - BILLING_RETRY (past grace) → 'past_due'.
 *  - EXPIRED → 'canceled' honoring expiresDate as the end of access.
 */
export function mapAppleEntitlement(
  data: { status: number; transactionInfo: AppleTransactionInfo; renewalInfo: AppleRenewalInfo | null },
  opts: { isTrial: boolean; forceRevoked?: boolean }
): { status: string | null; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } {
  const tx = data.transactionInfo
  const expiry = msToIso(tx.expiresDate)
  const now = Date.now()
  const expired = typeof tx.expiresDate === 'number' && tx.expiresDate <= now
  const revoked = !!opts.forceRevoked ||
    data.status === APPLE_SUBSCRIPTION_STATUS.REVOKED ||
    typeof tx.revocationDate === 'number'

  if (revoked) {
    return {
      status: 'canceled',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: msToIso(tx.revocationDate) ?? expiry,
    }
  }

  const autoRenewOn = data.renewalInfo?.autoRenewStatus !== 0

  switch (data.status) {
    case APPLE_SUBSCRIPTION_STATUS.ACTIVE:
      return {
        status: opts.isTrial && expiry && !expired ? 'trialing' : 'active',
        cancelAtPeriodEnd: !autoRenewOn,
        currentPeriodEnd: expiry,
      }
    case APPLE_SUBSCRIPTION_STATUS.BILLING_GRACE:
      return {
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: msToIso(data.renewalInfo?.gracePeriodExpiresDate) ?? expiry,
      }
    case APPLE_SUBSCRIPTION_STATUS.BILLING_RETRY:
      return { status: 'past_due', cancelAtPeriodEnd: false, currentPeriodEnd: expiry }
    case APPLE_SUBSCRIPTION_STATUS.EXPIRED:
      return { status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: expiry }
    default:
      return { status: null, cancelAtPeriodEnd: false, currentPeriodEnd: expiry }
  }
}

/**
 * Verify an originalTransactionId against the App Store Server API and apply
 * the resulting entitlement to exactly one business. Idempotent: safe to
 * call on every verify/reconcile/ASSN pass.
 *
 * For reconcile passes where the client holds no entitlement, pass
 * originalTransactionId only — the server still consults Apple's
 * authoritative status, so a device-side empty entitlement list can never
 * strip a subscription Apple still reports as live.
 */
export async function verifyAndApplyTransaction(
  supabaseAdmin: any,
  args: {
    originalTransactionId: string
    businessId: string
    userId: string
    expectedProductId?: string
    forceRevoked?: boolean
    /** Already-verified transaction info (client JWS or ASSN notification)
     * used only for environment routing — never the source of truth; the
     * server fetch is always re-checked. */
    transactionInfoHint?: AppleTransactionInfo
  }
): Promise<ApplyResult> {
  const { originalTransactionId, businessId, userId } = args

  const data = await fetchSubscriptionStatus(originalTransactionId, args.transactionInfoHint?.environment)
  const fetchedAt = new Date().toISOString()
  if (!data) {
    if (args.forceRevoked) {
      // Apple can 404 fully-aged transactions. The id is already bound to
      // this business — revoke directly rather than retry-looping.
      const { error: revokeError } = await supabaseAdmin
        .from('businesses')
        .update({
          subscription_status: 'canceled',
          cancel_at_period_end: false,
          apple_revoked_at: new Date().toISOString(),
          apple_last_verified_at: new Date().toISOString(),
        })
        .eq('id', businessId)
        .eq('apple_original_transaction_id', originalTransactionId)
      if (revokeError) {
        return { ok: false, error: `Failed to revoke entitlement: ${revokeError.message}`, status: 500 }
      }
      return { ok: true, entitled: false, status: 'canceled', businessId }
    }
    return { ok: false, error: 'Transaction not recognized by App Store', status: 400 }
  }

  const tx = data.transactionInfo
  const apiProductId = tx.productId
  if (!apiProductId || !ALLOWED_PRODUCT_IDS.includes(apiProductId)) {
    return { ok: false, error: 'Purchase is not for a ReplyFlow subscription product', status: 400 }
  }
  if (args.expectedProductId && apiProductId !== args.expectedProductId) {
    return { ok: false, error: 'Reported product does not match App Store record', status: 400 }
  }
  if (tx.bundleId && tx.bundleId !== getAppleBundleId()) {
    return { ok: false, error: 'Transaction bundle id does not match this app', status: 400 }
  }

  // Account binding: appAccountToken set at purchase must match this user's
  // derived UUID (when present on the transaction).
  const expectedAccountToken = appleAppAccountTokenForUser(userId)
  if (tx.appAccountToken &&
      tx.appAccountToken.toLowerCase() !== expectedAccountToken.toLowerCase()) {
    return { ok: false, error: 'Purchase belongs to a different app account', status: 403 }
  }

  // Identity uniqueness: one Apple subscription activates one business.
  const { data: owner } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('apple_original_transaction_id', originalTransactionId)
    .maybeSingle()
  if (owner && owner.id !== businessId) {
    return { ok: false, error: 'This Apple subscription already activates a different business', status: 409 }
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id, subscription_status, subscription_provider, stripe_subscription_id, google_play_purchase_token, apple_original_transaction_id, apple_is_trial, twilio_phone_number, provisioning_status')
    .eq('id', businessId)
    .maybeSingle()
  if (!business) {
    return { ok: false, error: 'Business not found', status: 404 }
  }
  if (business.user_id && business.user_id !== userId) {
    return { ok: false, error: 'Business does not belong to this user', status: 403 }
  }

  // Double-billing guards: an entitlement live under Stripe or Google Play
  // must not be overwritten by a dead Apple subscription. If Apple still
  // reports this subscription live, applying self-heals provider back to
  // 'apple' (same stale-label logic as the Play service's Stripe guard).
  if (business.subscription_provider === 'stripe' &&
      (business.subscription_status === 'active' || business.subscription_status === 'trialing')) {
    const guardMapped = mapAppleEntitlement(data, { isTrial: false, forceRevoked: args.forceRevoked })
    const appleStillLive = guardMapped.status !== null && guardMapped.status !== 'canceled'
    if (!appleStillLive) {
      return { ok: true, entitled: true, status: business.subscription_status, businessId, alreadyOwned: true }
    }
  }
  if (business.subscription_provider === 'google_play' &&
      (business.subscription_status === 'active' || business.subscription_status === 'trialing')) {
    const guardMapped = mapAppleEntitlement(data, { isTrial: false, forceRevoked: args.forceRevoked })
    const appleStillLive = guardMapped.status !== null && guardMapped.status !== 'canceled'
    if (!appleStillLive) {
      return { ok: true, entitled: true, status: business.subscription_status, businessId, alreadyOwned: true }
    }
  }

  // Trial continuity: the latest transaction's offerType is authoritative —
  // once Apple issues a paid renewal transaction (no introductory offer
  // type), the subscription is genuinely paid and the trial label clears.
  const isTrial = tx.offerType === APPLE_OFFER_TYPE.INTRODUCTORY &&
    (business.apple_is_trial || !business.apple_original_transaction_id ||
     business.apple_original_transaction_id === originalTransactionId)

  const mapped = mapAppleEntitlement(data, { isTrial, forceRevoked: args.forceRevoked })
  const expiry = mapped.currentPeriodEnd

  // Regression guard: a non-entitled snapshot may never erase an existing
  // entitlement for the same subscription unless the Apple state is
  // genuinely terminal (expired/revoked).
  const existingEntitled = business.subscription_status === 'active' || business.subscription_status === 'trialing'
  const terminal = args.forceRevoked ||
    data.status === APPLE_SUBSCRIPTION_STATUS.REVOKED ||
    data.status === APPLE_SUBSCRIPTION_STATUS.EXPIRED ||
    typeof tx.revocationDate === 'number'
  if (mapped.status === null && existingEntitled && !terminal) {
    return { ok: true, entitled: true, status: business.subscription_status, businessId, alreadyOwned: true }
  }

  // Monotonic application — only apply if this fetch is newer than the last
  // persisted verification. Prevents out-of-order ASSN notifications or a
  // slow concurrent verify from overwriting fresher state.
  const environment = tx.environment ?? null
  const { data: updatedRows, error: updateError } = await supabaseAdmin
    .from('businesses')
    .update({
      subscription_provider: 'apple',
      apple_original_transaction_id: originalTransactionId,
      apple_transaction_id: tx.transactionId ?? null,
      apple_product_id: apiProductId,
      apple_bundle_id: tx.bundleId ?? getAppleBundleId(),
      apple_environment: environment,
      apple_is_trial: mapped.status === 'trialing',
      apple_revoked_at: (args.forceRevoked || typeof tx.revocationDate === 'number')
        ? (msToIso(tx.revocationDate) ?? new Date().toISOString())
        : null,
      subscription_status: mapped.status,
      subscription_price_id: null,
      current_period_end: expiry,
      trial_ends_at: mapped.status === 'trialing' ? expiry : null,
      cancel_at_period_end: mapped.cancelAtPeriodEnd,
      cancel_at: mapped.cancelAtPeriodEnd ? expiry : null,
      apple_last_verified_at: fetchedAt,
    })
    .eq('id', businessId)
    .or(`apple_last_verified_at.is.null,apple_last_verified_at.lt.${fetchedAt}`)
    .select('id')

  if (updateError) {
    if (updateError.code === '23505') {
      return { ok: false, error: 'This Apple subscription already activates a different business', status: 409 }
    }
    return { ok: false, error: `Failed to persist entitlement: ${updateError.message}`, status: 500 }
  }

  if (!updatedRows || updatedRows.length === 0) {
    // A fresher verification already applied — stale snapshot, no-op.
    return {
      ok: true,
      entitled: business.subscription_status === 'active' || business.subscription_status === 'trialing',
      status: business.subscription_status ?? 'none',
      businessId,
      alreadyOwned: true,
    }
  }

  // Provisioning parity with Stripe/Play: fire the canonical provisioning
  // trigger so a newly-entitled business gets its Twilio number. Only
  // 'active'/'trialing' count; safe to repeat (rate-limited + idempotent).
  const newlyEntitled = mapped.status === 'active' || mapped.status === 'trialing'
  if (newlyEntitled && !business.twilio_phone_number) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
      const adminSecret = process.env.PROVISIONING_ADMIN_SECRET
      if (appUrl && adminSecret) {
        const provRes = await fetch(`${appUrl}/api/business/trigger-provisioning`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-secret': adminSecret },
          body: JSON.stringify({ business_id: businessId }),
        })
        console.log('[APPLE IAP] trigger-provisioning status:', provRes.status)
      } else {
        console.warn('[APPLE IAP] provisioning trigger skipped: NEXT_PUBLIC_APP_URL or PROVISIONING_ADMIN_SECRET not configured')
      }
    } catch (provErr: any) {
      console.warn('[APPLE IAP] provisioning trigger error:', provErr?.message || provErr)
    }
  }

  return {
    ok: true,
    entitled: mapped.status !== null,
    status: mapped.status ?? 'none',
    businessId,
    apple: {
      status: data.status,
      expiresDate: expiry,
      environment,
      sandbox: environment === 'Sandbox',
    },
  }
}

/**
 * Decode (verification-required upstream) the outer ASSN V2 signedPayload.
 * The payload carries notificationType/subtype/notificationUUID plus
 * data.signedTransactionInfo + data.signedRenewalInfo.
 */
export interface AppleNotification {
  notificationType?: string
  subtype?: string
  notificationUUID?: string
  data?: {
    appAppleId?: number
    bundleId?: string
    bundleVersion?: string
    environment?: string
    signedTransactionInfo?: string
    signedRenewalInfo?: string
  }
  version?: string
  signedDate?: number
}

export function decodeAndVerifyNotification(
  signedPayload: string
): { notification: AppleNotification; transactionInfo: AppleTransactionInfo | null; renewalInfo: AppleRenewalInfo | null } | { error: string } {
  const outer = verifyAppleJws<AppleNotification>(signedPayload)
  if ('error' in outer) return { error: `Notification JWS verification failed: ${outer.error}` }

  const notification = outer.payload
  if (notification.data?.bundleId && notification.data.bundleId !== getAppleBundleId()) {
    return { error: 'Notification bundle id does not match this app' }
  }

  let transactionInfo: AppleTransactionInfo | null = null
  let renewalInfo: AppleRenewalInfo | null = null
  if (notification.data?.signedTransactionInfo) {
    const tx = verifyAppleJws<AppleTransactionInfo>(notification.data.signedTransactionInfo)
    if ('error' in tx) return { error: `Transaction JWS verification failed: ${tx.error}` }
    transactionInfo = tx.payload
  }
  if (notification.data?.signedRenewalInfo) {
    const ri = verifyAppleJws<AppleRenewalInfo>(notification.data.signedRenewalInfo)
    if ('error' in ri) return { error: `Renewal info JWS verification failed: ${ri.error}` }
    renewalInfo = ri.payload
  }

  return { notification, transactionInfo, renewalInfo }
}

/** Decode-only peek used to log pre-verification diagnostics safely. */
export function peekNotificationType(signedPayload: string): string | null {
  const decoded = decodeAppleJwsUnsafe<AppleNotification>(signedPayload)
  return 'error' in decoded ? null : decoded.payload.notificationType ?? null
}
