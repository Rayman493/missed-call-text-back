import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/payments/PaymentOverviewModal.tsx', 'utf8')

describe('PaymentOverview → Payments link', () => {
  it('uses next/link for reliable native WebView navigation', () => {
    expect(content).toContain("import Link from 'next/link'")
    expect(content).toContain('href="/dashboard/payments"')
  })

  it('renders a secondary "View in Payments" link', () => {
    expect(content).toContain('View in Payments')
    expect(content).toContain('→')
  })

  it('closes the modal when the link is activated', () => {
    expect(content).toMatch(/<Link[\s\S]*?onClick=\{onClose\}[\s\S]*?View in Payments/)
  })

  it('reads visually as a link (primary color + underline affordance)', () => {
    expect(content).toContain('text-primary')
    expect(content).toContain('hover:underline')
    expect(content).not.toContain('text-muted-foreground hover:text-foreground')
  })
})
