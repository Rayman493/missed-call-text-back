/**
 * Google Play Billing — server-side subscription verification & entitlement.
 *
 * Uses the Play Developer API SubscriptionsV2 endpoint. Purchase tokens are
 * never trusted from the client; every entitlement change re-fetches the
 * authoritative subscription state from Google first.
 *
 * Reuses the existing businesses.subscription_status model ('trialing' |
 * 'active' | 'past_due' | 'canceled' | null) so BusinessGuard, hasBillingAccess
 * and provisioning checks work unchanged.
 */

import { getGooglePlayAccessToken } from './auth'

const API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3'

export const PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.replyflowhq.app'

const ALLOWED_PRODUCT_IDS = (process.env.GOOGLE_PLAY_SUBSCRIPTION_PRODUCT_IDS || 'replyflow_monthly')
  .split(',').map(s => s.trim()).filter(Boolean)

/** Google Play SubscriptionsV2 subscriptionState enum. */
export const SUBSCRIPTION_STATE = {
  UNSPECIFIED: 0,
  PENDING: 1,
  ACTIVE: 2,
  PAUSED: 3,
  IN_GRACE_PERIOD: 4,
  ON_HOLD: 5,
  CANCELED: 6,
  EXPIRED: 7,
  PENDING_PURCHASE_CANCELED: 8,
  COMPLETED: 9,
} as const

export interface PlaySubscriptionV2 {
  subscriptionState?: number
  acknowledgementState?: string
  linkedPurchaseToken?: string
  startTime?: string
  pausedStateContext?: { autoResumeTime?: string }
  canceledStateContext?: {
    userInitiatedCancellation?: { cancelTime?: string }
    systemInitiatedCancellation?: object
    developerInitiatedCancellation?: object
    replacementCancellation?: object
  }
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string
    obfuscatedExternalProfileId?: string
  }
  lineItems?: Array<{
    productId?: string
    expiryTime?: string
    autoRenewingPlan?: { autoRenewEnabled?: boolean }
    offerDetails?: { basePlanId?: string; offerId?: string }
  }>
  latestOrderId?: string
  testPurchase?: object
}

export type ApplyResult =
  | { ok: true; entitled: boolean; status: string; businessId: string; alreadyOwned?: boolean }
  | { ok: false; error: string; status?: number }

async function playApi(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGooglePlayAccessToken()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
}

export async function fetchSubscription(purchaseToken: string): Promise<PlaySubscriptionV2 | null> {
  const res = await playApi(
    `/applications/${encodeURIComponent(PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`
  )
  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`subscriptionsv2.get failed (${res.status}): ${body.slice(0, 300)}`)
  }
  return res.json()
}

