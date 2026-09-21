/**
 * Pre-launch polish Batch 2 — member/owner Settings UX hardening contracts.
 *
 * Canonical role signal: `role` from BusinessContext
 * ('owner' | 'member' | null, resolved from business_memberships).
 * While null (hydrating), owner-only controls must not render.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const src = readFileSync('src/components/SettingsContent.tsx', 'utf8').replace(/\r\n/g, '\n')
const businessContext = readFileSync('src/contexts/BusinessContext.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('canonical role signal', () => {
  it('role comes from business_memberships via BusinessContext', () => {
    expect(businessContext).toContain("from('business_memberships')")
    expect(businessContext).toContain("membership.role === 'owner'")
  })

  it('SettingsContent consumes the canonical role', () => {
    expect(src).toContain('role } = useBusiness()')
  })
})

describe('Danger Zone is owner-only', () => {
  it('Danger Zone section is wrapped in an owner-only render guard', () => {
    const dangerIdx = src.indexOf('id="danger-zone"')
    expect(dangerIdx).toBeGreaterThan(-1)
    const before = src.substring(Math.max(0, dangerIdx - 400), dangerIdx)
    expect(before).toContain("role === 'owner' && (")
  })

  it('member copy is gone — the section cannot render for members at all', () => {
    const dangerIdx = src.indexOf('id="danger-zone"')
    const end = src.indexOf('{/* Settings Action Bar', dangerIdx)
    const block = src.substring(dangerIdx, end > -1 ? end : dangerIdx + 4000)
    expect(block).not.toContain("role === 'member'")
  })
})

describe('Stripe Connect owner-only gating', () => {
  it('refreshStripeStatus returns early for non-owners', () => {
    const fnStart = src.indexOf('const refreshStripeStatus = useCallback')
    const fnBlock = src.substring(fnStart, fnStart + 3000)
    expect(fnBlock).toContain("if (role !== 'owner')")
    expect(fnBlock.indexOf("role !== 'owner'")).toBeLessThan(fnBlock.indexOf("fetch('/api/stripe/connect/refresh'"))
  })

  it('visibility-resume refresh requires owner role', () => {
    expect(src).toContain("business?.stripe_connect_account_id && role === 'owner'")
  })

  it('Stripe onboarding-return reconcile requires owner role', () => {
    expect(src).toContain("stripeOnboardingComplete || sessionStorageReturn) && business?.id && role === 'owner'")
  })

  it('bounded recheck is owner-gated', () => {
    const idx = src.indexOf('const performBoundedRecheck')
    expect(src.substring(idx, idx + 300)).toContain("if (role !== 'owner') return")
  })

  it('handleConnectStripe is owner-gated', () => {
    const idx = src.indexOf('const handleConnectStripe')
    expect(src.substring(idx, idx + 800)).toContain("if (role !== 'owner')")
  })

  it('expected member_denied does not produce a generic Stripe error toast', () => {
    expect(src).toContain('isExpectedDenial')
    expect(src).toContain('member_denied')
    expect(src).toContain('status_refresh_denied_non_owner')
  })

  it('member sees passive managed copy instead of Stripe controls', () => {
    // The Stripe card member branch precedes the connect/manage button branch.
    const stripeCard = src.substring(src.indexOf('brands/stripe.svg'), src.indexOf('id="payments-venmo"'))
    expect(stripeCard).toContain("role === 'member'")
    expect(stripeCard).toContain('Managed by the business owner')
  })

  it('owner-only Stripe controls do not render while role is resolving', () => {
    const stripeCard = src.substring(src.indexOf('brands/stripe.svg'), src.indexOf('id="payments-venmo"'))
    expect(stripeCard).toContain("role !== 'owner'")
  })
})

describe('billing and integrations owner gating', () => {
  it('billing portal/upgrade click is owner-gated', () => {
    const idx = src.indexOf('const handleBillingActionClick')
    expect(src.substring(idx, idx + 500)).toContain("if (role !== 'owner')")
  })

  it('member billing shows managed copy; upgrade is owner-only', () => {
    expect(src).toContain("role === 'owner' && needsUpgrade(")
  })

  it('calendar connect/disconnect handlers are owner-gated', () => {
    const connectIdx = src.indexOf('const handleConnectCalendar')
    const disconnectIdx = src.indexOf('const handleDisconnectCalendar')
    expect(src.substring(connectIdx, connectIdx + 800)).toContain("if (role !== 'owner')")
    expect(src.substring(disconnectIdx, disconnectIdx + 400)).toContain("if (role !== 'owner')")
  })

  it('calendar button does not flash for unresolved role', () => {
    const card = src.substring(src.indexOf('Google Calendar & Meet'), src.indexOf('id="tap-to-pay-card"'))
    expect(card).toContain("role !== 'owner'")
  })

  it('Tap to Pay enablement is owner-gated (handler + auto linkage check)', () => {
    const handlerIdx = src.indexOf('const handleEnableTapToPay')
    expect(src.substring(handlerIdx, handlerIdx + 500)).toContain("if (role !== 'owner')")
    const linkageIdx = src.indexOf('const checkAppleAccountLinkage')
    expect(src.substring(linkageIdx, linkageIdx + 1200)).toContain("role !== 'owner'")
  })

  it('Tap to Pay action button renders managed copy for members', () => {
    const idx = src.indexOf("status === 'supported' && isNativeMobile()")
    expect(src.substring(idx, idx + 800)).toContain('Managed by the business owner')
  })
})

describe('deep link safety', () => {
  it('danger-zone is not a canonical settings section', () => {
    const config = readFileSync('src/lib/settings-config.ts', 'utf8')
    expect(config).not.toContain("id: 'danger-zone'")
  })
})
