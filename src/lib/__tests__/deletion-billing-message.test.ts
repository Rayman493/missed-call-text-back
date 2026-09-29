import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getDeletionBillingMessage, getDeletionPlayManageUrl } from '../deletion-billing-message'

/**
 * Post-deletion billing communication.
 *
 * The account-deletion confirmation email is sent AFTER the businesses row
 * (and its billing identifiers) are hard-deleted. The provider classification
 * and management links must therefore be resolved before destructive deletion
 * and carried into the email as pre-computed copy — never re-derived.
 *
 * These tests pin the truthful, provider-specific templates:
 * - confirmed Stripe + successful cancellation
 * - confirmed Stripe + unconfirmed cancellation (never claims success)
 * - Google Play (explicitly NOT auto-canceled, Play link, no Stripe link)
 * - ambiguous provider (conservative, no link, no promise)
 * - no active subscription (no billing copy at all)
 */

describe('getDeletionBillingMessage', () => {
  describe('confirmed Stripe', () => {
    it('successful cancellation + durable manage link → canceled + Stripe link', () => {
      const msg = getDeletionBillingMessage({
        notice: 'stripe',
        stripeCancellationSucceeded: true,
        stripeManageUrl: 'https://billing.stripe.com/p/login/test_abc',
      })
      expect(msg).not.toBeNull()
      expect(msg!.text).toContain('was canceled automatically')
      expect(msg!.text).not.toContain('could not confirm')
      expect(msg!.actionUrl).toBe('https://billing.stripe.com/p/login/test_abc')
      expect(msg!.actionLabel).toMatch(/Stripe/)
      // never a Google Play link in the Stripe case
      expect(msg!.text + (msg!.actionUrl || '')).not.toContain('play.google.com')
    })

    it('successful cancellation + no manage link → truthful fallback instructions', () => {
      const msg = getDeletionBillingMessage({
        notice: 'stripe',
        stripeCancellationSucceeded: true,
        stripeManageUrl: null,
      })
      expect(msg!.text).toContain('was canceled automatically')
      expect(msg!.text).toContain('support@replyflowhq.com')
      expect(msg!.actionUrl).toBeUndefined()
    })

    it('failed/unconfirmed cancellation → never claims cancellation', () => {
      const msg = getDeletionBillingMessage({
        notice: 'stripe',
        stripeCancellationSucceeded: false,
        stripeManageUrl: 'https://billing.stripe.com/p/login/test_abc',
      })
      expect(msg!.text).not.toContain('was canceled automatically')
      expect(msg!.text).not.toContain('were canceled')
      expect(msg!.text).toContain('account has been deleted')
      expect(msg!.text).toContain('could not confirm')
      expect(msg!.text).toContain('Stripe')
      expect(msg!.text).toContain('avoid future charges')
      // failure path may still surface the durable management link
      expect(msg!.actionUrl).toBe('https://billing.stripe.com/p/login/test_abc')
      expect(msg!.actionUrl).not.toContain('play.google.com')
    })
  })

  describe('Google Play', () => {
    it('explicitly states deletion does NOT cancel Google Play + Play link, no Stripe link', () => {
      const msg = getDeletionBillingMessage({ notice: 'google_play' })
      expect(msg!.text).toContain('does not automatically cancel your Google Play subscription')
      expect(msg!.text).toContain('avoid future charges')
      expect(msg!.actionUrl).toContain('play.google.com/store/account/subscriptions')
      expect(msg!.actionUrl).toContain('package=com.replyflowhq.app')
      expect(msg!.actionLabel).toMatch(/Google Play/)
      // no Stripe link or Stripe claim in the Google Play case
      expect(msg!.text).not.toContain('Stripe')
      expect(msg!.actionUrl).not.toContain('stripe.com')
      expect(msg!.text).not.toContain('was canceled')
    })
  })

  describe('ambiguous / unknown provider', () => {
    it('conservative wording, no cancellation promise, no provider links', () => {
      const msg = getDeletionBillingMessage({ notice: 'unknown' })
      expect(msg!.text).not.toContain('was canceled')
      expect(msg!.text).not.toContain('canceled automatically')
      expect(msg!.text).toContain('Stripe, Google Play, or another billing provider')
      expect(msg!.text).toContain('avoid future charges')
      expect(msg!.actionUrl).toBeUndefined()
    })
  })

  describe('no active subscription', () => {
    it('returns null — normal confirmation without billing language', () => {
      expect(getDeletionBillingMessage({ notice: 'none' })).toBeNull()
    })
  })

  describe('getDeletionPlayManageUrl', () => {
    it('produces the Play Store subscription-management destination', () => {
      const url = getDeletionPlayManageUrl()
      expect(url).toMatch(/^https:\/\/play\.google\.com\/store\/account\/subscriptions\?sku=.+&package=com\.replyflowhq\.app$/)
    })
  })
})

describe('deletion service wiring', () => {
  const serviceSrc = readFileSync(join(__dirname, '..', 'account-deletion-service.ts'), 'utf8')
  const emailSrc = readFileSync(join(__dirname, '..', 'email.ts'), 'utf8')

  it('businesses select includes provider evidence needed for classification', () => {
    expect(serviceSrc).toContain('subscription_provider')
    expect(serviceSrc).toContain('google_play_purchase_token')
  })

  it('classifies provider with the same safe classifier as the Settings warning', () => {
    expect(serviceSrc).toContain('getDeletionSubscriptionNotice(businesses[0])')
    expect(serviceSrc).toContain("from './subscription-utils'")
  })

  it('resolves billing messaging BEFORE destructive business deletion', () => {
    const classifyIdx = serviceSrc.indexOf('getDeletionSubscriptionNotice(businesses[0])')
    const buildIdx = serviceSrc.indexOf('getDeletionBillingMessage({')
    const deleteIdx = serviceSrc.indexOf('Step 21: hard-delete businesses')
    const authDeleteIdx = serviceSrc.indexOf('supabaseAdmin.auth.admin.deleteUser')
    expect(classifyIdx).toBeGreaterThan(-1)
    expect(buildIdx).toBeGreaterThan(classifyIdx)
    expect(deleteIdx).toBeGreaterThan(buildIdx)
    expect(authDeleteIdx).toBeGreaterThan(deleteIdx)
  })

  it('fetches the durable Stripe login-page URL, never a short-lived portal session URL', () => {
    expect(serviceSrc).toContain('billingPortal.configurations.list')
    expect(serviceSrc).toContain('login_page')
    // sessions.create portal URLs are short-lived/single-use — must not be
    // generated for the post-deletion email
    expect(serviceSrc).not.toContain('stripe.billingPortal.sessions.create')
    expect(serviceSrc).not.toContain('stripe.billingPortal.sessions')
  })

  it('production confirmation email receives the provider-aware billing message', () => {
    const callIdx = serviceSrc.indexOf('sendAccountDeletionConfirmationEmail({')
    expect(callIdx).toBeGreaterThan(-1)
    const callBlock = serviceSrc.slice(callIdx, callIdx + 600)
    expect(callBlock).toContain('billing: deletionBillingMessage')
  })

  it('email template renders the billing section when provided', () => {
    expect(emailSrc).toContain('billing')
    expect(emailSrc).toContain('<strong>Billing:</strong>')
    expect(emailSrc).toContain('billing.actionUrl')
    expect(emailSrc).toContain('billingSection')
  })
})
