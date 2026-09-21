import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const handoffSrc = readFileSync('src/components/PaymentHandoff.tsx', 'utf8').replace(/\r\n/g, '\n')
const linksSrc = readFileSync('src/lib/payment-links.ts', 'utf8').replace(/\r\n/g, '\n')
const webmanifestSrc = readFileSync('public/site.webmanifest', 'utf8').replace(/\r\n/g, '\n')

describe('Venmo/PayPal handoff — instruction page (no app launch)', () => {
  it('PWA manifest scopes the WebAPK to /dashboard/ so public /pay stays in the browser', () => {
    expect(webmanifestSrc).toContain('"scope": "/dashboard/"')
    expect(webmanifestSrc).toContain('"start_url": "/dashboard"')
  })

  it('preserves the targeted Venmo recipient URL generation in payment-links', () => {
    expect(linksSrc).toContain('https://venmo.com/u/${encodeURIComponent(normalized)}')
  })

  it('does NOT launch the native app or deep-link out of the page', () => {
    expect(handoffSrc).not.toContain('Browser.open(')
    expect(handoffSrc).not.toContain('window.open(')
    expect(handoffSrc).not.toContain('Capacitor.isNativePlatform')
    expect(handoffSrc).not.toContain('@capacitor/')
    expect(handoffSrc).not.toContain('openProvider')
    expect(handoffSrc).not.toContain('setOpening')
  })

  it('has no app-launch CTA label', () => {
    expect(handoffSrc).not.toContain('Open {providerName}')
    expect(handoffSrc).not.toContain('Opening {providerName}')
    expect(handoffSrc).not.toMatch(/<a[^>]*href=\{?(checkoutUrl|targetUrl)/)
  })

  it('shows numbered how-to-pay instructions', () => {
    expect(handoffSrc).toContain('How to pay with {providerName}')
    expect(handoffSrc).toContain('Open Venmo on your phone')
    expect(handoffSrc).toContain('Open PayPal (app or paypal.com)')
    expect(handoffSrc).toContain('Send ${formattedAmount}')
    expect(handoffSrc).toContain('as the payment note')
  })

  it('does not imply automatic payment confirmation', () => {
    expect(handoffSrc).toContain('will confirm your payment once it arrives')
    expect(handoffSrc).not.toContain('automatically confirmed')
  })

  it('keeps recipient, amount, and note visible and copyable', () => {
    // Recipient renders through the canonical handle helper so a stored value
    // that already carries @ can never produce a double-@ display.
    expect(handoffSrc).toContain('canonicalProviderHandle(venmoUsername)')
    expect(handoffSrc).toContain('canonicalProviderHandle(paypalHandle)')
    expect(handoffSrc).not.toContain('@{venmoUsername}')
    expect(handoffSrc).not.toContain('@{paypalHandle}')
    expect(handoffSrc).toContain("'amount'")
    expect(handoffSrc).toContain('Payment Note')
    expect(handoffSrc).toContain("'note'")
    expect(handoffSrc).toContain('copyToClipboard')
  })

  it('does not surface AI-intake placeholders as a payment note', () => {
    expect(handoffSrc).toContain('isPlaceholderValue(description)')
  })

  it('fails safely when the Venmo username is invalid/missing', () => {
    expect(linksSrc).toContain("if (!normalized) {")
    expect(linksSrc).toContain("error: 'Invalid Venmo username'")
  })
})
