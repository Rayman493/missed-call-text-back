/**
 * Batch 1 — subscription correctness regression coverage.
 *
 * F3: hasBillingAccess unified with canonical hasActiveAccess semantics
 *     (manual access OR {active, trialing, beta, comped} + expiry bounds).
 *     Exercised as a real function — consumers: BusinessGuard, both
 *     follow-up crons, follow-up job route, native billing services.
 * F2: create-checkout-session refuses Stripe checkout when the current
 *     entitlement is native-managed (evidence-based, not label-based),
 *     while preserving the canceled-native → Stripe migration path.
 * F4: leads paywall sends business_id / checkout_mode keys the route
 *     actually reads.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { hasBillingAccess } from '../manual-access'
import { hasActiveAccess } from '../subscription-utils'

const checkoutRoute = readFileSync(
  join(__dirname, '../../app/api/stripe/create-checkout-session/route.ts'),
  'utf8'
)
const leadsPage = readFileSync(
  join(__dirname, '../../app/dashboard/leads/page.tsx'),
  'utf8'
)

const NOW = Date.now()
const future = new Date(NOW + 7 * 86400_000).toISOString()
const past = new Date(NOW - 86400_000).toISOString()

describe('F3: hasBillingAccess unification', () => {
  it.each([
    ['active', true],
    ['trialing', true],
    ['beta', true],
    ['comped', true],
    ['past_due', false],
    ['unpaid', false],
    ['canceled', false],
    ['canceling', false],
    ['no_subscription', false],
    [null, false],
  ])('status %s → %s', (status, expected) => {
    expect(hasBillingAccess({ subscription_status: status } as any)).toBe(expected)
  })

  it('manual access grants billing access', () => {
    expect(hasBillingAccess({
      subscription_status: 'canceled',
      manual_access_enabled: true,
    } as any)).toBe(true)
  })

  it('expired manual access grants nothing', () => {
    expect(hasBillingAccess({
      manual_access_enabled: true,
      manual_access_expires_at: past,
    } as any)).toBe(false)
  })

  it('expired trial loses access even with stale trialing status', () => {
    expect(hasBillingAccess({
      subscription_status: 'trialing',
      trial_ends_at: past,
    } as any)).toBe(false)
  })

  it('expired active period loses access even with stale active status', () => {
    expect(hasBillingAccess({
      subscription_status: 'active',
      current_period_end: past,
    } as any)).toBe(false)
  })

  it('unexpired bounds keep access', () => {
    expect(hasBillingAccess({ subscription_status: 'trialing', trial_ends_at: future } as any)).toBe(true)
    expect(hasBillingAccess({ subscription_status: 'active', current_period_end: future } as any)).toBe(true)
  })

  it('matches hasActiveAccess across the status matrix', () => {
    for (const status of ['active', 'trialing', 'beta', 'comped', 'past_due', 'unpaid', 'canceled', null, 'bogus']) {
      const b = { subscription_status: status } as any
      expect(hasBillingAccess(b)).toBe(hasActiveAccess(b))
    }
  })
})

describe('F2: native-billing checkout guard', () => {
  it('route consults isNativeManagedBilling and returns 409', () => {
    expect(checkoutRoute).toContain('isNativeManagedBilling')
    expect(checkoutRoute).toContain("import { isNativeManagedBilling } from '@/lib/subscription-utils'")
    expect(checkoutRoute).toContain("'native_managed_subscription'")
    expect(checkoutRoute).toContain('{ status: 409 }')
  })

  it('guard only blocks entitled statuses — canceled native subs keep the migration path', () => {
    expect(checkoutRoute).toContain('NATIVE_ENTITLED_STATUSES')
    expect(checkoutRoute).toContain("'active', 'trialing', 'past_due', 'unpaid', 'canceling'")
    // 'canceled' and 'no_subscription' must NOT be in the block set
    expect(checkoutRoute).not.toMatch(/NATIVE_ENTITLED_STATUSES[^)]*'canceled'/)
  })
})

describe('F4: leads paywall payload keys', () => {
  it('sends business_id and checkout_mode — the keys the route reads', () => {
    const post = leadsPage.match(
      /fetch\('\/api\/stripe\/create-checkout-session'[\s\S]*?JSON\.stringify\(\{([\s\S]*?)\}\)/
    )
    expect(post).not.toBeNull()
    const body = post![1]
    expect(body).toContain('business_id:')
    expect(body).toContain('checkout_mode:')
    expect(body).not.toMatch(/\bbusinessId:|[^_]mode:/)
  })

  it('route reads the matching key names', () => {
    expect(checkoutRoute).toContain('body.business_id')
    expect(checkoutRoute).toContain('body.checkout_mode')
  })
})
