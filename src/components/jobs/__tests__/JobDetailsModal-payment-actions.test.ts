import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')

describe('JobDetailsModal payment section is informational only', () => {
  it('does not render Request Payment or Tap to Pay action buttons', () => {
    expect(content).not.toContain('Request Payment')
    expect(content).not.toContain('Create new payment request')
    expect(content).not.toContain('setShowPaymentModal(true)')
    expect(content).not.toContain('setShowTapToPayModal(true)')
  })

  it('does not import the payment action modals', () => {
    expect(content).not.toContain("import RequestPaymentModal")
    expect(content).not.toContain("import TapToPayModal")
  })

  it('keeps informational payment display (status/amount/method)', () => {
    expect(content).toContain('No payments yet')
    expect(content).toContain('Payment')
    expect(content).toContain('getPaymentStatusColor')
    expect(content).toContain('getPaymentStatusLabel')
  })
})
