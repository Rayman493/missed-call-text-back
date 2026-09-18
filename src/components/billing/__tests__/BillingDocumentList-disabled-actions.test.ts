import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/billing/BillingDocumentList.tsx', 'utf8')

describe('BillingDocumentList disabled action explanations', () => {
  it('renders disabled slots as non-submit buttons that still receive clicks', () => {
    expect(content).toContain('disabledByEligibility')
    expect(content).toContain('showToast')
    expect(content).toContain('type="button"')
    expect(content).not.toMatch(/disabledByEligibility[\s\S]{0,500}disabled=/s)
  })

  it('provides specific reasons for disabled Edit, Send, Convert, and Delete', () => {
    expect(content).toContain("Sent quotes can't be edited.")
    expect(content).toContain("Sent invoices can't be edited.")
    expect(content).toContain('This quote has already been accepted.')
    expect(content).toContain('This quote already has an invoice.')
    expect(content).toContain("Sent documents can't be deleted.")
  })

  it('keeps the six-slot action grid in a predictable order', () => {
    expect(content).toContain("key: 'edit'")
    expect(content).toContain("key: 'send'")
    expect(content).toContain("key: 'convert'")
    expect(content).toContain("key: 'download'")
    expect(content).toContain("key: 'view'")
    expect(content).toContain("key: 'delete'")
    expect(content).toContain('grid grid-cols-6')
  })
})
