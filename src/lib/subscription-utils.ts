/**
 * Canonical subscription helper functions
 * Use these throughout the app to ensure consistent subscription logic
 */

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
}

/**
 * Check if business has active access (trialing, active, beta, or comped)
 * This is the canonical way to check subscription eligibility
 * 
 * BETA/COMPED ACCESS: Manual access for test customers without Stripe billing
 * These statuses allow full app access without routing to Stripe checkout
 */
export function hasActiveAccess(business: Business | null | undefined): boolean {
  if (!business) return false;
  
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
  
  return Boolean(
    business.forwarding_enabled && 
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
 */
export function isReadyForForwardingSetup(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  return (
    hasActiveAccess(business) &&
    Boolean(business.twilio_phone_number) &&
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
 */
export function deriveSetupState(business: Business | null | undefined): SetupState {
  console.log('[deriveSetupState] Calculating setup state:', {
    businessId: business?.stripe_customer_id,
    subscription_status: business?.subscription_status,
    twilio_phone_number: business?.twilio_phone_number,
    forwarding_verified: business?.forwarding_verified,
    provisioning_status: business?.provisioning_status,
    messaging_status: business?.messaging_status,
    a2p_status: business?.a2p_status,
  })

  // If no business data, assume loading
  if (!business) {
    console.log('[deriveSetupState] No business data - returning loading')
    return 'loading'
  }

  // Check if subscription is active - this is the FIRST check
  if (!hasActiveAccess(business)) {
    console.log('[deriveSetupState] No active subscription - returning needs_trial')
    return 'needs_trial'
  }

  // Check if provisioning is in progress or number not ready
  const isProvisioning = business.provisioning_status === 'pending' || business.provisioning_status === 'provisioning'
  const hasNumber = Boolean(business.twilio_phone_number)
  const isMessagingReady = business.messaging_status === 'active' || business.a2p_status === 'verified' || business.a2p_status === 'approved'

  if (isProvisioning || !hasNumber || !isMessagingReady) {
    console.log('[deriveSetupState] Provisioning or number pending - returning provisioning_or_number_pending')
    return 'provisioning_or_number_pending'
  }

  // Check if forwarding is verified
  if (!business.forwarding_verified) {
    console.log('[deriveSetupState] Forwarding not verified - returning needs_forwarding')
    return 'needs_forwarding'
  }

  // Check if final test is needed
  // For now, if forwarding is verified, we consider it complete
  console.log('[deriveSetupState] All checks passed - returning complete')
  return 'complete'
}
