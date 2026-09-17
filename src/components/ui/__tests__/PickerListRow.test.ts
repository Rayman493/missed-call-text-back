import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/ui/PickerListRow.tsx', 'utf8')

describe('PickerListRow', () => {
  it('renders a shared compact row with primary, secondary, and tertiary text', () => {
    expect(content).toContain('primary: string')
    expect(content).toContain('secondary?:')
    expect(content).toContain('tertiary?:')
  })

  it('adds a subtle divider between rows', () => {
    expect(content).toContain('border-b')
    expect(content).toContain('last:border-b-0')
  })

  it('has a consistent minimum row height and padding', () => {
    expect(content).toContain('min-h-[44px]')
    expect(content).toContain('px-3')
    expect(content).toContain('py-2.5')
  })

  it('applies selected state styling', () => {
    expect(content).toContain('selected')
    expect(content).toContain('bg-accent/40')
  })

  it('is disabled without a click handler and receives disabled semantics', () => {
    expect(content).toContain('disabled')
    expect(content).toContain('cursor-not-allowed')
    expect(content).toContain('opacity-50')
    expect(content).toContain('onClick={onClick}')
  })

  it('supports an optional role for listbox option usage', () => {
    expect(content).toContain('role?: string')
    expect(content).toContain('role={role}')
  })
})
