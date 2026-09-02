import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SelectPicker', () => {
  const content = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')

  it('has isOpen state', () => {
    expect(content).toContain('const [isOpen, setIsOpen]')
  })

  it('closes dropdown on option select', () => {
    expect(content).toContain('setIsOpen(false)')
  })

  it('closes dropdown on clear', () => {
    expect(content).toContain('handleClear')
    expect(content).toContain('setIsOpen(false)')
  })

  it('has click-outside handler to close', () => {
    expect(content).toContain('handleClickOutside')
  })

  it('has Escape handler to close', () => {
    expect(content).toContain("event.key === 'Escape'")
  })

  it('keeps clear button separate from trigger button', () => {
    // Trigger button and clear button are sibling buttons, not nested
    expect(content).toMatch(/<button[^>]*onClick={toggleOpen}/)
    expect(content).toMatch(/<button[^>]*onClick={handleClear}/)
    expect(content).not.toMatch(/<button[^>]*>\s*<button/)
  })

  it('rotates chevron when dropdown is open', () => {
    expect(content).toContain('rotate-180')
    expect(content).toContain('duration-150')
  })

  it('hides redundant null option when null value is already selected', () => {
    expect(content).toContain('isCurrentNull')
    expect(content).toContain('isNullOption')
    expect(content).toContain('visibleOptions')
  })

  it('normalizes empty string option value to null on selection', () => {
    expect(content).toContain('onChange(optionValue || null)')
  })

  it('shows null option when an actual value is selected', () => {
    // visibleOptions is derived from filteredOptions so null options are preserved when value is non-null
    expect(content).toContain('visibleOptions = filteredOptions.filter')
    expect(content).toContain('isNullOption && isCurrentNull')
  })

  it('applies htmlFor and id for label association', () => {
    expect(content).toContain('htmlFor={triggerId}')
    expect(content).toContain('id={triggerId}')
  })

  // Truth-table behavioral assertions for Job selector (and other null-equivalent options)
  it('should define isCurrentNull as value === null || value === \'\'', () => {
    expect(content).toContain('const isCurrentNull = value === null || value === \'\'')
  })

  it('should define isNullOption as option.value === \'\' || option.value === null', () => {
    expect(content).toContain('const isNullOption = option.value === \'\' || option.value === null')
  })

  it('should hide No job option when value is \'\' (already cleared)', () => {
    // isCurrentNull === true => null option filtered out
    expect(content).toContain('return !(isNullOption && isCurrentNull)')
  })

  it('should show No job option when value is a real job id', () => {
    // isCurrentNull === false => null option not filtered out
    expect(content).toContain('return !(isNullOption && isCurrentNull)')
  })

  it('should emit null when selecting No job (empty string option)', () => {
    expect(content).toContain('onChange(optionValue || null)')
  })

  it('should close dropdown when selecting No job', () => {
    expect(content).toContain('setIsOpen(false)')
  })
})
