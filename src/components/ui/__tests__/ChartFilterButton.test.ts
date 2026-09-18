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
    expect(content).toContain('onChange(option.value)')
    expect(content).toContain('setIsOpen(false)')
  })
})
