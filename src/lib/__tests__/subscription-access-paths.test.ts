import { describe, it, expect } from 'vitest'
import {
  isSubscriptionExemptApiPath,
  isSubscriptionExemptDashboardPath,
  shouldGateDashboardPath,
  SUBSCRIPTION_EXEMPT_API_PREFIXES,
} from '../subscription-access-paths'

describe('isSubscriptionExemptApiPath — exempt (must stay reachable without active subscription)', () => {
  const exemptPaths = [
    // Auth, account, billing recovery
    '/api/auth/complete-signup',
    '/api/auth/abandon-signup',
    '/api/account/delete',
    '/api/account/cancel-email-change',
    '/api/billing/checkout-status',
    '/api/billing/refresh-subscription',
    '/api/stripe/webhook',
    '/api/stripe/create-checkout-session',
    '/api/stripe/create-portal-session',
    '/api/stripe/checkout-status',
    '/api/stripe/connect/onboard',
    '/api/apple/verify-transaction',
    '/api/apple/assn',
    '/api/google-play/rtdn',
    '/api/google-play/verify-purchase',
    '/api/trial/check-eligibility',
    '/api/onboarding/carrier',
    '/api/onboarding/confirm-forwarding-instructions',
    '/api/offboarding/confirm',
    '/api/offboarding/create',
    '/api/send-offboarding-email',
    // Business profile, provisioning, team, devices
    '/api/business/get-or-create',
    '/api/business/provision-number',
    '/api/business/retry-provisioning',
    '/api/business/update-address',
    '/api/business/notification-preferences',
    '/api/team/invite',
    '/api/team/members',
    '/api/team/members/abc-123',
    '/api/push/register-device',
    // Webhooks, callbacks, cron, internal-secret
    '/api/twilio/voice',
    '/api/twilio/incoming-sms',
    '/api/twilio/status',
    '/api/cron/send-followups',
    '/api/cron/process-followup-jobs',
    '/api/process-followups',
    '/api/google/calendar/callback',
    '/api/ai-confirmation-sms',
    '/api/ai-voice/summary-message',
    // Public customer-facing (token/slug-scoped)
    '/api/public/document/tok_123',
    '/api/public/document/tok_123/respond',
    '/api/booking/public/joes-plumbing',
    '/api/booking/public/joes-plumbing/availability',
    '/api/booking/requests/by-token/tok_abc',
    '/api/booking/requests/by-token/tok_abc/accept',
    '/api/payment/lookup/tok_xyz',
    '/api/mms-media/serve',
    '/api/geocode',
    '/api/geocode/address',
    '/api/voicemail/rec_123',
    // Platform infra
    '/api/admin/metrics',
    '/api/admin/support-action',
    '/api/health',
    '/api/health/deep',
    '/api/diagnostics/ttp-retry-stage',
    '/api/test/send-sms',
    '/api/demo/send-text',
    '/api/dev/simulate-inbound-sms',
    '/api/beta-feedback',
  ]

  it.each(exemptPaths)('allows %s', (path) => {
    expect(isSubscriptionExemptApiPath(path)).toBe(true)
  })
})

describe('isSubscriptionExemptApiPath — protected (subscription-gated by default)', () => {
  const protectedPaths = [
    '/api/leads',
    '/api/leads/lead_123',
    '/api/leads/lead_123/status',
    '/api/leads/lead_123/summary',
    '/api/leads/lead_123/follow-ups/job_1',
    '/api/leads/lead_123/follow-ups/pause-all',
    '/api/leads/manual-create',
    '/api/lead-details',
    '/api/jobs/job_1/geocode',
    '/api/jobs/job_1/send-confirmation',
    '/api/jobs/time-summary',
    '/api/tasks',
    '/api/tasks/task_1',
    '/api/payments',
    '/api/payments/create',
    '/api/payments/pay_1/mark-paid',
    '/api/payments/pay_1/cancel',
    '/api/payments/reconcile',
    '/api/payments/send-receipt',
    '/api/notifications',
    '/api/notifications/create',
    '/api/notifications/notif_1/mark-read',
    '/api/notifications/mark-all-read',
    '/api/meetings/recent',
    '/api/meetings/evt_1',
    '/api/meetings/evt_1/transcript',
    '/api/meetings/evt_1/complete',
    '/api/personal-voicemails',
    '/api/personal-voicemails/vm_1/audio',
    '/api/ignored-contacts',
    '/api/ignored-contacts/ic_1',
    '/api/ignored-contacts/import/execute',
    '/api/follow-ups/create-jobs',
    '/api/booking/requests',
    '/api/booking/requests/req_1',
    '/api/booking/requests/req_1/action',
    '/api/booking/settings',
    '/api/booking/exceptions',
    '/api/google/calendar/connect',
    '/api/google/calendar/disconnect',
    '/api/google/calendar/events/evt_1',
    '/api/terminal/connection-token',
    '/api/terminal/payment-intent',
    '/api/terminal/location',
    '/api/send-sms',
    '/api/settings/follow-ups',
    '/api/smart-filtering',
    '/api/message-media',
    '/api/mms-media/recover-url',
    '/api/billing-documents',
    '/api/business-phone/record',
  ]

  it.each(protectedPaths)('gates %s', (path) => {
    expect(isSubscriptionExemptApiPath(path)).toBe(false)
  })

  it('prefix-boundary: /api/payment/lookup exempt does not free /api/payments', () => {
    expect(isSubscriptionExemptApiPath('/api/payment/lookup/abc')).toBe(true)
    expect(isSubscriptionExemptApiPath('/api/payments')).toBe(false)
  })

  it('prefix-boundary: by-token exempt does not free owner booking endpoints', () => {
    expect(isSubscriptionExemptApiPath('/api/booking/requests/by-token/t')).toBe(true)
    expect(isSubscriptionExemptApiPath('/api/booking/requests')).toBe(false)
    expect(isSubscriptionExemptApiPath('/api/booking/requests/req_9')).toBe(false)
  })

  it('prefix-boundary: calendar callback exempt, other calendar ops gated', () => {
    expect(isSubscriptionExemptApiPath('/api/google/calendar/callback')).toBe(true)
    expect(isSubscriptionExemptApiPath('/api/google/calendar/connect')).toBe(false)
    expect(isSubscriptionExemptApiPath('/api/google/calendar/events/e1')).toBe(false)
  })

  it('no exempt prefix accidentally matches a bare different segment', () => {
    for (const prefix of SUBSCRIPTION_EXEMPT_API_PREFIXES) {
      expect(isSubscriptionExemptApiPath(prefix)).toBe(true)
      expect(isSubscriptionExemptApiPath(prefix + '-suffix')).toBe(false)
    }
  })
})

