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

  // Check if forwarding is operationally verified
  if (hasMissedCalls) {
    return {
      verified: true,
      reason: 'Missed calls successfully detected',
      metrics: verificationMetrics
    }
  }

  if (hasLeads) {
    return {
      verified: true,
      reason: 'Leads created from missed calls',
      metrics: verificationMetrics
    }
  }

  if (hasSuccessfulSms) {
    return {
      verified: true,
      reason: 'SMS responses sent successfully',
      metrics: verificationMetrics
    }
  }

  if (hasSuccessfulTest) {
    return {
      verified: true,
      reason: 'Forwarding test completed successfully',
      metrics: verificationMetrics
    }
  }

  if (hasExplicitFlag) {
    return {
      verified: true,
      reason: 'Forwarding verified',
      metrics: verificationMetrics
    }
  }

  // No verification evidence yet
  return {
    verified: false,
    reason: 'Waiting for first missed-call test',
    metrics: verificationMetrics
  }
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
