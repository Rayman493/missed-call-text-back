'use client'

import { useMemo } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { formatPhoneNumber } from '@/lib/utils'
import { hasValidSubscription } from '@/lib/subscription'

export type HealthStatus = 'complete' | 'needs_attention' | 'not_configured' | 'optional'

export interface HealthCheck {
  id: string
  name: string
  status: HealthStatus
  description: string
  details?: string
  actionText?: string
  actionUrl?: string
  isOptional?: boolean
}

export function useSetupHealth() {
  const { business } = useBusiness()

  const healthChecks = useMemo((): HealthCheck[] => {
    if (!business) return []

    const checks: HealthCheck[] = []

    // Subscription active
    const subscriptionValid = hasValidSubscription(business.subscription_status, business.stripe_customer_id, business.stripe_subscription_id)
    checks.push({
      id: 'subscription',
      name: business.subscription_status === 'trialing' ? 'Free Trial Active' : 'Subscription Active',
      status: subscriptionValid ? 'complete' : 'not_configured',
      description: subscriptionValid 
        ? (business.subscription_status === 'trialing' ? 'Trial period active' : 'Subscription active')
        : 'Subscription required to activate ReplyFlow',
      details: subscriptionValid ? 'No charge today. Cancel anytime.' : 'Start your 14-day free trial',
      actionText: subscriptionValid ? undefined : 'Start trial',
      actionUrl: '/dashboard',
      isOptional: false
    })

    // Business phone configured
    checks.push({
      id: 'business_phone',
      name: 'Business Phone Configured',
      status: business.business_phone_number ? 'complete' : 'not_configured',
      description: business.business_phone_number 
        ? `Your number: ${formatPhoneNumber(business.business_phone_number)}`
        : 'Add your business phone number',
      actionText: business.business_phone_number ? undefined : 'Configure phone',
      actionUrl: '/dashboard/settings',
      isOptional: false
    })

    // ReplyFlow/Twilio number provisioned
    checks.push({
      id: 'twilio_number',
      name: 'ReplyFlow Number Provisioned',
      status: business.twilio_phone_number ? 'complete' : 'not_configured',
      description: business.twilio_phone_number
        ? `ReplyFlow number: ${formatPhoneNumber(business.twilio_phone_number)}`
        : 'Twilio number not yet provisioned',
      details: business.twilio_phone_number ? 'Line assigned and ready' : 'Number is being prepared',
      actionText: business.twilio_phone_number ? undefined : 'Complete setup',
      actionUrl: '/onboarding/phone-setup',
      isOptional: false
    })

    // SMS sending active
    const smsActive = business.messaging_status === 'verified' || business.a2p_status === 'approved'
    checks.push({
      id: 'sms_sending',
      name: 'SMS Sending Active',
      status: smsActive ? 'complete' : 'needs_attention',
      description: business.messaging_status === 'verified' 
        ? 'Messaging verified' 
        : `Messaging status: ${business.messaging_status || 'pending'}`,
      details: smsActive ? 'Instant reply messages are being sent' : 'Not configured yet',
      actionText: smsActive ? undefined : 'Verify messaging',
      actionUrl: '/onboarding/phone-setup',
      isOptional: false
    })

    // Call forwarding verified - use persistent business.forwarding_verified
    // Once verified, never automatically reverts to false
    const forwardingVerified = business.forwarding_verified === true
    
    checks.push({
      id: 'call_forwarding',
      name: 'Call Forwarding Verified',
      status: forwardingVerified ? 'complete' : 'needs_attention',
      description: forwardingVerified
        ? 'Missed calls are being detected successfully'
        : 'Call forwarding needs verification',
      details: forwardingVerified
        ? 'Forwarding verified and operational'
        : 'Awaiting first successful missed-call test',
      actionText: forwardingVerified ? undefined : 'Verify forwarding',
      actionUrl: '/setup/forwarding',
      isOptional: false
    })

    // Google Calendar connected (optional)
    checks.push({
      id: 'google_calendar',
      name: 'Google Calendar Connected',
      status: (business as any).calendar_connected ? 'complete' : 'optional',
      description: (business as any).calendar_connected
        ? 'Calendar integration active'
        : 'Connect to sync appointments',
      details: (business as any).calendar_connected ? 'Events sync automatically' : 'Optional feature',
      actionText: (business as any).calendar_connected ? undefined : 'Connect calendar',
      actionUrl: '/dashboard/calendar',
      isOptional: true
    })

    // Business hours configured (optional)
    const hasBusinessHours = (business as any).business_hours_start && (business as any).business_hours_end
    checks.push({
      id: 'business_hours',
      name: 'Business Hours Configured',
      status: hasBusinessHours ? 'complete' : 'optional',
      description: hasBusinessHours
        ? `Hours: ${(business as any).business_hours_start} - ${(business as any).business_hours_end}`
        : 'Set your operating hours',
      details: hasBusinessHours ? 'Used for follow-up scheduling' : 'Optional configuration',
      actionText: hasBusinessHours ? undefined : 'Configure hours',
      actionUrl: '/dashboard/settings/follow-ups',
      isOptional: true
    })

    // Follow-ups configured (optional)
    const hasFollowUps = (business as any).follow_up_message && (business as any).follow_up_enabled
    checks.push({
      id: 'follow_ups',
      name: 'Follow-ups Configured',
      status: hasFollowUps ? 'complete' : 'optional',
      description: hasFollowUps
        ? 'Auto-follow-ups enabled'
        : 'Configure automated follow-up messages',
      details: hasFollowUps ? 'Automated messages send on schedule' : 'Optional feature',
      actionText: hasFollowUps ? undefined : 'Configure follow-ups',
      actionUrl: '/dashboard/settings/follow-ups',
      isOptional: true
    })

    return checks
  }, [business])

  const needsAttention = healthChecks.filter(c => c.status === 'needs_attention' || c.status === 'not_configured')
  const requiredIssues = needsAttention.filter(c => !c.isOptional)
  const isHealthy = requiredIssues.length === 0

  return {
    healthChecks,
    needsAttention,
    requiredIssues,
    isHealthy
  }
}
