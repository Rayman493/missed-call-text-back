/**
 * Stripe webhook Google Play provider guard — regression coverage for the
 * proven bug where a stale Stripe subscription event (from a retained
 * historical stripe_subscription_id) overwrote a live Google Play
 * entitlement in the production webhook route.
 *
 * Two layers:
 * 1. Unit tests for isGooglePlayManagedBilling — the shared predicate that
 *    decides whether the current entitlement is Play-managed.
 * 2. Source scans proving the production route wires the guard into every
 *    subscription-scoped handler BEFORE any entitlement mutation, and still
 *    marks skipped events processed (no retry loop).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isGooglePlayManagedBilling } from '../subscription-utils'

const routeSource = readFileSync(
  join(__dirname, '../../app/api/stripe/webhook/route.ts'),
  'utf8'
)

describe('isGooglePlayManagedBilling', () => {
  it('returns true for a live Google Play entitlement (provider label + token)', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: 'google_play',
        google_play_purchase_token: 'tok_live',
        google_play_last_verified_at: '2026-10-05T00:00:00Z',
        checkout_completed_at: '2026-09-01T00:00:00Z', // old Stripe signup
      })
    ).toBe(true)
  })

  it('returns true when provider label is stale stripe but an unrevoked Play token persists', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: 'stripe',
        google_play_purchase_token: 'tok_live',
        google_play_revoked_at: null,
        google_play_last_verified_at: '2026-10-05T00:00:00Z',
        checkout_completed_at: '2026-09-01T00:00:00Z',
      })
    ).toBe(true)
  })

  it('returns false for a pure Stripe business with no Play evidence', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: 'stripe',
        checkout_completed_at: '2026-10-01T00:00:00Z',
      })
    ).toBe(false)
    expect(isGooglePlayManagedBilling({})).toBe(false)
    expect(isGooglePlayManagedBilling(null)).toBe(false)
  })

  it('returns false when Play evidence is dead (revoked token, no provider label)', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: null,
        google_play_purchase_token: 'tok_dead',
        google_play_revoked_at: '2026-10-01T00:00:00Z',
      })
    ).toBe(false)
  })

  it('returns false for a genuine Play→Stripe switch-back (newer checkout than last Play verification)', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: 'google_play',
        google_play_purchase_token: 'tok_expired',
        google_play_last_verified_at: '2026-10-01T00:00:00Z',
        checkout_completed_at: '2026-10-06T00:00:00Z', // new Stripe checkout wins
      })
    ).toBe(false)
  })

  it('returns false when a checkout completed and Play was never verified through the current service', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: 'google_play',
        google_play_purchase_token: 'tok_legacy',
        google_play_last_verified_at: null,
        checkout_completed_at: '2026-10-06T00:00:00Z',
      })
    ).toBe(false)
  })

  it('returns true when Play verified after the last checkout and no newer checkout exists', () => {
    expect(
      isGooglePlayManagedBilling({
        subscription_provider: 'google_play',
        google_play_purchase_token: 'tok_live',
        google_play_last_verified_at: '2026-10-06T00:00:00Z',
        checkout_completed_at: null,
      })
    ).toBe(true)
  })
})

describe('production webhook route guard wiring', () => {
  const casesToGuard = [
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_failed',
    'invoice.paid',
  ]

  function caseBlock(eventType: string): string {
    const start = routeSource.indexOf(`case '${eventType}'`)
    expect(start).toBeGreaterThan(-1)
    const nextCase = routeSource.indexOf("case '", start + 1)
    return routeSource.slice(start, nextCase === -1 ? undefined : nextCase)
  }

  it.each(casesToGuard)(
    'guards %s against Google Play-managed businesses',
    (eventType) => {
      const block = caseBlock(eventType)
      expect(block).toContain('skipIfGooglePlayManaged')
      expect(block).toContain('markEventProcessed')
    }
  )

  it('guards run before any entitlement mutation in each handler', () => {
    for (const eventType of casesToGuard) {
      const block = caseBlock(eventType)
      const guardAt = block.indexOf('skipIfGooglePlayManaged')
      // subscription_status writes and side effects must come after the guard
      // ('subscription_status:' with colon = update payload, not SELECT columns)
      for (const mutation of ["subscription_status:", 'scheduleTwilioRelease']) {
        const mutationAt = block.indexOf(mutation)
        if (mutationAt === -1) continue
        expect(guardAt, `${eventType}: guard must precede ${mutation}`).toBeLessThan(mutationAt)
      }
    }
  })

  it('guard precedes Twilio release scheduling and failure notification in invoice.payment_failed', () => {
    const block = caseBlock('invoice.payment_failed')
    const guardAt = block.indexOf('skipIfGooglePlayManaged')
    expect(guardAt).toBeLessThan(block.indexOf("subscription_status: 'past_due'"))
    expect(guardAt).toBeLessThan(block.indexOf('scheduleTwilioRelease'))
    expect(guardAt).toBeLessThan(block.indexOf('createNotification'))
  })

  it('guard precedes the Stripe re-fetch in customer.subscription.deleted (skipped events cost no API call)', () => {
    const block = caseBlock('customer.subscription.deleted')
    const guardAt = block.indexOf('skipIfGooglePlayManaged')
    expect(guardAt).toBeLessThan(block.indexOf('subscriptions.retrieve'))
    // The canceled-state clearing must come after the guard.
    expect(guardAt).toBeLessThan(block.indexOf("subscription_status: SUBSCRIPTION_STATES.CANCELED"))
  })

  it('checkout.session.completed is NOT guarded — it is the genuine Stripe activation/switch-back door', () => {
    const block = caseBlock('checkout.session.completed')
    expect(block).not.toContain('skipIfGooglePlayManaged')
    // A completed Stripe checkout truthfully marks the provider so a
    // Play→Stripe switch-back engages RTDN stripe-protection.
    expect(block).toContain("subscription_provider: 'stripe'")
    expect(block).toContain('checkout_completed_at')
  })

  it('shared lookup selects the Google Play evidence fields', () => {
    expect(routeSource).toContain('GP_GUARD_BUSINESS_FIELDS')
    expect(routeSource).toContain('google_play_last_verified_at')
    expect(routeSource).toContain('checkout_completed_at')
    expect(routeSource).toContain("import { isGooglePlayManagedBilling } from '@/lib/subscription-utils'")
  })
})
