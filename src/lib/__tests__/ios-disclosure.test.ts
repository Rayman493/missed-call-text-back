import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * App Review 3.1.2(c) — iOS subscription disclosure.
 *
 * Two layers under test:
 *  1. iosDisclosureCopy — pure copy model. Every claim derives from the real
 *     StoreKit offer: localized price verbatim, trial copy ONLY when Apple's
 *     eligibility check confirms, neutral copy on failed/loading lookups.
 *  2. Placement — structural assertions that every iOS purchase-decision
 *     surface renders <IosSubscriptionDisclosure> and that the component is
 *     iOS-gated (web/Android visually unchanged).
 */

import {
  iosDisclosureCopy,
  IOS_PLAN_NAME,
  IOS_SUBSCRIPTION_BENEFITS,
} from '../ios-disclosure'
import type { AppleSubscriptionOffer } from '../apple-billing'

const OFFER_TRIAL: AppleSubscriptionOffer = {
  productId: 'replyflow_monthly_apple',
  displayName: 'ReplyFlow Monthly',
  description: 'Monthly subscription',
  displayPrice: 'CA$12.99',
  price: 12.99,
  currency: 'CAD',
  type: 'subscription',
  subscriptionPeriod: '1 month',
  introOffer: { displayPrice: 'Free', paymentMode: 'freeTrial', period: '14 days', periodCount: 1 },
  introOfferEligible: true,
}

const OFFER_NO_TRIAL: AppleSubscriptionOffer = {
  ...OFFER_TRIAL,
  displayPrice: 'US$9.99',
  introOfferEligible: false,
}

const OFFER_NO_INTRO: AppleSubscriptionOffer = {
  ...OFFER_TRIAL,
  introOffer: undefined,
  introOfferEligible: true,
}

describe('iosDisclosureCopy', () => {
  it('trial-eligible offer: localized price verbatim + trial period + post-trial billing terms', () => {
    const c = iosDisclosureCopy(OFFER_TRIAL)
    expect(c.priceLine).toContain('CA$12.99/month')
    expect(c.priceLine).toContain(IOS_PLAN_NAME)
    expect(c.trialLine).toContain('14 days')
    expect(c.trialLine).toMatch(/won't be charged/i)
    expect(c.billingLine).toMatch(/after the trial/i)
    expect(c.billingLine).toContain('CA$12.99')
    expect(c.billingLine).toMatch(/24 hours/i)
    expect(c.renewalLine).toMatch(/renews automatically/i)
    expect(c.renewalLine).toContain('CA$12.99')
    expect(c.renewalLine).toMatch(/apple id/i)
    expect(c.cancelLine).toMatch(/cancel/i)
    expect(c.cancelLine).toMatch(/subscription/i)
  })

  it('ineligible offer: no trial claim, immediate billing disclosed', () => {
    const c = iosDisclosureCopy(OFFER_NO_TRIAL)
    expect(c.trialLine).toBeNull()
    expect(c.billingLine).toMatch(/begins immediately/i)
    expect(c.priceLine).toContain('US$9.99/month')
    expect(c.renewalLine).toMatch(/renews automatically/i)
  })

  it('introOfferEligible without an intro offer object → still no trial claim', () => {
    const c = iosDisclosureCopy(OFFER_NO_INTRO)
    expect(c.trialLine).toBeNull()
    expect(c.billingLine).toMatch(/begins immediately/i)
  })

  it('null offer (loading/failed): neutral copy — no price or trial invented', () => {
    const c = iosDisclosureCopy(null)
    expect(c.trialLine).toBeNull()
    expect(c.priceLine).not.toMatch(/\$|€|£/)
    expect(c.priceLine).toMatch(/App Store/)
    expect(c.renewalLine).toMatch(/renews automatically/i) // still discloses terms
    expect(c.renewalLine).not.toMatch(/\$/)
    expect(c.cancelLine).toMatch(/cancel/i)
  })

  it('benefits list describes verified capabilities — no AI marketing terms', () => {
    expect(IOS_SUBSCRIPTION_BENEFITS.length).toBeGreaterThanOrEqual(4)
    const joined = IOS_SUBSCRIPTION_BENEFITS.join(' ')
    expect(joined).toMatch(/missed-call/i)
    expect(joined).toMatch(/scheduling|jobs|invoices/i)
    expect(joined).toMatch(/payments/i)
    expect(joined).not.toMatch(/\bAI\b|artificial intelligence/i)
  })
})

describe('IosSubscriptionDisclosure component (structural)', () => {
  const SRC = readFileSync(
    join(__dirname, '..', '..', 'components', 'IosSubscriptionDisclosure.tsx'), 'utf8')

  it('renders nothing on non-iOS platforms', () => {
    expect(SRC).toContain('if (!onIOS) return null')
    expect(SRC).toContain('isNativeIOS()')
  })

  it('links Terms of Use + Privacy Policy as in-app routes', () => {
    expect(SRC).toContain('href="/terms"')
    expect(SRC).toContain('href="/privacy"')
    expect(SRC).toMatch(/Terms of Use/)
    expect(SRC).toMatch(/Privacy Policy/)
  })

  it('uses the existing restoreApplePurchases integration (no duplicated purchase logic)', () => {
    expect(SRC).toContain("import('@/lib/apple-billing')")
    expect(SRC).toContain('restoreApplePurchases')
    expect(SRC).not.toContain('launchPurchase')
    expect(SRC).not.toContain('purchaseSubscription')
  })

  it('restore feedback covers success, none-found, and error states', () => {
    expect(SRC).toMatch(/Purchases restored/)
    expect(SRC).toMatch(/No active subscription was found/)
    expect(SRC).toMatch(/Couldn't reach the App Store/)
  })
})

describe('placement: every iOS purchase-decision surface carries the disclosure', () => {
  const files = [
    ['complete-setup paywall', 'src/app/complete-setup/page.tsx'],
    ['in-app locked paywall', 'src/app/dashboard/leads/page.tsx'],
    ['signup plan summary', 'src/app/onboarding/page.tsx'],
    ['auth signup purchase CTA', 'src/app/auth/page.tsx'],
    ['billing-blocker subscribe CTA', 'src/components/SetupStatusCard.tsx'],
  ] as const

  for (const [label, rel] of files) {
    it(`${label} renders <IosSubscriptionDisclosure`, () => {
      const src = readFileSync(join(__dirname, '..', '..', rel.replace('src/', '')), 'utf8')
      expect(src).toContain('IosSubscriptionDisclosure')
      expect(src).toMatch(/import\s+IosSubscriptionDisclosure\s+from\s+'@\/components\/IosSubscriptionDisclosure'/)
    })
  }

  it('locked paywall content is scrollable (no clipped disclosure on small screens)', () => {
    const src = readFileSync(
      join(__dirname, '..', '..', 'app', 'dashboard', 'leads', 'page.tsx'), 'utf8')
    expect(src).toMatch(/max-h-full overflow-y-auto/)
  })

  it('auth page does not hardcode a trial claim on iOS', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'app', 'auth', 'page.tsx'), 'utf8')
    // The trust bullet must be eligibility-gated, not an unconditional claim.
    expect(src).not.toMatch(/<span>14-day free trial<\/span>/)
    expect(src).toContain('iosTrialEligible')
  })
})
