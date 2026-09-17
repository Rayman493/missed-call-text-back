import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const page = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

describe('Customer Detail preview cards and payment overview', () => {
  it('uses a shared CustomerDetailPreviewCard component for preview rows', () => {
    expect(page).toContain("import CustomerDetailPreviewCard from '@/components/ui/CustomerDetailPreviewCard'")
    expect(page).toContain('<CustomerDetailPreviewCard')
  })

  it('opens the read-only PaymentOverviewModal when a payment card is tapped', () => {
    expect(page).toContain("import PaymentOverviewModal from '@/components/payments/PaymentOverviewModal'")
    expect(page).toContain('handleOpenPaymentOverview')
    expect(page).toContain('<PaymentOverviewModal')
  })

  it('does not open the payment edit modal from customer payment cards', () => {
    expect(page).not.toContain('PaymentEditModal')
    expect(page).not.toContain('handleOpenPaymentEdit')
  })

  it('tracks the overview modal in the shared customer-page scroll guard', () => {
    expect(page).toContain('showPaymentOverviewModal')
  })
})
