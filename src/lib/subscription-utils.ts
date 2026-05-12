/**
 * Canonical subscription helper functions
 * Use these throughout the app to ensure consistent subscription logic
 */

export interface Business {
  subscription_status?: string | null;
  twilio_phone_number?: string | null;
  forwarding_enabled?: boolean;
  phone_setup_completed_at?: string | null;
  forwarding_verified?: boolean | null;
  setup_completed_at?: string | null;
}

/**
 * Check if business has active access (trialing or active subscription)
 * This is the canonical way to check subscription eligibility
 */
export function hasActiveAccess(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  return business.subscription_status === 'active' || business.subscription_status === 'trialing';
}

/**
 * Check if business has an active trial specifically
 */
export function hasActiveTrial(business: Business | null | undefined): boolean {
  if (!business) return false;
  
  return business.subscription_status === 'trialing';
}

/**
 * Check if business has an active subscription specifically
 */
export function hasActiveSubscription(business: Business | null | undefined): boolean {
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
    !isForwardingComplete(business) &&
    !isSetupComplete(business)
  );
}
