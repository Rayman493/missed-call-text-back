import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('LeadStatusDropdown compact mobile status control', () => {
  const content = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')

  it('truncates long status labels inside a compact max-width trigger', () => {
    expect(content).toContain('truncate')
    expect(content).toContain('max-w-[')
  })

  it('keeps the longest canonical status label in the menu options', () => {
    // Payment Requested is the longest canonical label and must be present in the
    // rendered dropdown items so it does not silently disappear from the control.
    expect(content).toContain('payment_requested')
  })
})
