import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Payment card canonical structure', () => {
  const content = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

  it('uses CreditCard icon in the header', () => {
    expect(content).toContain('<CreditCard className="h-4 w-4')
  })

  it('renders Tap to Pay / payment method badge in the header', () => {
    expect(content).toContain('getPaymentMethodBadge')
  })

  it('renders status badge in the header', () => {
    expect(content).toContain('getStatusColor(payment.status)')
    expect(content).toContain('getStatusLabel(payment.status)')
  })

  it('renders Amount row in the body', () => {
    expect(content).toContain('Amount')
    expect(content).toContain('formatCurrency(payment.amount_cents')
  })

  it('renders Description row in the body when present', () => {
    expect(content).toContain('getPaymentDescription(payment)')
  })

  it('renders Requested row with canonical date format', () => {
    expect(content).toContain('Requested')
    expect(content).toContain("month: 'short', day: 'numeric', year: 'numeric'")
  })

  it('renders canonical final-status row only when a timestamp exists', () => {
    expect(content).toContain('isFinalStatus')
    expect(content).toContain('finalTimestamp')
    expect(content).toContain('isFinalStatus && finalTimestamp')
  })

  it('reserves structural row space when no final timestamp exists', () => {
    expect(content).toContain('isFinalStatus && !finalTimestamp')
    expect(content).toContain('min-h-[1.25rem]')
  })

  it('never invents timestamps for final statuses', () => {
    // The final-status row should only render when finalTimestamp is truthy
    expect(content).toContain('{isFinalStatus && finalTimestamp && (')
  })

  it('uses a divider with consistent min height', () => {
    expect(content).toContain('border-t border-slate-700')
    expect(content).toContain('min-h-[2.25rem]')
  })

  it('shows edit icon only when semantically allowed (paid or pending)', () => {
    expect(content).toContain('canEdit')
    expect(content).toContain("payment.status === 'paid' || payment.status === 'pending'")
  })

  it('uses flex-col for consistent card height', () => {
    expect(content).toContain('flex flex-col')
  })

  it('uses flex-1 on the body to fill available space', () => {
    expect(content).toContain('space-y-1.5 text-xs flex-1')
  })
})
