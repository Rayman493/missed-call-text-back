import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/payments/PaymentActionBar.tsx', 'utf8')
const pageContent = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

describe('Failed payment safe metadata edit eligibility', () => {
  it('allows Edit for pending, paid, failed, and cancelled statuses', () => {
    expect(pageContent).toContain("['pending', 'paid', 'failed', 'cancelled'].includes(payment.status)")
  })

  it('explains why Edit is unavailable for unsupported statuses', () => {
    expect(content).toContain("Only pending, paid, failed, or cancelled payments can be renamed.")
  })

  it('keeps Edit in a fixed slot', () => {
    expect(content).toContain("{ key: 'edit'")
  })
})
