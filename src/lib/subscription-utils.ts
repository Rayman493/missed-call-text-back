/**
 * Canonical subscription helper functions
 * Use these throughout the app to ensure consistent subscription logic
 */

import { hasActiveManualAccess } from './manual-access';
import { logRouteFlashDebug } from './route-flash-debug';

// BETA/COMPED ACCESS: All statuses that unlock full app access
const ACTIVE_ACCESS_STATUSES = ['active', 'trialing', 'beta', 'comped'];

export type SetupState = 
  | 'loading'
  | 'needs_trial'
  | 'provisioning_or_number_pending'
  | 'needs_forwarding'
  | 'needs_final_test'
  | 'complete'

export interface Business {
  id?: string;
  user_id?: string | null;
  subscription_status?: string | null;
  twilio_phone_number?: string | null;
  forwarding_enabled?: boolean;
  phone_setup_completed_at?: string | null;
  forwarding_verified?: boolean | null;
  setup_completed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_provider?: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  google_play_purchase_token?: string | null;
  google_play_revoked_at?: string | null;
  google_play_last_verified_at?: string | null;
  apple_original_transaction_id?: string | null;
  apple_revoked_at?: string | null;
  apple_last_verified_at?: string | null;
  checkout_completed_at?: string | null;
  messaging_status?: string | null;
  a2p_status?: string | null;
  call_forwarding_enabled?: boolean | null;
  provisioning_status?: string | null;
  business_hours_timezone?: string | null;
  name?: string | null;
  automation_settings?: any;
  // Test call completion fields
  first_test_call_completed_at?: string | null;
  // Manual access fields
  manual_access_enabled?: boolean | null;
  manual_access_expires_at?: string | null;
}

/**
 * Check if business has active access (trialing, active, beta, comped, or manual access)
 * This is the canonical way to check subscription eligibility
 * 
 * MANUAL ACCESS: Admin-granted access override that works like active subscription
 * This allows accounts with manual access to receive full functionality including Twilio provisioning
 */
export function hasActiveAccess(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  // Check manual access first - this is the admin override
  if (hasActiveManualAccess(business)) {
    return true
  }
  
  const status = business.subscription_status ?? '';
  if (!ACTIVE_ACCESS_STATUSES.includes(status)) {
    return false;
  }
  
  // Time-bound enforcement: providers normally flip subscription_status via
  // webhooks/store verification, but access must not depend on that delivery
  // timing. When the row carries a recorded entitlement bound that has passed,
  // the entitlement is expired regardless of the stale status value.
  // Rows without bounds (beta/comped, providers that don't populate them) are
  // unaffected.
  const now = Date.now();
  if (status === 'trialing' && business.trial_ends_at && new Date(business.trial_ends_at).getTime() <= now) {
    return false;
  }
  if (status === 'active' && business.current_period_end && new Date(business.current_period_end).getTime() <= now) {
    return false;
  }
  
  return true;
}

/**
 * Canonical alias for `hasActiveAccess`. Use this name across UI gating
 * (dashboard, settings, onboarding, setup components) so the same check is
 * always applied: subscription_status is 'active' or 'trialing'.
 */
export const hasActiveSubscription = hasActiveAccess;

/**
 * Check if business has an active trial specifically
 */
export function hasActiveTrial(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  return business.subscription_status === 'trialing';
}

/**
 * Check if business has an active (paid, post-trial) subscription specifically.
 * Most UI gating should use `hasActiveSubscription` (active OR trialing) instead.
 */
export function hasActiveSubscriptionOnly(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  return business.subscription_status === 'active';
}

/**
 * Check if forwarding setup is complete
 */
export function isForwardingComplete(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  // CRITICAL: forwarding_verified is the definitive source of truth.
  return Boolean(
    business.forwarding_verified === true ||
    business.forwarding_enabled || 
    business.phone_setup_completed_at
  );
}

/**
 * Check if full setup is complete (forwarding verified)
 */
export function isSetupComplete(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  return Boolean(
    business.forwarding_verified === true ||
    business.setup_completed_at
  );
}

/**
 * Check if business is ready for forwarding setup
 * Manual access accounts are eligible for forwarding setup without Stripe subscription
 */
