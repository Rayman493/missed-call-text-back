import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const root = 'C:\\Users\\Drago\\CascadeProjects\\windsurf-project-2'

const paymentsPage = readFileSync(`${root}/src/app/dashboard/payments/page.tsx`, 'utf8')
const customerPage = readFileSync(`${root}/src/app/dashboard/leads/[id]/page-client.tsx`, 'utf8')
const paymentBadge = readFileSync(`${root}/src/lib/payment-method-badge.tsx`, 'utf8')

describe('Batch 2C — Payment detail reuse', () => {
  it('uses the same canonical PaymentEditModal on the Payments page', () => {
    expect(paymentsPage).toContain("import PaymentEditModal from '@/components/payments/PaymentEditModal'")
    expect(paymentsPage).toContain('<PaymentEditModal')
  })

  it('uses the same canonical PaymentEditModal on the customer detail page', () => {
    expect(customerPage).toContain("import PaymentEditModal from '@/components/payments/PaymentEditModal'")
    expect(customerPage).toContain('<PaymentEditModal')
  })

  it('shares getPaymentMethodBadge between both pages', () => {
    expect(paymentBadge).toContain('export function getPaymentMethodBadge')
    expect(paymentsPage).toContain('getPaymentMethodBadge')
    expect(customerPage).toContain('getPaymentMethodBadge')
  })

  it('does not create a new payment detail modal for the customer page', () => {
    expect(customerPage).not.toContain('PaymentDetailModal')
    expect(customerPage).not.toContain('PaymentViewModal')
  })
})
