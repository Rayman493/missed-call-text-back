import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { hasGooglePlayBillingEvidence } from '@/lib/subscription-utils'
import { hasValidSubscription, hasInvalidTrialState } from '@/lib/subscription'
import { mapPlayEntitlement, SUBSCRIPTION_STATE } from '@/lib/google-play/billing-service'

/**
 * Regression: subscription_provider can read stale 'stripe' on a
 * Google-Play-billed account (checkout.session.completed writes it without a
 * Google-Play guard). Any code that keys management routing or billing
 * identity off that column alone can send a Play-billed user into Stripe
 * portal/checkout — the wrong provider. A persisted, unrevoked
 * google_play_purchase_token is the stronger evidence.
 */

const srcRoot = path.resolve(__dirname, '..', '..')

describe('hasGooglePlayBillingEvidence', () => {
  it('routes by provider label when google_play', () => {
    expect(hasGooglePlayBillingEvidence({ subscription_provider: 'google_play' })).toBe(true)
  })

  it('routes to Play when provider is stale stripe but a live GP token exists', () => {
    expect(
      hasGooglePlayBillingEvidence({
        subscription_provider: 'stripe',
        google_play_purchase_token: 'tok',
        google_play_revoked_at: null,
      })
    ).toBe(true)
  })

  it('routes to Play for unlabeled provider with live token', () => {
    expect(hasGooglePlayBillingEvidence({ subscription_provider: null, google_play_purchase_token: 'tok' })).toBe(true)
  })

  it('does NOT treat a revoked token as live evidence (legit Stripe switch-back)', () => {
    expect(
      hasGooglePlayBillingEvidence({
        subscription_provider: 'stripe',
        google_play_purchase_token: 'tok',
        google_play_revoked_at: '2026-01-01T00:00:00Z',
      })
    ).toBe(false)
  })

  it('plain Stripe account without GP evidence stays Stripe', () => {
    expect(hasGooglePlayBillingEvidence({ subscription_provider: 'stripe' })).toBe(false)
  })

  it('null business → false', () => {
    expect(hasGooglePlayBillingEvidence(null)).toBe(false)
    expect(hasGooglePlayBillingEvidence(undefined)).toBe(false)
  })
})

describe('billing.ts source wiring', () => {
  const billingSrc = fs.readFileSync(path.join(srcRoot, 'lib', 'billing.ts'), 'utf8')

  it('fetches google_play_purchase_token + google_play_revoked_at', () => {
    expect(billingSrc).toContain('google_play_purchase_token')
    expect(billingSrc).toContain('google_play_revoked_at')
  })

  it('uses hasGooglePlayBillingEvidence for the Play-management branch', () => {
    expect(billingSrc).toContain('if (hasGooglePlayBillingEvidence(business))')
  })

  it('no longer trusts the provider column alone for Play routing', () => {
    expect(billingSrc).not.toMatch(/if \(business\?\.subscription_provider === 'google_play'\)/)
  })

  it('keeps the Android new-purchase Play Billing guard intact', () => {
    expect(billingSrc).toContain("isNativeAndroid() && !(business?.subscription_provider === 'stripe' && hasExistingSubscription)")
  })
})

describe('subscription identity helpers under ambiguous provider', () => {
  it('hasValidSubscription: stale stripe provider + token + no stripe ids → valid', () => {
    expect(
      hasValidSubscription('active', undefined, undefined, {
        subscriptionProvider: 'stripe',
        googlePlayPurchaseToken: 'tok',
      })
    ).toBe(true)
  })

  it('hasValidSubscription: confirmed stripe still requires stripe ids', () => {
    expect(
      hasValidSubscription('active', undefined, undefined, { subscriptionProvider: 'stripe' })
    ).toBe(false)
    expect(
      hasValidSubscription('active', 'cus_1', 'sub_1', { subscriptionProvider: 'stripe' })
    ).toBe(true)
  })

  it('hasInvalidTrialState: stale stripe provider + token is not "missing ids"', () => {
    expect(
      hasInvalidTrialState('trialing', undefined, undefined, {
        subscriptionProvider: 'stripe',
        googlePlayPurchaseToken: 'tok',
      })
    ).toBe(false)
  })
})

