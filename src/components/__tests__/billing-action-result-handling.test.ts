/**
 * Regression coverage for billing-action result handling.
 *
 * handleBillingAction() (src/lib/billing.ts) returns:
 * - { success: true } with NO url when it already opened Google Play
 *   subscription management or completed a native portal/purchase session
 * - { success: true, canceled: true, url? } when the user canceled a native
 *   session
 * - { success: false, error } only on real failure
 *
 * Callers must therefore:
 * 1. Route through handleBillingAction (which checks
 *    hasGooglePlayBillingEvidence before any Stripe portal fetch) so
 *    Android + live Google Play evidence can NEVER reach
 *    /api/stripe/create-portal-session.
 * 2. Navigate to result.url only on web (native sessions were already
 *    opened by the helper) — a canceled native session must not push the
 *    webview to the Stripe portal URL.
 * 3. Only surface an error when !result.success — a successful Play
 *    management open or a user cancel must not render a false failure.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const readSrc = (p: string) => readFileSync(join(__dirname, '../../..', p), 'utf8')

const billingSrc = readSrc('src/lib/billing.ts')
const bannerSrc = readSrc('src/components/PaymentIssueBanner.tsx')
const gettingStartedSrc = readSrc('src/components/GettingStarted.tsx')

const consumers: Array<[string, string, string, RegExp]> = [
  // [name, source, handler name, failure-surface pattern]
  ['PaymentIssueBanner', bannerSrc, 'handleUpdateBilling', /setBillingError\(result\.error/],
  ['GettingStarted', gettingStartedSrc, 'handleStartTrial', /alert\(result\.error/],
]

function handlerBlock(src: string, handlerName: string): string {
  const start = src.indexOf(`const ${handlerName}`)
  expect(start, `handler ${handlerName} must exist`).toBeGreaterThan(-1)
  // The billing handlers are the last `const X = async` block in each file's
  // handler cluster; slice a generous window that covers the whole function.
  return src.slice(start, start + 4000)
}

describe('Google Play routing beats the Stripe portal (handleBillingAction)', () => {
  it('checks Google Play billing evidence before any portal-session fetch', () => {
    const evidenceAt = billingSrc.indexOf('hasGooglePlayBillingEvidence(business)')
    const portalFetchAt = billingSrc.indexOf('/api/stripe/create-portal-session')
    expect(evidenceAt).toBeGreaterThan(-1)
    expect(portalFetchAt).toBeGreaterThan(-1)
    expect(evidenceAt).toBeLessThan(portalFetchAt)
  })

  it('opens the Play subscription management page and returns without a url', () => {
    const evidenceAt = billingSrc.indexOf('hasGooglePlayBillingEvidence(business)')
    const block = billingSrc.slice(evidenceAt, evidenceAt + 800)
    expect(block).toContain('getPlaySubscriptionManageUrl')
    expect(block).toContain('Browser.open')
    expect(block).toContain('return { success: true }')
  })

  it('Android Play purchase path runs before the Stripe portal branch', () => {
    const androidAt = billingSrc.indexOf('isNativeAndroid()')
    const portalCallAt = billingSrc.indexOf('openBillingPortal(')
    expect(androidAt).toBeGreaterThan(-1)
    expect(portalCallAt).toBeGreaterThan(-1)
    expect(androidAt).toBeLessThan(portalCallAt)
  })
})

describe.each(consumers)('%s handleBillingAction result handling', (name, src, handlerName, errorPattern) => {
  it('routes through the canonical handleBillingAction (no direct portal fetch)', () => {
    expect(src).toContain('handleBillingAction()')
    expect(src).not.toContain('/api/stripe/create-portal-session')
  })

  it('navigates to result.url only behind an isCapacitorNative guard', () => {
    const navigateAt = src.indexOf('window.location.href = result.url')
    expect(navigateAt).toBeGreaterThan(-1)
    // On native the helper already opened the session; only web navigates.
    const preceding = src.slice(Math.max(0, navigateAt - 600), navigateAt)
    expect(preceding).toContain('!isCapacitorNative()')
  })

  it('only surfaces an error when the billing action actually failed', () => {
    // A { success: true } result (Play management opened, user canceled,
    // or native session completed) must not render a failure message.
    const block = handlerBlock(src, handlerName)
    const errorAt = block.search(errorPattern)
    expect(errorAt, `${name} must surface an error message on failure`).toBeGreaterThan(-1)
    expect(
      block.lastIndexOf('!result.success', errorAt),
      `${name}: error surface must be gated on !result.success`
    ).toBeGreaterThan(-1)
  })
})
