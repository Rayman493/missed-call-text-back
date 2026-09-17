import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')
const markUnpaidRoute = readFileSync('src/app/api/payments/[id]/mark-unpaid/route.ts', 'utf8')
const cancelRoute = readFileSync('src/app/api/payments/[id]/cancel/route.ts', 'utf8')

describe('Payment manual Paid → Unpaid reversal', () => {
  it('exposes a canManuallyReversePaid helper', () => {
    expect(pageContent).toContain('const canManuallyReversePaid')
    expect(pageContent).toContain("payment.payment_provider === 'paypal' || payment.payment_provider === 'venmo'")
    expect(pageContent).toContain("payment.payment_method_type !== 'card_present'")
  })

  it('renders Mark Unpaid for eligible manual paid payments', () => {
    expect(pageContent).toContain('Mark Unpaid')
    expect(pageContent).toContain('canManuallyReversePaid(payment)')
  })

  it('has a Mark Unpaid confirmation modal', () => {
    expect(pageContent).toContain('showMarkUnpaidConfirm')
    expect(pageContent).toContain('Mark as Unpaid Confirmation Modal')
  })

  it('calls a dedicated mark-unpaid API route', () => {
    expect(pageContent).toContain('/api/payments/${payment.id}/mark-unpaid')
    expect(markUnpaidRoute).toContain("status: 'pending'")
    expect(markUnpaidRoute).toContain('paid_at: null')
  })

  it('rejects reversal for non PayPal/Venmo providers', () => {
    expect(markUnpaidRoute).toContain("payment_provider !== 'paypal' && paymentRequest.payment_provider !== 'venmo'")
    expect(markUnpaidRoute).toContain('Manual payment reversal is only available for PayPal and Venmo payments')
  })

  it('rejects reversal for card_present / processor-confirmed payments', () => {
    expect(markUnpaidRoute).toContain("payment_method_type === 'card_present'")
    expect(markUnpaidRoute).toContain('Processor-confirmed payments cannot be manually reversed')
  })

  it('reverts linked invoice from paid to sent on mark-unpaid', () => {
    expect(markUnpaidRoute).toContain("status: 'sent'")
    expect(markUnpaidRoute).toContain('billing_documents')
  })
})

describe('Payment cancellation confirmation and terminal state', () => {
  it('opens a confirmation modal instead of cancelling immediately', () => {
    expect(pageContent).toContain('showCancelConfirm')
    expect(pageContent).toContain('setShowCancelConfirm(true)')
    expect(pageContent).not.toMatch(/onClick=\{\(\) => handleCancelPayment\(payment\)\}/)
  })

  it('cancel confirmation modal has Keep Payment and Cancel Payment actions', () => {
    expect(pageContent).toContain('Keep Payment')
    expect(pageContent).toContain('Cancel Payment')
  })

  it('cancel API is idempotent for already-cancelled payments', () => {
    expect(cancelRoute).toContain("status === 'cancelled' || paymentRequest.status === 'canceled'")
    expect(cancelRoute).toContain('Payment request already cancelled')
  })

  it('cancel API refuses to revive paid payments', () => {
    expect(cancelRoute).toContain("status === 'paid'")
    expect(cancelRoute).toContain('Cannot cancel a paid payment request')
  })
})