async function acknowledgeSubscription(purchaseToken: string): Promise<void> {
  const res = await playApi(
    `/applications/${encodeURIComponent(PLAY_PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', body: JSON.stringify({}) }
  )
  if (!res.ok) {
    const body = await res.text()
    console.warn('[GOOGLE PLAY] acknowledge failed:', res.status, body.slice(0, 200))
  }
}

/**
 * Map a Play subscription + trial flag onto the ReplyFlow status model.
 * Access is granted only for 'trialing'/'active' — mirroring hasBillingAccess.
 */
export function mapPlayEntitlement(
  sub: PlaySubscriptionV2,
  opts: { isTrial: boolean; revoked?: boolean }
): { status: string | null; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } {
  const expiry = sub.lineItems?.[0]?.expiryTime ?? null
  const expired = expiry ? new Date(expiry).getTime() <= Date.now() : false

  if (opts.revoked || sub.subscriptionState === SUBSCRIPTION_STATE.EXPIRED ||
      (sub.subscriptionState === SUBSCRIPTION_STATE.CANCELED && expired)) {
    return { status: 'canceled', cancelAtPeriodEnd: false, currentPeriodEnd: expiry }
  }

  switch (sub.subscriptionState) {
    case SUBSCRIPTION_STATE.ACTIVE:
    case SUBSCRIPTION_STATE.IN_GRACE_PERIOD:
      return {
        status: opts.isTrial && expiry && !expired ? 'trialing' : 'active',
        cancelAtPeriodEnd: !(sub.lineItems?.[0]?.autoRenewingPlan?.autoRenewEnabled ?? true),
        currentPeriodEnd: expiry,
      }
    case SUBSCRIPTION_STATE.CANCELED:
      // User canceled but retains access until expiryTime.
      return { status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: expiry }
    case SUBSCRIPTION_STATE.PAUSED:
    case SUBSCRIPTION_STATE.ON_HOLD:
      return { status: 'past_due', cancelAtPeriodEnd: false, currentPeriodEnd: expiry }
    default:
      // PENDING / PENDING_PURCHASE_CANCELED / COMPLETED / UNSPECIFIED → no entitlement.
      return { status: null, cancelAtPeriodEnd: false, currentPeriodEnd: expiry }
  }
}

/**
 * Verify a purchase token against Google and apply the resulting entitlement
 * to exactly one business. Idempotent: safe to call on every resume/RTDN.
 */
export async function verifyAndApplyPurchase(
  supabaseAdmin: any,
  args: {
    purchaseToken: string
    productId: string
    businessId: string
    userId: string
    usedTrialOffer?: boolean
    obfuscatedExternalAccountId?: string
    forceRevoked?: boolean
  }
): Promise<ApplyResult> {
  const { purchaseToken, productId, businessId, userId } = args

  if (!ALLOWED_PRODUCT_IDS.includes(productId)) {
    return { ok: false, error: `Product ${productId} is not an allowed subscription product`, status: 400 }
  }

  const sub = await fetchSubscription(purchaseToken)
  if (!sub) {
    if (args.forceRevoked) {
      // Revoked tokens can return 404 once Google invalidates them. The
      // token is already bound to this business — revoke access directly
      // rather than failing the RTDN event into a retry loop.
      const { error: revokeError } = await supabaseAdmin
        .from('businesses')
        .update({
          subscription_status: 'canceled',
          cancel_at_period_end: false,
          google_play_revoked_at: new Date().toISOString(),
          google_play_last_verified_at: new Date().toISOString(),
        })
        .eq('id', businessId)
        .eq('google_play_purchase_token', purchaseToken)
      if (revokeError) {
        return { ok: false, error: `Failed to revoke entitlement: ${revokeError.message}`, status: 500 }
      }
      return { ok: true, entitled: false, status: 'canceled', businessId }
    }
    return { ok: false, error: 'Purchase token not recognized by Google Play', status: 400 }
  }

  const apiProductId = sub.lineItems?.[0]?.productId
  if (!apiProductId || !ALLOWED_PRODUCT_IDS.includes(apiProductId)) {
    return { ok: false, error: 'Purchase is not for a ReplyFlow subscription product', status: 400 }
  }
  if (apiProductId !== productId) {
    return { ok: false, error: 'Reported product does not match Google Play record', status: 400 }
  }

  // Account binding: the obfuscated account id set at purchase must match
  // this user's hash (when the client provided one).
  if (args.obfuscatedExternalAccountId &&
      sub.externalAccountIdentifiers?.obfuscatedExternalAccountId &&
      sub.externalAccountIdentifiers.obfuscatedExternalAccountId !== args.obfuscatedExternalAccountId) {
    return { ok: false, error: 'Purchase belongs to a different app account', status: 403 }
  }

  // Token uniqueness: never let one purchase activate two businesses.
  const { data: owner } = await supabaseAdmin
    .from('businesses')
    .select('id')
    .eq('google_play_purchase_token', purchaseToken)
    .maybeSingle()
  if (owner && owner.id !== businessId) {
    return { ok: false, error: 'This Google Play purchase already activates a different business', status: 409 }
  }

  const { data: business } = await supabaseAdmin
    .from('businesses')
    .select('id, user_id, subscription_status, subscription_provider, stripe_subscription_id, google_play_purchase_token, google_play_is_trial')
    .eq('id', businessId)
    .maybeSingle()
  if (!business) {
    return { ok: false, error: 'Business not found', status: 404 }
  }
  if (business.user_id && business.user_id !== userId) {
    return { ok: false, error: 'Business does not belong to this user', status: 403 }
  }

  // Double-billing guard: an active Stripe subscriber must not be moved to
  // Play billing. Leave the Stripe entitlement fully intact.
  if (business.subscription_provider === 'stripe' &&
      (business.subscription_status === 'active' || business.subscription_status === 'trialing')) {
    return { ok: true, entitled: true, status: business.subscription_status, businessId, alreadyOwned: true }
  }

  // Trial continuity: once the trial flag is set, keep it until a renewal or
  // revocation clears it — RTDN recomputes must not downgrade 'trialing'.
  const isTrial = args.usedTrialOffer ?? (business.google_play_purchase_token === purchaseToken ? business.google_play_is_trial : false)

  const mapped = mapPlayEntitlement(sub, { isTrial, revoked: args.forceRevoked })
  const expiry = mapped.currentPeriodEnd

  const { error: updateError } = await supabaseAdmin
    .from('businesses')
    .update({
      subscription_provider: 'google_play',
      google_play_purchase_token: purchaseToken,
      google_play_product_id: apiProductId,
      google_play_order_id: sub.latestOrderId ?? null,
      google_play_linked_purchase_token: sub.linkedPurchaseToken ?? null,
      google_play_package_name: PLAY_PACKAGE_NAME,
      google_play_is_trial: mapped.status === 'trialing',
      google_play_revoked_at: args.forceRevoked ? new Date().toISOString() : null,
      google_play_last_verified_at: new Date().toISOString(),
      subscription_status: mapped.status,
      subscription_price_id: null,
      current_period_end: expiry,
      trial_ends_at: mapped.status === 'trialing' ? expiry : null,
      cancel_at_period_end: mapped.cancelAtPeriodEnd,
      cancel_at: mapped.cancelAtPeriodEnd ? expiry : null,
    })
    .eq('id', businessId)

  if (updateError) {
    if (updateError.code === '23505') {
      return { ok: false, error: 'This Google Play purchase already activates a different business', status: 409 }
    }
    return { ok: false, error: `Failed to persist entitlement: ${updateError.message}`, status: 500 }
  }

  // Acknowledge initial purchases so Google doesn't auto-refund after 3 days.
  if (mapped.status !== null && sub.acknowledgementState !== 'ACKNOWLEDGED') {
    await acknowledgeSubscription(purchaseToken)
  }

  return { ok: true, entitled: mapped.status !== null, status: mapped.status ?? 'none', businessId }
}
