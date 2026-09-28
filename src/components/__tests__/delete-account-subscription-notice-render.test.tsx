import { describe, it, expect } from 'vitest'

// Enable React's act() assertion in the jsdom test environment.
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import DeleteAccountSubscriptionNotice from '@/components/settings/DeleteAccountSubscriptionNotice'

function renderWithProps(business: any) {
  const container = document.createElement('div')
  const root = createRoot(container)
  const onManage = () => {}
  act(() => {
    root.render(<DeleteAccountSubscriptionNotice business={business} onManageBilling={onManage} />)
  })
  const text = container.textContent || ''
  return { container, text, root }
}

describe('DeleteAccountSubscriptionNotice render', () => {
  it('Google Play subscriber sees the Google Play warning, not auto-cancel', () => {
    const { text } = renderWithProps({
      subscription_provider: 'google_play',
      google_play_purchase_token: 'tok',
      subscription_status: 'active',
    })
    expect(text).toContain('will not automatically cancel your Google Play subscription')
    expect(text).toContain('Manage subscription in Google Play')
    expect(text).not.toContain('will be canceled automatically')
  })

  it('stale stripe provider with a Google Play token never shows auto-cancel', () => {
    const { text } = renderWithProps({
      subscription_provider: 'stripe',
      google_play_purchase_token: 'tok',
      stripe_subscription_id: 'sub_old',
      subscription_status: 'active',
    })
    expect(text).not.toContain('will be canceled automatically')
    expect(text).toContain('may not cancel it')
  })

  it('confirmed Stripe subscriber with a subscription id sees auto-cancel', () => {
    const { text } = renderWithProps({
      subscription_provider: 'stripe',
      stripe_subscription_id: 'sub_1',
      subscription_status: 'active',
    })
    expect(text).toContain('will be canceled automatically')
    expect(text).not.toContain('Google Play')
  })

  it('stripe provider without a concrete subscription id does not promise auto-cancel', () => {
    const { text } = renderWithProps({
      subscription_provider: 'stripe',
      subscription_status: 'active',
    })
    expect(text).not.toContain('will be canceled automatically')
    expect(text).toContain('may not cancel it')
  })

  it('no active subscription shows no cancellation warning', () => {
    const { text } = renderWithProps({
      subscription_status: 'canceled',
    })
    expect(text).toContain("don't have an active subscription to cancel")
    expect(text).not.toContain('will be canceled automatically')
  })

  it('unknown provider uses fail-safe wording', () => {
    const { text } = renderWithProps({
      subscription_status: 'active',
      subscription_provider: 'paypal',
    })
    expect(text).toContain('may not cancel it')
    expect(text).not.toContain('will be canceled automatically')
  })
})
