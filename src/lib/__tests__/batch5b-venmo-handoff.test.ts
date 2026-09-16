import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const handoffSrc = readFileSync('src/components/PaymentHandoff.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Batch 5 — Venmo Android generic app handoff', () => {
  it('detects native Android specifically for Venmo', () => {
    expect(handoffSrc).toMatch(/Capacitor\.getPlatform\(\)\s*===\s*['"]android['"]/)
  })

  it('does NOT generate or use /u/{username} on Android', () => {
    expect(handoffSrc).not.toMatch(/venmo\.com\/u\/\$\{[^}]+\}/)
  })

  it('opens the generic Venmo origin for Android native', () => {
    expect(handoffSrc).toMatch(/['"]https:\/\/venmo\.com['"]\s*:/)
    expect(handoffSrc).toMatch(/'https:\/\/venmo\.com'/)
  })

  it('keeps the Venmo username visible and copyable', () => {
    expect(handoffSrc).toContain('@{venmoUsername}')
    expect(handoffSrc).toContain('venmoUsername')
  })

  it('keeps the amount visible and copyable', () => {
    expect(handoffSrc).toContain('{formattedAmount}')
    expect(handoffSrc).toContain("'amount'")
  })

  it('keeps the payment note visible and copyable', () => {
    expect(handoffSrc).toContain('Payment Note')
    expect(handoffSrc).toContain("'note'")
  })

  it('preserves fallback instructions if the app cannot open', () => {
    expect(handoffSrc).toMatch(/If\s+\{providerName\}\s+doesn'?t\s+open|doesn&rsquo;t open/)
    expect(handoffSrc).toContain('Open Venmo manually')
  })

  it('bounds the opening/loading state to a reset timer', () => {
    expect(handoffSrc).toMatch(/setTimeout\(\(\)\s*=>\s*setOpening\(false\),\s*2500\)/)
  })

  it('does not change iOS and web handoff behavior', () => {
    // iOS / web still use the real checkoutUrl when present.
    expect(handoffSrc).toMatch(/checkoutUrl\s*\|\|/)
    expect(handoffSrc).toMatch(/Browser\.open\(\{\s*url\s*\}\)/)
    expect(handoffSrc).toMatch(/window\.open\(url,/)
  })

  it('catches open failures without breaking the payment page', () => {
    expect(handoffSrc).toContain('try {')
    expect(handoffSrc).toContain('} catch (e) {')
    expect(handoffSrc).toContain('console.error(`[${providerName} HANDOFF] Failed to open:`, e)')
  })
})
