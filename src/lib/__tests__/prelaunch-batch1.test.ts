/**
 * Pre-launch polish Batch 1 — focused regression tests.
 *
 * Covers:
 *  - Canonical Venmo/PayPal handle normalization (exactly one @)
 *  - Bottom navigation single-active resolver (pendingHref exclusivity +
 *    canonical item.isActive from navigation-config)
 *  - Conversation realtime auth refresh on token rotation
 *  - Mobile conversation card measured height (no fixed 7rem estimate)
 *  - Settings payments save reconciles the focused input's live DOM value
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  normalizeProviderHandle,
  canonicalProviderHandle,
  normalizeVenmoUsername,
  normalizePaypalUsername,
} from '@/lib/payment-links'
import { primaryNavItems } from '@/lib/navigation-config'

const bottomNav = readFileSync('src/components/BottomNavigation.tsx', 'utf8').replace(/\r\n/g, '\n')
const settingsContent = readFileSync('src/components/SettingsContent.tsx', 'utf8').replace(/\r\n/g, '\n')
const leadPage = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')
const paymentHandoff = readFileSync('src/components/PaymentHandoff.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('canonical provider handle normalization', () => {
  it('adds exactly one @ to a bare handle', () => {
    expect(canonicalProviderHandle('RyanBandi')).toBe('@RyanBandi')
  })

  it('keeps a single-@ handle canonical', () => {
    expect(canonicalProviderHandle('@RyanBandi')).toBe('@RyanBandi')
  })

  it('collapses multiple @ prefixes to one', () => {
    expect(canonicalProviderHandle('@@RyanBandi')).toBe('@RyanBandi')
    expect(canonicalProviderHandle('@@@@RyanBandi')).toBe('@RyanBandi')
  })

  it('trims surrounding whitespace before normalizing', () => {
    expect(canonicalProviderHandle('  RyanBandi  ')).toBe('@RyanBandi')
    expect(canonicalProviderHandle('  @@RyanBandi ')).toBe('@RyanBandi')
  })

  it('returns empty string for empty/blank input', () => {
    expect(canonicalProviderHandle('')).toBe('')
    expect(canonicalProviderHandle('   ')).toBe('')
    expect(canonicalProviderHandle(null)).toBe('')
    expect(canonicalProviderHandle(undefined)).toBe('')
    expect(canonicalProviderHandle('@@@')).toBe('')
  })

  it('normalizeProviderHandle strips all leading @ characters', () => {
    expect(normalizeProviderHandle('@@user')).toBe('user')
    expect(normalizeProviderHandle('@user')).toBe('user')
    expect(normalizeProviderHandle('user')).toBe('user')
    expect(normalizeProviderHandle('  @user ')).toBe('user')
  })

  it('venmo and paypal normalizers strip all leading @', () => {
    expect(normalizeVenmoUsername('@@user')).toBe('user')
    expect(normalizePaypalUsername('@@user')).toBe('user')
    expect(normalizePaypalUsername('https://paypal.me/user')).toBe('user')
  })

  it('PaymentHandoff never prepends @ to an already-prefixed handle', () => {
    // Regression guard: '@{venmoUsername}' / '@{paypalHandle}' produced '@@'.
    expect(paymentHandoff).not.toContain('@{venmoUsername}')
    expect(paymentHandoff).not.toContain('@{paypalHandle}')
    expect(paymentHandoff).toContain('canonicalProviderHandle')
  })

  it('SettingsContent paypal chip uses the canonical handle helper', () => {
    expect(settingsContent).not.toContain('@{formBusiness.paypal_payment_link')
    expect(settingsContent).toContain('canonicalProviderHandle(normalizePaypalUsername(')
  })

  it('venmo username is normalized before persistence', () => {
    expect(settingsContent).toContain('venmo_username: normalizeVenmoUsername(')
  })
})

describe('bottom navigation single-active resolver', () => {
  it('uses the canonical per-item isActive resolver', () => {
    expect(bottomNav).toContain('item.isActive ? item.isActive(')
  })

  it('pendingHref is exclusive — pathname cannot also highlight another tab', () => {
    const block = bottomNav.substring(
      bottomNav.indexOf('const isActive'),
      bottomNav.indexOf('const handleLogout')
    )
    expect(block).toContain('if (pendingHref)')
    expect(block).toContain('return pendingHref === item.href')
    // No pathname fallback while pendingHref is set
    expect(block.indexOf('if (pendingHref)')).toBeLessThan(block.indexOf('item.isActive'))
  })

  it('pendingHref has a bounded clear so a failed/redirected nav cannot stick', () => {
    const reconcile = bottomNav.substring(
      bottomNav.indexOf('// Reconcile pendingHref'),
      bottomNav.indexOf('// Clear pendingHref when the nav is hidden')
    )
    expect(reconcile).toContain('pathname === pendingHref')
    expect(reconcile).toMatch(/setTimeout\(\(\) => setPendingHref\(null\), \d+\)/)
  })

  it('navigation-config isActive resolvers produce exactly one match per route', () => {
    const routes: Array<[string, string]> = [
      ['/dashboard', '/dashboard'],
      ['/dashboard/leads', '/dashboard/leads'],
      ['/dashboard/leads/abc-123', '/dashboard/leads'],
      ['/dashboard/calendar', '/dashboard/calendar'],
      ['/dashboard/payments', '/dashboard/payments'],
      ['/dashboard/personal-voicemail', '/dashboard/personal-voicemail'],
      ['/dashboard/settings', '__none__'],
    ]
    for (const [pathname, expectedHref] of routes) {
      const matches = primaryNavItems.filter(item =>
        item.isActive ? item.isActive(pathname) : pathname === item.href
      )
      if (expectedHref === '__none__') {
        expect(matches.length, `${pathname} should not highlight any primary tab`).toBe(0)
      } else {
        expect(matches.length, `${pathname} must highlight exactly one tab`).toBe(1)
        expect(matches[0].href).toBe(expectedHref)
      }
    }
  })
})

describe('conversation realtime auth refresh', () => {
  it('re-authenticates the realtime socket when the access token rotates', () => {
    expect(leadPage).toContain('onAuthStateChange')
    expect(leadPage).toContain("'TOKEN_REFRESHED'")
    expect(leadPage).toContain("'SIGNED_IN'")
    const refreshIdx = leadPage.indexOf('realtime-setauth-refresh')
    expect(refreshIdx).toBeGreaterThan(-1)
    expect(leadPage.substring(0, refreshIdx)).toContain('realtime.setAuth')
  })

  it('unsubscribes the auth listener in the realtime effect cleanup', () => {
    expect(leadPage).toContain('realtimeAuthSubscription.unsubscribe()')
  })
})

describe('mobile conversation card height', () => {
  it('measures the card against the live visual viewport', () => {
    expect(leadPage).toContain('mobileWorkspaceCardRef')
    expect(leadPage).toContain('getBoundingClientRect().top')
    expect(leadPage).toContain('offsetTop')
    // Enforces a minimum so the card can never collapse to zero.
    expect(leadPage).toMatch(/Math\.max\(\d+, available\)/)
  })

  it('re-measures when the bottom nav height var changes (native keyboard-open)', () => {
    expect(leadPage).toContain("'--bottom-nav-height'")
    expect(leadPage).toContain('navVarObserver')
  })

  it('fullscreen conversation overlay tracks the visual viewport height', () => {
    expect(leadPage).toContain("style={{ height: 'var(--visual-viewport-height, 100dvh)' }}")
  })
})

describe('settings payments stale-save reconciliation', () => {
  it('reads the focused input live DOM value before saving', () => {
    expect(settingsContent).toContain('data-settings-field="venmo_username"')
    expect(settingsContent).toContain('data-settings-field="paypal_payment_link"')
    expect(settingsContent).toContain('dataset?.settingsField')
    expect(settingsContent).toContain('saveChanges(businessOverride)')
  })

  it('dirty state still gates the business save (override counts as dirty)', () => {
    expect(settingsContent).toContain('hasUnsavedChanges || !!businessOverride')
  })
})
