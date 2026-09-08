import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('SelectPicker icon layout', () => {
  const content = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')

  it('E: X and chevron render in separate slots with a shared right container', () => {
    expect(content).toContain('absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1')
    expect(content).toContain('pointer-events-none')
    expect(content).toContain('pointer-events-auto')
    // X has its own click target
    expect(content).toMatch(/<button[^>]*onClick={handleClear}/)
    // Chevron is not a button and is visually separate
    expect(content).toMatch(/<ChevronDown className=/)
    // No overlapping absolute right-* positioning on individual icons
    expect(content).not.toContain('absolute right-3 top-1/2')
    expect(content).not.toContain('absolute right-10')
  })

  it('F: selected value text truncates and reserves room for icons on narrow widths', () => {
    // Right padding reserves room for both icons when a value is selected
    expect(content).toContain('pr-14')
    expect(content).toContain('pr-10')
    // The label text uses flex-1 min-w-0 so it truncates instead of overlapping
    expect(content).toContain('truncate flex-1 min-w-0')
  })
})
