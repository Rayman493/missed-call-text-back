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
  subscription_status?: string | null;
  twilio_phone_number?: string | null;
  forwarding_enabled?: boolean;
  phone_setup_completed_at?: string | null;
  forwarding_verified?: boolean | null;
  setup_completed_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  messaging_status?: string | null;
  a2p_status?: string | null;
  call_forwarding_enabled?: boolean | null;
  provisioning_status?: string | null;
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
  
  // Check Stripe subscription status
  return ACTIVE_ACCESS_STATUSES.includes(business.subscription_status ?? '');
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
  
  // Stripe accounts require customer and subscription
  return (
    hasAccess &&
    hasNumber &&
    Boolean(business.stripe_customer_id) &&
    Boolean(business.stripe_subscription_id) &&
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
