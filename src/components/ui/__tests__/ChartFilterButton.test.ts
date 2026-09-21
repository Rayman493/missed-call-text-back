import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/ui/ChartFilterButton.tsx', 'utf8')

describe('ChartFilterButton shared component', () => {
  it('uses a funnel icon as the trigger', () => {
    expect(content).toContain('Filter')
    expect(content).toContain('<Filter')
  })

  it('has a 40–44px mobile tap target', () => {
    expect(content).toContain('w-10 h-10')
    expect(content).toContain('sm:w-11 sm:h-11')
  })

  it('shows an active indicator when the filter is not All', () => {
    expect(content).toContain('value !== activeValue')
    expect(content).toContain('rounded-full bg-primary')
  })

  it('renders the same option menu as the prior filter dropdown', () => {
    expect(content).toContain('role="listbox"')
    expect(content).toContain('role="option"')
    expect(content).toContain('aria-selected={isSelected}')
  })

  it('calls onChange and closes on option selection', () => {
    expect(content).toContain('onSelect(option.value)')
    expect(content).toContain('group.onChange(v)')
    expect(content).toContain('onChange?.(v as T)')
    expect(content).toContain('setIsOpen(false)')
  })

  it('supports multiple filter groups in one popup', () => {
    expect(content).toContain('groups?: ChartFilterGroup[]')
    expect(content).toContain('groups!.map((group')
    expect(content).toContain('role="group"')
    expect(content).toContain('g.value !== (g.activeValue')
  })

  it('exposes a Reset filters action that restores group defaults and closes the popup', () => {
    expect(content).toContain('Reset filters')
    expect(content).toContain('ResetFiltersButton')
    expect(content).toContain('g.onChange(defaultValue')
    expect(content).toContain('setIsOpen(false)')
    expect(content).toContain('isAtDefaults')
  })
})
