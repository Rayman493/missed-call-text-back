import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pickerRow = readFileSync('src/components/ui/PickerListRow.tsx', 'utf8')
const customerSelect = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
const selectPicker = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')

describe('Picker row consistency', () => {
  it('renders primary, secondary, and tertiary lines with truncation', () => {
    expect(pickerRow).toContain('primary: string')
    expect(pickerRow).toContain('secondary?:')
    expect(pickerRow).toContain('tertiary?:')
    expect(pickerRow).toContain('truncate')
  })

  it('uses the same minimum height, padding, divider, and check zone', () => {
    expect(pickerRow).toContain('min-h-[44px]')
    expect(pickerRow).toContain('px-3')
    expect(pickerRow).toContain('py-2.5')
    expect(pickerRow).toContain('border-b')
    expect(pickerRow).toContain('last:border-b-0')
    expect(pickerRow).toContain('<Check')
  })
})

describe('Picker dropdown opaque surface', () => {
  it('uses a solid theme background in the customer picker', () => {
    expect(customerSelect).toContain('bg-background')
    expect(customerSelect).not.toContain('bg-popover/95')
  })

  it('uses a stronger but restrained shadow', () => {
    expect(customerSelect).toContain('shadow-xl')
    expect(customerSelect).toContain('shadow-black/10')
  })

  it('keeps a subtle border', () => {
    expect(customerSelect).toContain('border border-border/70')
  })

  it('uses a solid theme background in the shared SelectPicker', () => {
    expect(selectPicker).toContain('bg-background')
    expect(selectPicker).not.toContain('bg-popover/95')
  })

  it('keeps dropdown sizing and touch behavior intact', () => {
    expect(customerSelect).toContain('overflow-y-auto')
    expect(customerSelect).toContain('overscroll-contain')
    expect(customerSelect).toContain('touch-pan-y')
  })
})
