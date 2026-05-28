import { Business } from './types'

export interface ForwardingVerificationStatus {
  verified: boolean
  reason: string
  metrics?: {
    hasMissedCalls: boolean
    hasLeads: boolean
    hasSuccessfulSms: boolean
    hasExplicitFlag: boolean
    hasSuccessfulTest: boolean
  }
}

export interface ForwardingMetrics {
  missedCallsCount?: number
  leadsCount?: number
  successfulSmsCount?: number
  hasSuccessfulTest?: boolean
}

/**
 * Determines if a business has verified call forwarding based on operational evidence.
 * 
 * A business is considered forwarding verified if ANY of these are true:
 * - At least 1 missed call captured
 * - At least 1 lead created from Twilio voice webhook
 * - At least 1 successful instant response SMS sent
 * - Explicit forwarding_verified flag is true
 * - Successful forwarding test exists
 */
export function getForwardingVerificationStatus(
  business: Business | null,
  metrics?: ForwardingMetrics
): ForwardingVerificationStatus {
  if (!business) {
    return {
      verified: false,
      reason: 'Business not found'
    }
  }

  const hasMissedCalls = (metrics?.missedCallsCount ?? 0) > 0
  const hasLeads = (metrics?.leadsCount ?? 0) > 0
  const hasSuccessfulSms = (metrics?.successfulSmsCount ?? 0) > 0
  const hasExplicitFlag = business.forwarding_verified === true
  const hasSuccessfulTest = metrics?.hasSuccessfulTest === true

  const verificationMetrics = {
    hasMissedCalls,
    hasLeads,
    hasSuccessfulSms,
    hasExplicitFlag,
    hasSuccessfulTest
  }

  const result = {
    verified: hasMissedCalls || hasLeads || hasSuccessfulSms || hasSuccessfulTest || hasExplicitFlag,
    reason: '',
    metrics: verificationMetrics
  }

  // Determine reason based on verification source
  if (hasMissedCalls) {
    result.reason = 'Missed calls successfully detected'
  } else if (hasLeads) {
    result.reason = 'Leads created from missed calls'
  } else if (hasSuccessfulSms) {
    result.reason = 'SMS responses sent successfully'
  } else if (hasSuccessfulTest) {
    result.reason = 'Forwarding test completed successfully'
  } else if (hasExplicitFlag) {
    result.reason = 'Forwarding verified'
  } else {
    result.reason = 'Waiting for first missed-call test'
  }

  console.log('[FORWARDING CHECK]', {
    businessId: business.id,
    leadsCount: metrics?.leadsCount ?? 0,
    missedCalls: metrics?.missedCallsCount ?? 0,
    smsSent: metrics?.successfulSmsCount ?? 0,
    forwardingVerified: business.forwarding_verified,
    result
  })

  return result
}

/**
 * Returns user-facing messaging for forwarding status
 */
export function getForwardingStatusMessage(status: ForwardingVerificationStatus): {
  title: string
  description: string
  severity: 'success' | 'warning' | 'info'
} {
  if (status.verified) {
    return {
      title: 'Forwarding operational',
      description: status.reason,
      severity: 'success'
    }
  }

  return {
    title: 'Forwarding setup pending',
    description: status.reason,
    severity: 'warning'
  }
}
