/**
 * Batch 10 — Stripe/Billing/Tap-to-Pay native return hardening contracts.
 *
 * Audit result: the external-return stack already exists (approved-host
 * matching, pending-op reconciliation, dedup windows, AuthGuard grace
 * mode, cancel detection). The one real defect found: deep-link
 * navigation assigned `window.location.pathname = path`, which drops
 * ?query and #hash. Fixed to href.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../../..')
const readSrc = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

const INIT = readSrc('src/capacitor/init.ts')
const ERH = readSrc('src/lib/external-return-handler.ts')
const STRIPE_RETURN = readSrc('src/lib/stripe-return.ts')
const CONNECT_LIB = readSrc('src/lib/stripe-connect.ts')
const CONNECT_API = readSrc('src/app/api/stripe/connect/onboard/route.ts')
const PORTAL_API = readSrc('src/app/api/stripe/create-portal-session/route.ts')
const BILLING = readSrc('src/lib/billing.ts')
const AUTH_GUARD = readSrc('src/components/AuthGuard.tsx')
const SETTINGS = readSrc('src/components/SettingsContent.tsx')

describe('Return URL contracts', () => {
  it('billing portal return_url is HTTPS canonical, same-origin gated', () => {
    expect(PORTAL_API).toContain('return_url: returnUrl')
    expect(PORTAL_API).toContain('returnUrlObj.origin === appUrlObj.origin')
    expect(PORTAL_API).toContain('?billing=returned')
    expect(PORTAL_API).not.toContain('replyflow://')
  })

  it('connect return_url lands on Settings with completion param', () => {
    expect(CONNECT_API).toContain('/dashboard/settings?stripe_onboarding=complete')
  })

  it('connect refresh_url lands on Settings (no sign-out, no dup account)', () => {
    expect(CONNECT_API).toContain('refresh_url: `${baseUrl}/dashboard/settings`')
    expect(CONNECT_API).not.toContain('auth/signin')
  })
})

describe('Return matching — canonical, hostname-scoped', () => {
  it('isStripeReturnUrl covers checkout, portal, setup, connect params', () => {
    expect(STRIPE_RETURN).toContain("checkout') === 'success'")
    expect(STRIPE_RETURN).toContain("'cs_'")
    expect(STRIPE_RETURN).toContain("billing') === 'returned'")
    expect(STRIPE_RETURN).toContain("stripe_onboarding') === 'complete'")
  })

  it('external return handler rejects unapproved hostnames', () => {
    expect(ERH).toContain('APPROVED_EXTERNAL_RETURN_HOSTNAMES')
    expect(ERH).toContain('Rejecting unrecognized hostname')
  })

  it('registered flows map to correct internal destinations', () => {
    expect(ERH).toContain("internalDestination: '/dashboard/settings#payments'")
    expect(ERH).toContain("internalDestination: '/billing/success'")
    // Portal flow lands on settings
    const portal = ERH.slice(ERH.indexOf("name: 'STRIPE_PORTAL'"))
    expect(portal).toContain("internalDestination: '/dashboard/settings'")
  })
})

describe('Native navigation — query/hash preserved', () => {
  it('generic universal-link navigation uses href, not pathname (query preserved)', () => {
    expect(INIT).toContain('window.location.href = path')
    expect(INIT).not.toContain('window.location.pathname = path')
  })

  it('recognized returns navigate via href to clean internal routes', () => {
    expect(ERH).toContain('window.location.href = navigationUrl')
    expect(ERH).toContain("'/dashboard/settings?stripe_onboarding=complete#payments'")
  })
})

describe('Idempotency + race safety', () => {
  it('deep links deduped', () => {
    expect(INIT).toContain('DEEP_LINK_DEDUP_WINDOW_MS')
    expect(INIT).toContain('Duplicate callback ignored')
  })

  it('reconciliation deduped + pending ops expire', () => {
    expect(ERH).toContain('RECONCILIATION_DEDUP_WINDOW_MS')
    expect(ERH).toContain('OPERATION_EXPIRY_MS')
    expect(ERH).toContain('setReconciliationInFlight')
  })

  it('AuthGuard grace mode waits for session before signin redirect', () => {
    expect(AUTH_GUARD).toContain('isBillingReturn')
    expect(AUTH_GUARD).toContain('billing grace timeout')
    expect(AUTH_GUARD).toContain('session_restore_failed')
  })

  it('AuthContext does not treat billing/checkout returns as unauthenticated', () => {
    const auth = readSrc('src/contexts/AuthContext.tsx')
    const redirectEffect = auth.slice(auth.indexOf('const isCheckoutSuccess'))
    expect(redirectEffect).toContain('isCheckoutSuccess')
    expect(redirectEffect).toContain('billingReturned')
  })
})

describe('Cancel / failure behavior', () => {
  it('portal X-close is detected, clears pending op, refreshes on Android', () => {
    expect(BILLING).toContain('result.canceled')
    expect(BILLING).toContain('setPendingStripeOperation(null)')
    expect(BILLING).toContain("billing-refresh-needed")
  })

  it('connect cancel normalizes to friendly copy, no false success', () => {
    expect(CONNECT_LIB).toContain('normalizeStripeConnectError')
    expect(CONNECT_LIB).toContain('Stripe setup wasn’t completed')
  })

  it('browser close on deep link is defensive and failure-safe', () => {
    expect(INIT).toContain('Browser.close()')
    expect(INIT).toContain('already_closed_or_error')
  })

  it('Settings reconciles Connect status on return, owner-only', () => {
    expect(SETTINGS).toContain("stripe_onboarding') === 'complete'")
    expect(SETTINGS).toContain("role === 'owner'")
    expect(SETTINGS).toContain('/api/stripe/connect/refresh')
  })
})