export function isReadyForForwardingSetup(business: Business | null | undefined): boolean {
  if (!business) return false
  
  const hasAccess = hasActiveAccess(business)
  const hasManualAccess = hasActiveManualAccess(business)
  const hasNumber = Boolean(business.twilio_phone_number)
  
  // Manual access accounts don't require Stripe customer/subscription for forwarding setup
  if (hasManualAccess) {
    return (
      hasAccess &&
      hasNumber &&
      !isForwardingComplete(business) &&
      !isSetupComplete(business)
    )
  }
  
  // Billing identity: Stripe accounts need customer + subscription; Google
  // Play accounts carry a verified purchase token and Apple IAP accounts an
  // originalTransactionId instead. A persisted native identifier counts as
  // billing identity regardless of the provider column, which can be stale
  // 'stripe' after a checkout.session.completed write.
  const hasBillingIdentity =
    (Boolean(business.stripe_customer_id) && Boolean(business.stripe_subscription_id)) ||
    Boolean(business.google_play_purchase_token) ||
    Boolean(business.apple_original_transaction_id)
  return (
    hasAccess &&
    hasNumber &&
    hasBillingIdentity &&
    !isForwardingComplete(business) &&
    !isSetupComplete(business)
  );
}

/**
 * Authoritative derived setup state function
 * This is the single source of truth for determining setup routing
 * Always check subscription status first before allowing any setup routing
 *
 * @param business - The business object
 * @param leadCount - Optional: number of leads captured (used to verify test call completion)
 */
export function deriveSetupState(business: Business | null | undefined, leadCount: number = 0): SetupState {
  // If no business data, assume loading
  if (!business) {
    logRouteFlashDebug({
      source: 'deriveSetupState',
      derivedSetupState: 'loading',
      renderBranch: 'loading',
      reason: 'no business data provided',
    })
    return 'loading'
  }

  // REMOVED: Do not trust onboarding_status === 'completed' as the sole indicator
  // This was causing issues where accounts with active subscription but no actual
  // setup completion were being marked as complete. Always verify actual operational state.

  const hasManualAccess = hasActiveManualAccess(business)

  // Check if subscription is active - this is the FIRST check
  if (!hasActiveAccess(business)) {
    logRouteFlashDebug({
      source: 'deriveSetupState',
      subscriptionStatus: business?.subscription_status,
      derivedSetupState: 'needs_trial',
      renderBranch: 'setup',
      reason: 'no active subscription/manual access',
    })
    return 'needs_trial'
  }

  // Check if provisioning is in progress or number not ready
  const isProvisioning = business.provisioning_status === 'pending' || business.provisioning_status === 'provisioning'
  const hasNumber = Boolean(business.twilio_phone_number)
  const isMessagingReady = business.messaging_status === 'active' || business.a2p_status === 'verified' || business.a2p_status === 'approved'

  if (isProvisioning || !hasNumber) {
    logRouteFlashDebug({
      source: 'deriveSetupState',
      subscriptionStatus: business?.subscription_status,
      derivedSetupState: 'provisioning_or_number_pending',
      renderBranch: 'setup',
      reason: `isProvisioning=${isProvisioning}, hasNumber=${hasNumber}`,
    })
    return 'provisioning_or_number_pending'
  }

  // CRITICAL: forwarding_verified is the definitive source of truth.
  // If forwarding has been verified, forwarding IS complete regardless of
  // transient call_forwarding_enabled or phone_setup_completed_at values.
  const forwardingComplete =
    business.forwarding_verified === true ||
    business.call_forwarding_enabled === true ||
    Boolean(business.phone_setup_completed_at);

  if (!forwardingComplete) {
    logRouteFlashDebug({
      source: 'deriveSetupState',
      subscriptionStatus: business?.subscription_status,
      derivedSetupState: 'needs_forwarding',
      renderBranch: 'setup',
      reason: 'forwarding not complete',
    })
    return 'needs_forwarding'
  }

  // Check if actual test call has been completed
  // Only mark setup as complete if there's evidence of a real missed call/test call
  const hasTestCallCompleted = Boolean(business.first_test_call_completed_at)
  const hasLeadsCaptured = leadCount > 0
  const hasActualActivity = hasTestCallCompleted || hasLeadsCaptured

  // If forwarding is verified but no actual test call has happened, needs final test
  if (!hasActualActivity) {
    logRouteFlashDebug({
      source: 'deriveSetupState',
      subscriptionStatus: business?.subscription_status,
      firstTestCallCompletedAt: business?.first_test_call_completed_at,
      derivedSetupState: 'needs_final_test',
      renderBranch: 'setup',
      reason: 'forwarding verified but no actual test call/leads/SMS activity',
    })
    return 'needs_final_test'
  }

  // Forwarding is verified AND test call completed - setup is complete
  logRouteFlashDebug({
    source: 'deriveSetupState',
    subscriptionStatus: business?.subscription_status,
    firstTestCallCompletedAt: business?.first_test_call_completed_at,
    derivedSetupState: 'complete',
    renderBranch: 'dashboard-content',
    reason: 'all checks passed (active access, number, messaging, forwarding, test call/activity)',
  })

  return 'complete'
}

