import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getDeletionSubscriptionNotice } from '@/lib/subscription-utils'

/**
 * Regression: the Delete Account modal showed "Your active ReplyFlow
 * subscription will be canceled automatically" to a Google Play subscriber —
 * subscription_provider read 'stripe' on an account actually billed by
 * Google Play (a Stripe checkout.session.completed write can overwrite it).
 * The classifier must prefer the persisted google_play_purchase_token and
 * must NEVER classify an unknown/ambiguous provider as auto-cancellable.
 */

describe('getDeletionSubscriptionNotice', () => {
  it('Google Play subscription (provider column) → google_play', () => {
    expect(getDeletionSubscriptionNotice({
      subscription_provider: 'google_play',
      google_play_purchase_token: 'tok',
      subscription_status: 'active',
    })).toBe('google_play')
  })

  it('Google Play token + stale stripe provider (the observed bug) → google_play is NOT stripe', () => {
    const notice = getDeletionSubscriptionNotice({
      subscription_provider: 'stripe',
      google_play_purchase_token: 'tok',
      stripe_subscription_id: 'sub_old',
      subscription_status: 'active',
    })
    expect(notice).not.toBe('stripe')
    expect(notice).toBe('unknown')
  })

  it('Google Play token + missing provider → google_play', () => {
    expect(getDeletionSubscriptionNotice({
      google_play_purchase_token: 'tok',
      subscription_status: 'active',
    })).toBe('google_play')
  })

  it('Stripe subscription → stripe (auto-cancel is truthful)', () => {
    expect(getDeletionSubscriptionNotice({
      subscription_provider: 'stripe',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
    })).toBe('stripe')
  })

  it('active subscription + unknown provider → unknown (never stripe)', () => {
    expect(getDeletionSubscriptionNotice({
      subscription_status: 'active',
      subscription_provider: 'paypal' as any,
    })).toBe('unknown')
  })

  it('active subscription + null provider → unknown', () => {
    expect(getDeletionSubscriptionNotice({
      subscription_status: 'trialing',
      subscription_provider: null,
    })).toBe('unknown')
  })

  it('no subscription → none', () => {
    expect(getDeletionSubscriptionNotice(null)).toBe('none')
    expect(getDeletionSubscriptionNotice({})).toBe('none')
    expect(getDeletionSubscriptionNotice({ subscription_status: 'canceled', google_play_purchase_token: 'tok' })).toBe('none')
  })

  it('status missing but billing ids present → still classified', () => {
    expect(getDeletionSubscriptionNotice({
      subscription_provider: 'stripe',
      stripe_subscription_id: 'sub_1',
    })).toBe('stripe')
    expect(getDeletionSubscriptionNotice({
      google_play_purchase_token: 'tok',
    })).toBe('google_play')
  })
})

describe('Delete Account modal wiring', () => {
  const src = readFileSync(join(__dirname, '..', 'SettingsContent.tsx'), 'utf8')

  it('uses the classifier and never shows auto-cancel to google_play', () => {
    expect(src).toContain('getDeletionSubscriptionNotice(business)')
    expect(src).toContain("notice === 'google_play'")
    expect(src).toContain("notice === 'stripe'")
    expect(src).toContain("notice === 'none'")
    // google_play branch precedes and never contains the auto-cancel sentence
    const gpIdx = src.indexOf("notice === 'google_play'")
    const stripeIdx = src.indexOf("notice === 'stripe'")
    const autoCancelIdx = src.indexOf('will be canceled automatically')
    expect(gpIdx).toBeGreaterThan(-1)
    expect(stripeIdx).toBeGreaterThan(gpIdx)
    expect(autoCancelIdx).toBeGreaterThan(stripeIdx)
    expect(src).toContain('will not automatically cancel your Google Play subscription')
    expect(src).toContain('Manage subscription in Google Play')
  })
})