describe('RTDN stale-provider guard', () => {
  const routeSrc = fs.readFileSync(
    path.join(srcRoot, 'app', 'api', 'google-play', 'rtdn', 'route.ts'),
    'utf8'
  )

  it('still short-circuits on the stripe label check', () => {
    expect(routeSrc).toContain("business.subscription_provider === 'stripe'")
  })

  it('selects google_play_revoked_at for the definitive-dead fast path', () => {
    expect(routeSrc).toContain('google_play_revoked_at')
    expect(routeSrc).toContain('stripe_provider_gp_revoked')
  })

  it('verifies ambiguous state against Google before deciding', () => {
    expect(routeSrc).toContain('fetchSubscription(subNotif.purchaseToken)')
    expect(routeSrc).toContain('mapPlayEntitlement(sub, { isTrial: false })')
    expect(routeSrc).toContain('stripe_provider_gp_dead')
  })

  it('does not blindly trust or blindly skip the stripe label', () => {
    // The old unconditional skip returned skipped:'stripe_provider' without
    // ever consulting Google; the new gate only skips after evidence.
    expect(routeSrc).toContain('shouldProcess')
    expect(routeSrc).not.toContain("skipped: 'stripe_provider' })")
  })

  // The liveness predicate the route uses: mapped status that grants or
  // preserves access (not null, not 'canceled').
  const live = (state: number, expiryTime?: string) => {
    const mapped = mapPlayEntitlement(
      { subscriptionState: state, lineItems: [{ expiryTime }] },
      { isTrial: false }
    )
    return Boolean(mapped.status && mapped.status !== 'canceled')
  }

  it('live GP states pass the gate (stale-stripe events get processed)', () => {
    const future = '2099-01-01T00:00:00Z'
    expect(live(SUBSCRIPTION_STATE.ACTIVE, future)).toBe(true)
    expect(live(SUBSCRIPTION_STATE.IN_GRACE_PERIOD, future)).toBe(true)
    expect(live(SUBSCRIPTION_STATE.CANCELED, future)).toBe(true) // still in paid window
    expect(live(SUBSCRIPTION_STATE.PAUSED, future)).toBe(true)
    expect(live(SUBSCRIPTION_STATE.ON_HOLD, future)).toBe(true)
  })

  it('dead GP states fail the gate (genuine Stripe sub untouched)', () => {
    const past = '2020-01-01T00:00:00Z'
    const future = '2099-01-01T00:00:00Z'
    expect(live(SUBSCRIPTION_STATE.EXPIRED, past)).toBe(false)
    expect(live(SUBSCRIPTION_STATE.CANCELED, past)).toBe(false) // terminal
    expect(live(SUBSCRIPTION_STATE.PENDING, future)).toBe(false)
    expect(live(SUBSCRIPTION_STATE.UNSPECIFIED, future)).toBe(false)
  })
})

describe('verifyAndApplyPurchase double-billing guard under stale provider', () => {
  const svcSrc = fs.readFileSync(
    path.join(srcRoot, 'lib', 'google-play', 'billing-service.ts'),
    'utf8'
  )

  it('still guards Stripe-labeled businesses', () => {
    expect(svcSrc).toContain("business.subscription_provider === 'stripe'")
    expect(svcSrc).toContain('alreadyOwned')
  })

  it('consults the freshly fetched Play subscription before honoring the guard', () => {
    // Without this, a stale 'stripe' label would swallow live GP events:
    // the route gate could pass but the service guard would still no-op.
    expect(svcSrc).toContain('mapPlayEntitlement(sub, { isTrial: false, revoked: args.forceRevoked })')
    expect(svcSrc).toContain('gpStillLive')
  })

  it('a REVOKED event can never overwrite Stripe (revoked maps to canceled → not live)', () => {
    const mapped = mapPlayEntitlement(
      { subscriptionState: SUBSCRIPTION_STATE.ACTIVE, lineItems: [{ expiryTime: '2099-01-01T00:00:00Z' }] },
      { isTrial: false, revoked: true }
    )
    expect(mapped.status).toBe('canceled')
    // → guardMapped 'canceled' → !gpStillLive → early return, Stripe untouched
  })
})

describe('UI consumers use the shared evidence helper', () => {
  const settingsSrc = fs.readFileSync(
    path.join(srcRoot, 'components', 'SettingsContent.tsx'),
    'utf8'
  )
  const cardSrc = fs.readFileSync(
    path.join(srcRoot, 'components', 'SetupStatusCard.tsx'),
    'utf8'
  )

  it('SettingsContent management label/guidance use hasGooglePlayBillingEvidence', () => {
    const occurrences = settingsSrc.split('hasGooglePlayBillingEvidence(business)').length - 1
    // label ternary + Android guidance ternary
    expect(occurrences).toBeGreaterThanOrEqual(2)
    expect(settingsSrc).not.toContain("business?.subscription_provider === 'google_play' ? 'Manage Subscription'")
  })

  it('SetupStatusCard portal/Play branch uses hasGooglePlayBillingEvidence', () => {
    expect(cardSrc).toContain('if (hasGooglePlayBillingEvidence(business))')
  })
})
