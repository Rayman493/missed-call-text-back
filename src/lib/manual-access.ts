// Centralized manual access override logic

import { Business } from './types'

// Partial type for businesses that may or may not have manual access fields
export interface BusinessWithManualAccess {
  id?: string
  manual_access_enabled?: boolean | null
  manual_access_expires_at?: string | null
  manual_access_reason?: string | null
  manual_access_note?: string | null
  manual_access_granted_at?: string | null
  manual_access_granted_by?: string | null
}

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
export function hasActiveManualAccess(business: Business | BusinessWithManualAccess | null): boolean {
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

  // Format date as "June 5, 2026" to avoid timezone confusion
  const expiresDate = new Date(status.expiresAt)
  const formattedDate = expiresDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  return `Until ${formattedDate}`
}

/**
 * Get detailed manual access display information for UI
 */
export function getManualAccessDisplayInfo(business: Business | null): {
  status: 'active' | 'expired' | 'disabled'
  label: string
  description: string | null
  expiresAt: string | null
  isLifetime: boolean
} {
  const status = getManualAccessStatus(business)
  
  if (!business?.manual_access_enabled) {
    return {
      status: 'disabled',
      label: 'Manual Access',
      description: null,
      expiresAt: null,
      isLifetime: false
    }
  }

  if (status.isExpired) {
    const formattedDate = status.expiresAt 
      ? new Date(status.expiresAt).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      : null
    return {
      status: 'expired',
      label: 'Manual Access',
      description: formattedDate ? `Expired ${formattedDate}` : 'Expired',
      expiresAt: status.expiresAt,
      isLifetime: false
    }
  }

  if (!status.expiresAt) {
    return {
      status: 'active',
      label: 'Manual Access',
      description: 'Lifetime access',
      expiresAt: null,
      isLifetime: true
    }
  }

  const formattedDate = new Date(status.expiresAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  return {
    status: 'active',
    label: 'Manual Access',
    description: `Expires ${formattedDate}`,
    expiresAt: status.expiresAt,
    isLifetime: false
  }
}
