import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/ui/CustomerDetailPreviewCard.tsx', 'utf8')

describe('CustomerDetailPreviewCard', () => {
  it('uses a consistent minimum height and padding across all preview cards', () => {
    expect(content).toContain('min-h-[52px]')
    expect(content).toContain('p-3')
    expect(content).toContain('bg-muted/40')
  })

  it('aligns title and subtitle in a compact vertical rhythm', () => {
    expect(content).toContain('text-sm font-medium text-foreground')
    expect(content).toContain('text-xs text-muted-foreground/80')
  })

  it('reserves a fixed zone for the optional status badge', () => {
    expect(content).toContain('flex-shrink-0 ml-2')
    expect(content).toContain('badge')
  })

  it('is keyboard-accessible when clickable', () => {
    expect(content).toContain('role={onClick ? \'button\' : undefined}')
    expect(content).toContain('tabIndex={onClick ? 0 : undefined}')
    expect(content).toContain("e.key === 'Enter' || e.key === ' '")
  })
})
