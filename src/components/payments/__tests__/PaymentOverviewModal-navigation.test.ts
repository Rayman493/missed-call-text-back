import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/payments/PaymentOverviewModal.tsx', 'utf8')

describe('PaymentOverview → Payments link', () => {
  it('imports useRouter for navigation', () => {
    expect(content).toContain("import { useRouter } from 'next/navigation'")
  })

  it('renders a secondary "View in Payments" link/button', () => {
    expect(content).toContain('View in Payments')
    expect(content).toContain('→')
  })

  it('closes the modal then navigates to /dashboard/payments', () => {
    expect(content).toMatch(/onClose\(\)[\s\S]*?router\.push\('\/dashboard\/payments'\)/)
  })

  it('uses muted secondary styling', () => {
    expect(content).toContain('text-muted-foreground hover:text-foreground')
  })
})
