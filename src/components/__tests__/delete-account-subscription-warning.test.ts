import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Regression: the Delete Account modal previously implied subscriptions are
 * always auto-cancelled. Google Play subscriptions can only be cancelled by
 * the customer in Google Play — account deletion never touches them. The
 * modal must show a provider-aware warning, keep truthful Stripe copy, and
 * never promise automatic cancellation when the provider is unknown.
 */

const src = readFileSync(join(__dirname, '..', 'SettingsContent.tsx'), 'utf8')

describe('Delete Account modal — subscription provider warnings', () => {
  it('gates the Google Play warning on subscription_provider', () => {
    expect(src).toContain("provider === 'google_play'")
    expect(src).toContain('does not automatically cancel your subscription through Google Play')
    expect(src).toContain('cancel your subscription in Google Play before deleting your account')
  })

  it('offers a Google Play subscription-management action', () => {
    expect(src).toContain('Manage subscription in Google Play')
    // Reuses the existing billing portal handler which routes Google Play
    // providers to the Play subscriptions page.
    expect(src).toContain("handleBillingActionClick('portal')")
  })

  it('preserves truthful Stripe auto-cancel copy', () => {
    expect(src).toContain("provider === 'stripe'")
    expect(src).toContain('will be canceled automatically')
  })

  it('uses cautious wording for unknown providers — no false auto-cancel promise', () => {
    expect(src).toContain('If your subscription was purchased through Google Play, deleting your ReplyFlow account will not cancel it')
  })

  it('does not show the Google Play warning to users without an active subscription', () => {
    // The google_play warning is only reachable when provider is google_play;
    // a distinct no-active-subscription branch exists for everyone else.
    expect(src).toContain("You don't have an active subscription to cancel")
    const gpIdx = src.indexOf("provider === 'google_play'")
    const noSubIdx = src.indexOf("You don't have an active subscription")
    const stripeIdx = src.indexOf("provider === 'stripe'")
    // Order: google_play warning → no-subscription → stripe → unknown fallback
    expect(gpIdx).toBeGreaterThan(-1)
    expect(noSubIdx).toBeGreaterThan(gpIdx)
    expect(stripeIdx).toBeGreaterThan(noSubIdx)
  })
})
