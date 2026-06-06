// Centralized manual access override logic

import { Business } from './types'

export interface ManualAccessStatus {
  hasManualAccess: boolean
  isExpired: boolean
  expiresAt: string | null
  reason: string | null
  note: string | null
  grantedAt: string | null
  grantedBy: string | null
}

/**
 * Check if a business has active manual access override
 * 
 * Returns true if:
 * - manual_access_enabled is true
 * - AND (manual_access_expires_at is NULL OR manual_access_expires_at > now())
 */
export function hasActiveManualAccess(business: Business | null): boolean {
  if (!business) {
    return false
  }

  // Manual access must be explicitly enabled
  if (!business.manual_access_enabled) {
    return false
  }

  // If no expiration date, access is lifetime/indefinite
  if (!business.manual_access_expires_at) {
    console.log('[MANUAL ACCESS] Access allowed (lifetime)', {
      businessId: business.id,
      reason: business.manual_access_reason,
      note: business.manual_access_note
    })
    return true
  }

  // Check if expiration is in the future
  const now = new Date()
  const expiresAt = new Date(business.manual_access_expires_at)

  if (expiresAt > now) {
    console.log('[MANUAL ACCESS] Access allowed (until date)', {
      businessId: business.id,
      expiresAt: business.manual_access_expires_at,
      reason: business.manual_access_reason
    })
    return true
  }

  console.log('[MANUAL ACCESS] Access expired', {
    businessId: business.id,
    expiresAt: business.manual_access_expires_at,
    now: now.toISOString()
  })

  return false
}

/**
 * Get detailed manual access status
 */
export function getManualAccessStatus(business: Business | null): ManualAccessStatus {
  if (!business) {
    return {
      hasManualAccess: false,
      isExpired: false,
      expiresAt: null,
      reason: null,
      note: null,
      grantedAt: null,
      grantedBy: null
    }
  }

  const hasManualAccess = hasActiveManualAccess(business)
  const isExpired = business.manual_access_enabled && business.manual_access_expires_at
    ? new Date(business.manual_access_expires_at) <= new Date()
    : false

  return {
    hasManualAccess,
    isExpired,
    expiresAt: business.manual_access_expires_at || null,
    reason: business.manual_access_reason || null,
    note: business.manual_access_note || null,
    grantedAt: business.manual_access_granted_at || null,
    grantedBy: business.manual_access_granted_by || null
  }
}

/**
 * Check if business has billing access (either Stripe or manual)
 * This is the main access check function that should be used across the app
 */
export function hasBillingAccess(business: Business | null): boolean {
  if (!business) {
    return false
  }

  // Check manual access first
  if (hasActiveManualAccess(business)) {
    return true
  }

  // Check Stripe subscription status
  const hasActiveSubscription = business.subscription_status === 'active' || business.subscription_status === 'trialing'

  if (hasActiveSubscription) {
    return true
  }

  return false
}

/**
 * Get human-readable manual access status text
 */
export function getManualAccessStatusText(business: Business | null): string {
  const status = getManualAccessStatus(business)

  if (!status.hasManualAccess) {
    if (status.isExpired) {
      return 'Expired'
    }
    return 'Disabled'
  }

  if (!status.expiresAt) {
    return 'Lifetime'
  }

  const expiresDate = new Date(status.expiresAt)
  return `Until ${expiresDate.toLocaleDateString()}`
}