/**
 * Whether a business should manage its subscription through Google Play.
 *
 * A persisted, unrevoked google_play_purchase_token is stronger evidence of
 * Google Play billing than subscription_provider, which can read stale
 * 'stripe' after a checkout.session.completed write lands on an account that
 * is actually billed by Google Play. In that ambiguous state the Play
 * subscription-management page is the safe destination: it is read-only and
 * shows real GP state, whereas the Stripe portal can mutate/resubscribe
 * billing on the wrong provider.
 */
export function hasGooglePlayBillingEvidence(
  business: Pick<Business, 'subscription_provider' | 'google_play_purchase_token'> & { google_play_revoked_at?: string | null } | null | undefined
): boolean {
  if (!business) return false
  if (business.subscription_provider === 'google_play') return true
  return Boolean(business.google_play_purchase_token) && !business.google_play_revoked_at
}

/**
 * Whether the business's CURRENT billing entitlement is Google Play-managed.
 *
 * Stripe webhook handlers use this to refuse stale Stripe subscription
 * events on a Play-billed business. verifyAndApplyPurchase retains a
 * historical stripe_subscription_id when it applies Google Play billing, so
 * the old Stripe subscription can keep emitting events (updated, deleted,
 * invoice.paid, invoice.payment_failed) that would otherwise overwrite a
 * live Play entitlement — including scheduling Twilio number release.
 *
 * Evidence rules (strongest persisted evidence first):
 * - hasGooglePlayBillingEvidence: subscription_provider='google_play' OR an
 *   unrevoked persisted google_play_purchase_token (the token survives a
 *   stale provider='stripe' label).
 * - Genuine Stripe switch-back escape: a Stripe checkout that completed
 *   AFTER the last authoritative Google Play verification
 *   (checkout_completed_at > google_play_last_verified_at) means Stripe is
 *   now the current provider — Play evidence is stale, not live. When no
 *   Play verification timestamp exists at all, a completed checkout is the
 *   most recent known billing action and likewise wins.
 */
export function isGooglePlayManagedBilling(
  business: Pick<Business, 'subscription_provider' | 'google_play_purchase_token' | 'google_play_revoked_at' | 'google_play_last_verified_at' | 'checkout_completed_at'> | null | undefined
): boolean {
  if (!business || !hasGooglePlayBillingEvidence(business)) return false

  const checkoutAt = business.checkout_completed_at ? Date.parse(business.checkout_completed_at) : NaN
  const gpVerifiedAt = business.google_play_last_verified_at ? Date.parse(business.google_play_last_verified_at) : NaN
  if (!Number.isNaN(checkoutAt) && (Number.isNaN(gpVerifiedAt) || checkoutAt > gpVerifiedAt)) {
    return false
  }
  return true
}

/**
 * Whether a business should manage its subscription through Apple IAP.
 * Mirrors hasGooglePlayBillingEvidence: a persisted, unrevoked
 * apple_original_transaction_id is stronger evidence than a potentially
 * stale subscription_provider label.
 */
export function hasAppleBillingEvidence(
  business: Pick<Business, 'subscription_provider' | 'apple_original_transaction_id'> & { apple_revoked_at?: string | null } | null | undefined
): boolean {
  if (!business) return false
  if (business.subscription_provider === 'apple') return true
  return Boolean(business.apple_original_transaction_id) && !business.apple_revoked_at
}

/**
 * Whether the business's CURRENT billing entitlement is Apple-managed.
 * Mirrors isGooglePlayManagedBilling, including the genuine Stripe
 * switch-back escape hatch (checkout_completed_at after the last Apple
 * verification means Stripe is current again).
 */
export function isAppleManagedBilling(
  business: Pick<Business, 'subscription_provider' | 'apple_original_transaction_id' | 'apple_revoked_at' | 'apple_last_verified_at' | 'checkout_completed_at'> | null | undefined
): boolean {
  if (!business || !hasAppleBillingEvidence(business)) return false

  const checkoutAt = business.checkout_completed_at ? Date.parse(business.checkout_completed_at) : NaN
  const appleVerifiedAt = business.apple_last_verified_at ? Date.parse(business.apple_last_verified_at) : NaN
  if (!Number.isNaN(checkoutAt) && (Number.isNaN(appleVerifiedAt) || checkoutAt > appleVerifiedAt)) {
    return false
  }
  return true
}

