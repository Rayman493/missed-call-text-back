/**
 * Canonical subscription helper functions
 * Use these throughout the app to ensure consistent subscription logic
 */

import { hasActiveManualAccess } from './manual-access';

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
    console.log('[hasActiveAccess] Access granted via manual access', {
      manualAccessEnabled: business.manual_access_enabled,
      manualAccessExpiresAt: business.manual_access_expires_at
    })
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
  if (!business) return false;
  
  const hasAccess = hasActiveAccess(business)
  const hasManualAccess = hasActiveManualAccess(business)
  const hasNumber = Boolean(business.twilio_phone_number)
  
  // Manual access accounts don't require Stripe customer/subscription for forwarding setup
  if (hasManualAccess) {
    console.log('[isReadyForForwardingSetup] Manual access - eligible for forwarding setup without Stripe', {
      hasAccess,
      hasManualAccess,
      hasNumber,
      forwardingComplete: isForwardingComplete(business),
      setupComplete: isSetupComplete(business)
    })
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
    manual_access_enabled: business?.manual_access_enabled,
    manual_access_expires_at: business?.manual_access_expires_at
  })

  // If no business data, assume loading
  if (!business) {
    console.log('[deriveSetupState] No business data - returning loading')
    return 'loading'
  }

  const hasManualAccess = hasActiveManualAccess(business)
  if (hasManualAccess) {
    console.log('[MANUAL ACCESS] Setup eligible - manual access is active', {
      manualAccessEnabled: business.manual_access_enabled,
      manualAccessExpiresAt: business.manual_access_expires_at
    })
  }

  // Check if subscription is active - this is the FIRST check
  if (!hasActiveAccess(business)) {
    console.log('[deriveSetupState] No active subscription - returning needs_trial')
    return 'needs_trial'
  }

  // Check if provisioning is in progress or number not ready
  const isProvisioning = business.provisioning_status === 'pending' || business.provisioning_status === 'provisioning'
  const isProvisioned = business.provisioning_status === 'ready' || business.provisioning_status === 'purchased'
  const hasNumber = Boolean(business.twilio_phone_number)
  const isMessagingReady = business.messaging_status === 'active' || business.a2p_status === 'verified' || business.a2p_status === 'approved'

  if (isProvisioning || !hasNumber) {
    console.log('[deriveSetupState] Provisioning or number pending - returning provisioning_or_number_pending')
    return 'provisioning_or_number_pending'
  }

  if (isProvisioned) {
    console.log('[deriveSetupState] Number provisioned - checking forwarding status')
  }

  // CRITICAL: forwarding_verified is the definitive source of truth.
  // If forwarding has been verified, forwarding IS complete regardless of
  // transient call_forwarding_enabled or phone_setup_completed_at values.
  const forwardingComplete =
    business.forwarding_verified === true ||
    business.call_forwarding_enabled === true ||
    Boolean(business.phone_setup_completed_at);

  console.log('[deriveSetupState] Forwarding check:', {
    forwardingComplete,
    forwarding_verified: business.forwarding_verified,
    call_forwarding_enabled: business.call_forwarding_enabled,
    phone_setup_completed_at: business.phone_setup_completed_at
  })

  if (!forwardingComplete) {
    console.log('[deriveSetupState] Forwarding not enabled - returning needs_forwarding')
    return 'needs_forwarding'
  }

  // If forwarding is complete but not yet verified, needs final test
  if (business.call_forwarding_enabled && !business.forwarding_verified) {
    console.log('[deriveSetupState] Forwarding enabled but not verified - returning needs_final_test')
    return 'needs_final_test'
  }

  // Forwarding is verified - setup is complete
  console.log('[deriveSetupState] All checks passed - returning complete')
  return 'complete'
}
