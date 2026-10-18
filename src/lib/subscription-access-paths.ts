/**
 * Subscription access path classification.
 *
 * Single source of truth for which routes are exempt from the subscription
 * gate. Used by middleware (API gate) and the dashboard layout (UI gate).
 * Keep this module dependency-light: it is imported by middleware, client
 * components, and tests.
 */

import { hasActiveAccess } from './subscription-utils'

/**
 * API path prefixes that must remain reachable WITHOUT an active subscription.
 * Everything else under /api is subscription-gated by default (fail closed).
 *
 * Categories:
 * - auth/account/billing recovery (user must be able to restore payment)
 * - business profile & provisioning (account management during recovery/setup)
 * - webhooks, callbacks, cron, and internal-secret endpoints (server-to-server)
 * - public customer-facing endpoints (token/slug-scoped)
 * - platform infra (admin, health, diagnostics, test/demo/dev)
 */
export const SUBSCRIPTION_EXEMPT_API_PREFIXES: readonly string[] = [
  // Auth, account, billing recovery
  '/api/auth',
  '/api/account',
  '/api/billing',
  '/api/stripe',
  '/api/apple',
  '/api/google-play',
  '/api/trial',
  '/api/onboarding',
  '/api/offboarding',
  '/api/send-offboarding-email',
  // Business profile, provisioning, team & device management
  '/api/business',
  '/api/team',
  '/api/push',
  // Webhooks, callbacks, cron, internal-secret endpoints
  '/api/twilio',
  '/api/cron',
  '/api/process-followups',
  '/api/google/calendar/callback',
  '/api/ai-confirmation-sms',
  '/api/ai-voice',
  // Public customer-facing (token/slug-scoped, no session required)
  '/api/public',
  '/api/booking/public',
  '/api/booking/requests/by-token',
  '/api/payment/lookup',
  '/api/mms-media/serve',
  '/api/geocode',
  '/api/voicemail',
  // Platform infra
  '/api/admin',
  '/api/health',
  '/api/diagnostics',
  '/api/test',
  '/api/demo',
  '/api/dev',
  '/api/beta-feedback',
]

/**
 * Dashboard path prefixes that remain reachable WITHOUT an active subscription.
 * /dashboard itself always stays open: it renders the billing-recovery surface
 * (PaymentIssueBanner -> Stripe portal) and is the redirect target for gated pages.
 * Settings holds the billing section; admin is separately admin-gated.
 */
export const SUBSCRIPTION_EXEMPT_DASHBOARD_PREFIXES: readonly string[] = [
  '/dashboard/settings',
  '/dashboard/admin',
]

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

/** API path exempt from the subscription gate. */
export function isSubscriptionExemptApiPath(pathname: string): boolean {
  return SUBSCRIPTION_EXEMPT_API_PREFIXES.some(p => matchesPrefix(pathname, p))
}

/** Dashboard path exempt from the subscription gate. */
export function isSubscriptionExemptDashboardPath(pathname: string): boolean {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return true
  return SUBSCRIPTION_EXEMPT_DASHBOARD_PREFIXES.some(p => matchesPrefix(pathname, p))
}

export interface DashboardGateInput {
  pathname: string
  /** True once the business fetch has completed (BusinessContext.businessHydrated) */
  businessHydrated: boolean
  business: unknown | null
}

/**
 * True when a dashboard path should be blocked for the given business state.
 * Only blocks on a KNOWN lapsed business: while business is still loading or
 * when no business exists (onboarding flows own that case) this returns false.
 */
export function shouldGateDashboardPath(input: DashboardGateInput): boolean {
  if (isSubscriptionExemptDashboardPath(input.pathname)) return false
  if (!input.businessHydrated || !input.business) return false
  return !hasActiveAccess(input.business as any)
}