/**
 * Whether a business has ANY native app-store billing evidence (Google Play
 * purchase token or Apple originalTransactionId, unrevoked). UI uses this to
 * pick the store-management surface instead of the Stripe portal.
 */
export function hasNativeBillingEvidence(
  business: Pick<Business, 'subscription_provider' | 'google_play_purchase_token' | 'apple_original_transaction_id'> & { google_play_revoked_at?: string | null; apple_revoked_at?: string | null } | null | undefined
): boolean {
  return hasGooglePlayBillingEvidence(business) || hasAppleBillingEvidence(business)
}

/**
 * Whether the business's entitlement is managed by ANY native app-store
 * provider (Google Play or Apple). Stripe/RTDN handlers use this so a stale
 * event from a different provider cannot overwrite a live native-managed
 * entitlement.
 */
export function isNativeManagedBilling(
  business: Pick<Business, 'subscription_provider' | 'google_play_purchase_token' | 'google_play_revoked_at' | 'google_play_last_verified_at' | 'apple_original_transaction_id' | 'apple_revoked_at' | 'apple_last_verified_at' | 'checkout_completed_at'> | null | undefined
): boolean {
  return isGooglePlayManagedBilling(business) || isAppleManagedBilling(business)
}

/**
 * Account-deletion subscription notice — the billing-provider source of truth
 * for the Delete Account warning.
 *
 * businesses.subscription_provider can be stale: a Stripe
 * checkout.session.completed write can leave provider='stripe' on an account
 * that is actually billed through Google Play. A persisted
 * google_play_purchase_token is stronger evidence of Google Play billing.
 *
 * - 'apple'        → warn that deletion does NOT cancel the Apple IAP subscription
 * - 'google_play'  → warn that deletion does NOT cancel the GP subscription
 * - 'stripe'       → deletion cancels the Stripe subscription server-side
 * - 'unknown'      → an active subscription exists but provider is ambiguous;
 *                    never promise automatic cancellation
 * - 'none'         → no active subscription; show no cancellation warning
 */
export type DeletionSubscriptionNotice = 'apple' | 'google_play' | 'stripe' | 'unknown' | 'none'

const DELETION_ACTIVE_SUB_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete']

export function getDeletionSubscriptionNotice(
  business: Pick<Business, 'subscription_status' | 'subscription_provider' | 'stripe_subscription_id' | 'google_play_purchase_token' | 'apple_original_transaction_id'> | null | undefined
): DeletionSubscriptionNotice {
  const statusIsActive = Boolean(
    business?.subscription_status && DELETION_ACTIVE_SUB_STATUSES.includes(business.subscription_status)
  )
  // Trust subscription_status when present; fall back to billing identifiers
  // only when status is unknown so cancelled/expired rows don't warn.
  const hasActiveBillingSubscription = statusIsActive || (
    !business?.subscription_status &&
    Boolean(business?.stripe_subscription_id || business?.google_play_purchase_token || business?.apple_original_transaction_id)
  )
  if (!hasActiveBillingSubscription) return 'none'

  const provider = business?.subscription_provider
  const hasGooglePlayToken = Boolean(business?.google_play_purchase_token)
  const hasAppleId = Boolean(business?.apple_original_transaction_id)
  const hasNativeEvidence = hasGooglePlayToken || hasAppleId
  // Most recent native provider wins the warning copy; both are truthful
  // "does not auto-cancel" notices when only one kind of evidence exists.
  if (provider === 'apple' || (hasAppleId && provider !== 'stripe')) {
    return 'apple'
  }
  if (provider === 'google_play' || (hasGooglePlayToken && provider !== 'stripe')) {
    return 'google_play'
  }
  // provider='stripe' AND a native-provider identifier → ambiguous
  // dual-provider state; never classify as auto-cancellable Stripe.
  // Also require a concrete stripe_subscription_id: the deletion backend only
  // cancels subscriptions with an id, so promising "canceled automatically"
  // without one would be untruthful.
  if (provider === 'stripe' && !hasNativeEvidence && business?.stripe_subscription_id) {
    return 'stripe'
  }
  return 'unknown'
}