describe('isSubscriptionExemptDashboardPath', () => {
  it('keeps billing-recovery surfaces reachable', () => {
    expect(isSubscriptionExemptDashboardPath('/dashboard')).toBe(true)
    expect(isSubscriptionExemptDashboardPath('/dashboard/')).toBe(true)
    expect(isSubscriptionExemptDashboardPath('/dashboard/settings')).toBe(true)
    expect(isSubscriptionExemptDashboardPath('/dashboard/settings/billing')).toBe(true)
    expect(isSubscriptionExemptDashboardPath('/dashboard/admin')).toBe(true)
    expect(isSubscriptionExemptDashboardPath('/dashboard/admin/diagnostics')).toBe(true)
  })

  it('gates paid-feature dashboard pages', () => {
    for (const path of [
      '/dashboard/leads',
      '/dashboard/leads/lead_1',
      '/dashboard/calendar',
      '/dashboard/notifications',
      '/dashboard/payments',
      '/dashboard/personal-voicemail',
      '/dashboard/test-setup',
    ]) {
      expect(isSubscriptionExemptDashboardPath(path)).toBe(false)
    }
  })
})

describe('shouldGateDashboardPath — entitlement matrix', () => {
  const gatedPath = '/dashboard/leads'

  const cases: Array<[string, object | null, boolean]> = [
    // [business shape, expected gated]
    ['active', { subscription_status: 'active' }, false],
    ['trialing (valid trial)', { subscription_status: 'trialing' }, false],
    ['beta override', { subscription_status: 'beta' }, false],
    ['comped override', { subscription_status: 'comped' }, false],
    ['manual access (no expiry)', { subscription_status: 'canceled', manual_access_enabled: true }, false],
    [
      'manual access (future expiry)',
      { subscription_status: 'canceled', manual_access_enabled: true, manual_access_expires_at: new Date(Date.now() + 86400_000).toISOString() },
      false,
    ],
    [
      'canceled but paid-through (active + cancel_at_period_end + future end)',
      { subscription_status: 'active', cancel_at_period_end: true, current_period_end: new Date(Date.now() + 86400_000).toISOString() },
      false,
    ],
    ['canceled (expired)', { subscription_status: 'canceled' }, true],
    ['past_due', { subscription_status: 'past_due' }, true],
    ['unpaid', { subscription_status: 'unpaid' }, true],
    ['no_subscription', { subscription_status: 'no_subscription' }, true],
    ['missing status', { subscription_status: null }, true],
    [
      'expired trial (status still trialing, trial_ends_at passed)',
      { subscription_status: 'trialing', trial_ends_at: new Date(Date.now() - 1000).toISOString() },
      true,
    ],
    [
      'expired period (status still active, current_period_end passed)',
      { subscription_status: 'active', current_period_end: new Date(Date.now() - 1000).toISOString() },
      true,
    ],
    [
      'expired manual access',
      { subscription_status: 'canceled', manual_access_enabled: true, manual_access_expires_at: new Date(Date.now() - 1000).toISOString() },
      true,
    ],
    [
      'future trial end stays allowed',
      { subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + 86400_000).toISOString() },
      false,
    ],
    [
      'future period end stays allowed',
      { subscription_status: 'active', current_period_end: new Date(Date.now() + 86400_000).toISOString() },
      false,
    ],
  ]

  it.each(cases)('status=%s → gated=%s', (_label, business, expected) => {
    expect(
      shouldGateDashboardPath({ pathname: gatedPath, businessHydrated: true, business })
    ).toBe(expected)
  })

  it('does not gate while business is still loading (no flash-redirect)', () => {
    expect(
      shouldGateDashboardPath({ pathname: gatedPath, businessHydrated: false, business: { subscription_status: 'canceled' } })
    ).toBe(false)
  })

  it('does not gate when no business exists (onboarding flow owns that case)', () => {
    expect(
      shouldGateDashboardPath({ pathname: gatedPath, businessHydrated: true, business: null })
    ).toBe(false)
  })

  it('billing-recovery paths are never gated, even when lapsed', () => {
    for (const path of ['/dashboard', '/dashboard/settings', '/dashboard/admin']) {
      expect(
        shouldGateDashboardPath({
          pathname: path,
          businessHydrated: true,
          business: { subscription_status: 'past_due' },
        })
      ).toBe(false)
    }
  })
})
