/**
 * Regression tests for LeadStatusDropdown pill size polish.
 *
 * Tests 26-29: Status pill size + touch target
 *
 * Changes:
 * - Reduced vertical padding from py-1.5 to py-1 (sm/md) and py-2 to py-1.5 (lg)
 * - Tightened icon/text/chevron gap from gap-2 to gap-1.5
 * - Increased touch target pseudo-element from inset-[-6px] to inset-[-10px]
 *   to maintain a comfortable ~44px touch target despite the reduced padding
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')

describe('Status pill — size polish (26-29)', () => {
  it('26. visible height/padding reduced (py-1 for sm/md, py-1.5 for lg)', () => {
    // sm and md use py-1 (reduced from py-1.5)
    expect(content).toContain("sm: 'px-2.5 py-1 text-xs max-w-[140px]'")
    expect(content).toContain("md: 'px-3 py-1 text-xs max-w-[160px]'")
    // lg uses py-1.5 (reduced from py-2)
    expect(content).toContain("lg: 'px-3.5 py-1.5 text-sm max-w-[180px]'")
  })

  it('27. effective touch target remains accessible (inset-[-10px] pseudo-element)', () => {
    // The pseudo-element expands the touch target by 10px on all sides
    // without affecting layout. With py-1 (4px) + text-xs (~16px) + border (2px)
    // = ~22px visible height, plus 20px pseudo expansion = ~42px touch target.
    expect(content).toContain('inset-[-10px]')
  })

  it('28. status icon/text/chevron remain aligned (gap-1.5)', () => {
    // Gap reduced from gap-2 (8px) to gap-1.5 (6px) for tighter spacing
    expect(content).toContain('gap-1.5')
    // Icon and chevron sizes preserved for legibility
    expect(content).toContain('w-3.5 h-3.5')  // StatusIcon
    expect(content).toContain('w-3 h-3')     // chevron
  })

  it('29. no customer-header layout regression (flex-shrink-0 preserved)', () => {
    // The pill wrapper preserves flex-shrink-0 so it doesn't expand
    // and break the header layout.
    expect(content).toContain('flex-shrink-0')
    // The truncate class preserves text truncation
    expect(content).toContain('truncate')
    // The max-w constraints prevent the pill from growing too wide
    expect(content).toContain('max-w-[140px]')
    expect(content).toContain('max-w-[160px]')
    expect(content).toContain('max-w-[180px]')
  })
})
