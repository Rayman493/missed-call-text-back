import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/payments/PaymentOverviewModal.tsx', 'utf8')

describe('PaymentOverview → Payments navigation', () => {
  it('uses window.location.assign for reliable native WebView navigation', () => {
    expect(content).not.toContain("import Link from 'next/link'")
    expect(content).toContain("window.location.assign('/dashboard/payments')")
  })

  it('renders a secondary "View in Payments" control', () => {
    expect(content).toContain('View in Payments')
    expect(content).toContain('→')
  })

  it('closes the modal then navigates to /dashboard/payments', () => {
    expect(content).toMatch(/onClose\(\)[\s\S]*?window\.location\.assign\('\/dashboard\/payments'\)/)
  })

  it('suppresses the modal synthetic history cleanup before navigating', () => {
    // Without this, useModalBackButton's cleanup calls history.back() and
    // races the pending navigation — the native bounce-back root cause.
    expect(content).toContain('suppressNextHistoryBackCleanup')
    expect(content).toMatch(/suppressNextHistoryBackCleanup\(\)[\s\S]*?onClose\(\)[\s\S]*?window\.location\.assign/)
  })

  it('reads visually as a link (primary color + underline affordance)', () => {
    expect(content).toContain('text-primary')
    expect(content).toContain('hover:underline')
    expect(content).not.toContain('text-muted-foreground hover:text-foreground')
  })
})
