import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const handoffSrc = readFileSync('src/components/PaymentHandoff.tsx', 'utf8').replace(/\r\n/g, '\n')
const linksSrc = readFileSync('src/lib/payment-links.ts', 'utf8').replace(/\r\n/g, '\n')
const webmanifestSrc = readFileSync('public/site.webmanifest', 'utf8').replace(/\r\n/g, '\n')

describe('Venmo handoff routing and lifecycle', () => {
  it('PWA manifest scopes the WebAPK to /dashboard/ so public /pay stays in the browser', () => {
    expect(webmanifestSrc).toContain('"scope": "/dashboard/"')
    expect(webmanifestSrc).toContain('"start_url": "/dashboard"')
  })

  it('preserves the targeted Venmo recipient URL on all platforms', () => {
    expect(linksSrc).toContain('https://venmo.com/u/${encodeURIComponent(normalized)}')
  })

  it('uses checkoutUrl as the primary Venmo handoff target', () => {
    expect(handoffSrc).toContain("const targetUrl = checkoutUrl || (provider === 'venmo' ? 'https://venmo.com' : '#')")
    expect(handoffSrc).toContain('Browser.open({ url: targetUrl })')
    expect(handoffSrc).toContain("window.open(targetUrl, '_blank', 'noopener,noreferrer')")
  })

  it('does not special-case Android to a generic URL', () => {
    expect(handoffSrc).not.toContain('navigator.userAgent')
    expect(handoffSrc).not.toContain('/Android/i')
    expect(handoffSrc).not.toContain('isAndroid')
  })

  it('falls back to the generic Venmo origin only when checkoutUrl is missing', () => {
    expect(handoffSrc).toContain("provider === 'venmo' ? 'https://venmo.com' : '#'")
  })

  it('fails safely when the Venmo username is invalid/missing', () => {
    expect(linksSrc).toContain("if (!normalized) {")
    expect(linksSrc).toContain("error: 'Invalid Venmo username'")
  })

  it('uses Browser.open on native', () => {
    expect(handoffSrc).toContain('Capacitor.isNativePlatform()')
    expect(handoffSrc).toContain('Browser.open({ url: targetUrl })')
  })

  it('uses window.open with _blank on web so the CTA escapes the PWA', () => {
    expect(handoffSrc).toContain("window.open(targetUrl, '_blank', 'noopener,noreferrer')")
  })

  it('clears opening state via native app resume', () => {
    expect(handoffSrc).toContain("App.addListener('appStateChange'")
    expect(handoffSrc).toContain('if (isActive) clearOpening()')
  })

  it('clears opening state via web return lifecycle events', () => {
    expect(handoffSrc).toContain("'visibilitychange'")
    expect(handoffSrc).toContain("'pageshow'")
    expect(handoffSrc).toContain("'focus'")
  })

  it('does not leave the CTA permanently loading', () => {
    expect(handoffSrc).toContain('setOpening(false)')
    expect(handoffSrc).not.toContain('setTimeout(() => setOpening(false)')
  })

  it('keeps username, amount, and note visible and copyable', () => {
    expect(handoffSrc).toContain('@{venmoUsername}')
    expect(handoffSrc).toContain("'amount'")
    expect(handoffSrc).toContain('Payment Note')
    expect(handoffSrc).toContain("'note'")
  })

  it('keeps iOS and desktop handoff behavior unchanged through checkoutUrl', () => {
    expect(handoffSrc).toContain('Browser.open({ url: targetUrl })')
    expect(handoffSrc).toContain("window.open(targetUrl, '_blank', 'noopener,noreferrer')")
    expect(handoffSrc).toContain('checkoutUrl')
  })
})
