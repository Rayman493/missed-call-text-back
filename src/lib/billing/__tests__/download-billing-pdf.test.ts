import { describe, it, expect } from 'vitest'
import { getBillingPdfFilename } from '../download-billing-pdf'

describe('Billing PDF delivery helpers', () => {
  it('produces a safe quote filename with .pdf', () => {
    const name = getBillingPdfFilename('Q-1001 / draft', 'quote')
    expect(name).toBe('Quote-Q-1001draft.pdf')
    expect(name.endsWith('.pdf')).toBe(true)
  })

  it('produces a safe invoice filename with .pdf', () => {
    const name = getBillingPdfFilename('INV-#1002', 'invoice')
    expect(name).toBe('Invoice-INV-1002.pdf')
    expect(name.endsWith('.pdf')).toBe(true)
  })

  it('strips unsafe characters while preserving dashes and underscores', () => {
    const name = getBillingPdfFilename('Q-1001!@#$%^&*()', 'quote')
    expect(name).toBe('Quote-Q-1001.pdf')
  })
})
