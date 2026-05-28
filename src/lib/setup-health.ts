import { Business } from '@/lib/types'

export interface SetupHealthInput {
  business: Business | null
  leads: any[]
  latestLead: any
  metrics?: {
    missedCallsCaptured?: number
  }
  calendarConnected?: boolean
}

export interface SetupIssue {
  id: string
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  actionText?: string
  actionUrl?: string
}

export interface SetupHealth {
  smsActive: boolean
  calendarConnected: boolean
  forwardingVerified: boolean
  completedRequiredCount: number
  totalRequiredCount: number
  isReady: boolean
  needsAttention: SetupIssue[]
}

/**
 * Central setup health function - single source of truth
 * Simple rules that are impossible to contradict
 */
export function getSetupHealth(input: SetupHealthInput): SetupHealth {
  const { business, leads, latestLead, metrics, calendarConnected } = input

  // Rule 1: SMS Active
  const smsActive = Boolean(
    business?.twilio_phone_number || 
    business?.messaging_status === 'active'
  )

  // Rule 2: Calendar Connected (optional)
  const calendarIsConnected = Boolean(calendarConnected)

  // Rule 3: Forwarding Verified - complete if ANY evidence exists
  const forwardingVerified = Boolean(
    business?.forwarding_verified === true ||
    (leads && leads.length > 0) ||
    latestLead ||
    (metrics?.missedCallsCaptured && metrics.missedCallsCaptured > 0)
  )

  // Required checks (SMS + Forwarding)
  const requiredChecks = [
    { id: 'sms', complete: smsActive, name: 'SMS Active' },
    { id: 'forwarding', complete: forwardingVerified, name: 'Forwarding Verified' }
  ]

  const completedRequiredCount = requiredChecks.filter(check => check.complete).length
  const totalRequiredCount = requiredChecks.length
  const isReady = completedRequiredCount === totalRequiredCount

  // Build needs attention list
  const needsAttention: SetupIssue[] = []

  if (!smsActive) {
    needsAttention.push({
      id: 'sms_active',
      title: 'SMS Setup Required',
      description: 'Text messaging needs to be activated',
      priority: 'high',
      actionText: 'Configure SMS',
      actionUrl: '/dashboard/settings'
    })
  }

  if (!forwardingVerified) {
    needsAttention.push({
      id: 'forwarding_verified',
      title: 'Forwarding Not Verified Yet',
      description: 'Run one missed-call test to confirm ReplyFlow is receiving calls',
      priority: 'high',
      actionText: 'Test Forwarding',
      actionUrl: '/dashboard/settings'
    })
  }

  return {
    smsActive,
    calendarConnected: calendarIsConnected,
    forwardingVerified,
    completedRequiredCount,
    totalRequiredCount,
    isReady,
    needsAttention
  }
}
