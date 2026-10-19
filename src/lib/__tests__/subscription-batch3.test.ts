/**
 * Batch 3 — subscription self-service & billing clarity (F5–F12).
 * Unit coverage for provider-aware copy; source-level assertions pin the
 * UI wiring that vitest can't render cheaply in this suite.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  getSubscriptionStatusDescription,
  getPaymentRetryDescription,
  SUBSCRIPTION_STATES,
} from '../subscription'
import { getProviderPriceDisplay } from '../pricing'

const readSrc = (rel: string) => readFileSync(join(__dirname, '../..', rel), 'utf8')

const APPLE = { subscriptionProvider: 'apple', appleOriginalTransactionId: 'tx1' }
const GP = { subscriptionProvider: 'google_play', googlePlayPurchaseToken: 'tok1' }
const STRIPE = { subscriptionProvider: 'stripe' }
const PERIOD_END = '2026-11-15T00:00:00Z'
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

describe('F5 — next billing date', () => {
  it('active subscription shows the provider-derived next billing date', () => {
    const d = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.ACTIVE, 'cus_1', 'sub_1', false, PERIOD_END, null, STRIPE)
    expect(d).toContain(`Next billing date: ${fmtDate(PERIOD_END)}`)
  })

  it('never promises a billing date the provider did not report', () => {
    const d = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.ACTIVE, 'cus_1', 'sub_1', false, null, null, STRIPE)
    expect(d).not.toContain('Next billing date')
  })

  it('trialing shows the trial expiration date, not a billing date', () => {
    const d = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.TRIALING, 'cus_1', 'sub_1', false, PERIOD_END, '2026-11-01T00:00:00Z', STRIPE)
    expect(d).toContain(`trial ends on ${fmtDate('2026-11-01T00:00:00Z')}`)
  })

  it('canceled-with-access still shows the access end date', () => {
    const d = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.ACTIVE, 'cus_1', 'sub_1', true, PERIOD_END, null, STRIPE)
    expect(d).toContain(`keep access until ${fmtDate(PERIOD_END)}`)
    expect(d).not.toContain('Next billing date')
  })
})

describe('F6 — provider-aware payment failure copy', () => {
  it('apple past_due names the App Store, not Stripe', () => {
    const d = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.PAST_DUE, 'cus_1', 'sub_1', null, null, null, APPLE)
    expect(d).toContain('App Store')
    expect(d).not.toContain('Stripe')
  })

  it('google_play past_due names the Play Store, not Stripe', () => {
    const d = getPaymentRetryDescription(GP)
    expect(d).toContain('Google Play')
    expect(d).not.toContain('Stripe')
  })

  it('stripe past_due keeps Stripe retry copy', () => {
    expect(getPaymentRetryDescription(STRIPE)).toContain('Stripe')
    expect(getPaymentRetryDescription(undefined)).toContain('Stripe')
  })

  it('native evidence wins over a stale stripe provider label', () => {
    const d = getPaymentRetryDescription({ subscriptionProvider: 'stripe', appleOriginalTransactionId: 'tx1' })
    expect(d).toContain('App Store')
  })
})

describe('F7 — provider-specific pricing', () => {
  it('Apple displays the App Store price', () => {
    expect(getProviderPriceDisplay('apple')).toBe('$59.99/month')
  })

  it('Stripe and Google Play display the web price', () => {
    expect(getProviderPriceDisplay('stripe')).toBe('$59/month')
    expect(getProviderPriceDisplay('google_play')).toBe('$59/month')
    expect(getProviderPriceDisplay(null)).toBe('$59/month')
    expect(getProviderPriceDisplay(undefined)).toBe('$59/month')
  })

  it('active description uses the provider price', () => {
    const apple = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.ACTIVE, 'cus_1', 'sub_1', false, PERIOD_END, null, APPLE)
    expect(apple).toContain('$59.99/month')
    const stripe = getSubscriptionStatusDescription(SUBSCRIPTION_STATES.ACTIVE, 'cus_1', 'sub_1', false, PERIOD_END, null, STRIPE)
    expect(stripe).toContain('$59/month')
    expect(stripe).not.toContain('$59.99')
  })
})

describe('F8 — offboarding banner gate (source contract)', () => {
  it('no longer requires a Stripe subscription id', () => {
    const src = readSrc('app/dashboard/leads/page.tsx')
    const gate = src.split('OffboardingBanner')[0]
    expect(src).toContain('hasNativeBillingEvidence(business)')
    expect(src).toMatch(/stripe_subscription_id \|\| hasNativeBillingEvidence\(business\)\) && \(/)
    void gate
  })
})

describe('F9 — trial terminology (source contract)', () => {
  it('terms no longer claims a card is never collected', () => {
    const src = readSrc('app/(public)/terms/page.tsx')
    expect(src).not.toContain('no credit card required')
    expect(src).toContain('payment method may be collected')
    expect(src).toContain('no charges are applied during the trial')
  })
})

describe('F10 — Apple management guidance (source contract)', () => {
  it('FAQ explains the App Store path', () => {
    const src = readSrc('app/(public)/faq/page.tsx')
    expect(src).toContain('App Store')
    expect(src).toContain('Subscriptions')
  })

  it('knowledge base billing entries include the App Store path', () => {
    const src = readSrc('lib/assistant/knowledge-base.ts')
    for (const id of ['pricing', 'trial-billing', 'cancel-trial', 'billing-trial-details', 'billing-portal-issues']) {
      const entry = src.slice(src.indexOf(`id: '${id}'`), src.indexOf(`id: '${id}'`) + 2500)
      const answer = entry.match(/answer: '((?:\\'|[^'])*)'/)?.[0] ?? ''
      expect(answer, id).toContain('App Store')
    }
    expect(src).toContain('$59.99/month')
  })
})

describe('F11/F12 — denial + restore feedback (source contract)', () => {
  it('paywall renders the trial-denial reason from the hook', () => {
    const src = readSrc('app/dashboard/leads/page.tsx')
    expect(src).toContain('eligibility.failureTitle')
    expect(src).toContain('eligibility.failureMessage')
    expect(src).toContain('eligibility.failureDetails')
  })

  it('restore purchases surfaces success, empty, and error states', () => {
    const src = readSrc('components/SettingsContent.tsx')
    expect(src).toContain('setRestorePurchasesMessage')
    expect(src).toContain('Purchases restored')
    expect(src).toContain('No active subscription was found')
    expect(src).toContain("Couldn't reach the App Store")
    expect(src).toContain('role="status"')
  })
})
