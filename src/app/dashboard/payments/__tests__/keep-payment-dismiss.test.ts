import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/payments/page.tsx', 'utf8')

describe('Keep Payment pure dismiss', () => {
  it('calls suppressNextHistoryBackCleanup before dismissing the cancel confirmation', () => {
    expect(content).toContain('suppressNextHistoryBackCleanup')
    const keepMatch = content.match(/onClick=\{\(\) => \{\s*suppressNextHistoryBackCleanup\(\)\s*setShowCancelConfirm\(false\)\s*setPaymentToCancel\(null\)/)
    expect(keepMatch).toBeTruthy()
  })

  it('dismiss sets only confirmation state (no router.refresh or fetch)', () => {
    const keepMatch = content.match(/onClick=\{\(\) => \{\s*suppressNextHistoryBackCleanup\(\)\s*setShowCancelConfirm\(false\)\s*setPaymentToCancel\(null\)\s*\}/)
    expect(keepMatch).toBeTruthy()
    const block = keepMatch ? keepMatch[0] : ''
    expect(block).not.toContain('router.refresh')
    expect(block).not.toContain('refetch')
  })

  it('does not cancel the payment when keeping', () => {
    const keepMatch = content.match(/onClick=\{\(\) => \{\s*suppressNextHistoryBackCleanup\(\)\s*setShowCancelConfirm\(false\)\s*setPaymentToCancel\(null\)\s*\}/)
    expect(keepMatch).toBeTruthy()
    const block = keepMatch ? keepMatch[0] : ''
    expect(block).not.toContain('handleCancelPayment')
  })
})
