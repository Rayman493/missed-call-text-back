import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/payments/PaymentOverviewModal.tsx', 'utf8')

describe('PaymentOverviewModal', () => {
  it('uses the shared Modal component', () => {
    expect(content).toContain("import Modal from '@/components/ui/Modal'")
    expect(content).toContain('<Modal')
  })

  it('renders read-only fields and does not expose edit controls', () => {
    expect(content).toContain('amount_cents')
    expect(content).toContain('payment_provider')
    expect(content).toContain('status')
    expect(content).toContain('description')
    expect(content).toContain('created_at')
    expect(content).not.toContain('onSave')
    expect(content).not.toContain('Save Changes')
    expect(content).not.toContain('Cancel Payment')
    expect(content).not.toContain('useState')
  })

  it('displays formatted amount and status badge', () => {
    expect(content).toContain('formatCurrency(payment.amount_cents / 100)')
    expect(content).toContain('getEffectivePaymentStatusStyle(payment)')
    expect(content).toContain('statusStyle.badgeClass')
  })

  it('only renders linked context when the data is present', () => {
    expect(content).toContain('payment.leads?.contact_name')
    expect(content).toContain('payment.jobs?.title')
    expect(content).toContain('payment.invoices?.document_number')
  })
})
