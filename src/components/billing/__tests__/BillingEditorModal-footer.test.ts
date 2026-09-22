import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/billing/BillingEditorModal.tsx', 'utf8')

describe('Billing editor footer family', () => {
  it('keeps all four actions in a single row', () => {
    // One-row contract: [Preview icon] [Cancel] [Create Draft] [Create & Send]
    expect(content).toContain('flex items-center gap-1.5 sm:gap-2')
    expect(content).not.toContain('flex-col-reverse')
    const footer = content.slice(content.indexOf('const footer = ('))
    expect(footer.indexOf('handlePreview')).toBeLessThan(footer.indexOf('handleAttemptClose'))
    expect(footer.indexOf('handleAttemptClose')).toBeLessThan(footer.indexOf('handleSaveDraft(false)'))
    expect(footer.indexOf('handleSaveDraft(false)')).toBeLessThan(footer.indexOf('setShowCreateAndSendConfirm'))
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
