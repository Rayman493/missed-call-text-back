import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Customer Payment Summary -> View in Payments navigation', () => {
  it('uses the native-safe window.location.assign instead of next/router for the customer Payments link', () => {
    const paymentsSection = content.split('{/* Payment Requests */}')[1]?.split('{/* Appointments */}')[0] || ''
    expect(paymentsSection).toContain("window.location.assign('/dashboard/payments')")
    expect(paymentsSection).not.toContain('href="/dashboard/payments"')
  })

  it('clears any open payment overview modal before navigating', () => {
    expect(content).toMatch(/setShowPaymentOverviewModal\(false\)[\s\S]*?window\.location\.assign\('\/dashboard\/payments'\)/)
  })
})
