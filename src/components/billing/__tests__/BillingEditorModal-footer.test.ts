import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/billing/BillingEditorModal.tsx', 'utf8')

describe('Billing editor footer family', () => {
  it('groups primary and secondary actions into distinct rows', () => {
    expect(content).toContain('Secondary row')
    expect(content).toContain('Primary row')
  })

  it('uses a consistent button height within footer rows', () => {
    expect(content).toContain('h-11')
  })

  it('keeps Create & Send visually strongest', () => {
    expect(content).toContain('Create & Send')
    expect(content).toContain('bg-blue-600 hover:bg-blue-700')
  })

  it('keeps secondary actions with muted styling', () => {
    expect(content).toContain('Preview')
    expect(content).toContain('Cancel')
    expect(content).toContain('text-muted-foreground hover:text-foreground')
  })
})

describe('Send confirmation hierarchy', () => {
  it('uses a clear send-to-customer title', () => {
    expect(content).toContain('Send ${isInvoice ? \'invoice\' : \'quote\'} to customer?')
  })

  it('renders a compact summary block with customer and amount', () => {
    expect(content).toContain('rounded-lg border border-border/50 bg-muted/30 p-3')
    expect(content).toContain('customerName')
    expect(content).toContain('formatCurrency(total, true)')
  })

  it('makes the amount the strongest value', () => {
    expect(content).toContain('text-lg font-semibold text-foreground')
  })

  it('balances primary and secondary footer buttons', () => {
    expect(content).toContain('flex-1 h-10 px-4')
  })
})
