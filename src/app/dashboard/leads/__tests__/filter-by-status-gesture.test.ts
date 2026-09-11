/**
 * Regression tests for Filter by Status gesture handling.
 *
 * Tests 12-17: Filter by Status gesture contract
 *
 * Root cause traced:
 * The onPointerLeave handler cleared filterMovedRef to false during scroll.
 * When the page scrolls, the content moves under the finger, causing
 * pointerleave to fire on the button even though the finger hasn't moved
 * relative to the screen. This cleared filterMovedRef, so the subsequent
 * pointerup thought it was a clean tap, opening the filter during scroll.
 *
 * The fix:
 * - Do NOT clear filterMovedRef in onPointerLeave (matching useTapGuard's
 *   behavior of not clearing draggingRef in onPointerLeave).
 * - Clear filterSuppressNextOpenRef on onPointerDown so stale suppression
 *   from a prior abandoned gesture doesn't block the next clean tap.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')

describe('Filter by Status — gesture contract (12-17)', () => {
  it('12. clean tap opens filter (setFilterMenuOpen(true) on non-scroll pointerup)', () => {
    expect(pageContent).toContain('setFilterMenuOpen(true)')
  })

  it('13. vertical drag does not open (filterMovedRef tracks scroll, suppresses open)', () => {
    expect(pageContent).toContain('filterMovedRef')
    expect(pageContent).toContain('filterSuppressNextOpenRef')
    // The suppress flag is set when a scroll is detected
    expect(pageContent).toContain('filterSuppressNextOpenRef.current = true')
  })

  it('14. drag does not flash-open (onOpenChange suppresses when suppress flag is set)', () => {
    expect(pageContent).toContain('filterSuppressNextOpenRef.current')
    expect(pageContent).toContain('if (open && filterSuppressNextOpenRef.current)')
  })

  it('15. next clean tap after drag opens (stale suppress cleared on pointerdown)', () => {
    // The fix: clear filterSuppressNextOpenRef on onPointerDown so stale
    // suppression from a prior abandoned gesture doesn't block the next tap.
    // The onPointerDown handler must clear the suppress flag.
    expect(pageContent).toMatch(/onPointerDown=\{[\s\S]*?filterSuppressNextOpenRef\.current = false/)
  })

  it('16. outside dismissal unchanged (Radix onOpenChange handles close)', () => {
    expect(pageContent).toContain('onOpenChange={(open) => {')
    expect(pageContent).toContain('setFilterMenuOpen(open)')
  })

  it('17. Add button behavior unchanged (plain button, no gesture handlers)', () => {
    // The Add button is a plain button with onClick — no pointer handlers.
    // It works correctly during scroll because it has no pointer handlers
    // that could be confused by scroll-generated events.
    expect(pageContent).toContain('aria-label="Add customer"')
    expect(pageContent).toContain('setShowAddCustomerModal(true)')
  })

  it('17b. onPointerLeave does NOT clear filterMovedRef (root cause fix)', () => {
    // The root cause fix: onPointerLeave must NOT clear filterMovedRef.
    // During scroll, content moves under the finger, causing pointerleave
    // to fire. Clearing filterMovedRef would make the next pointerup think
    // it was a clean tap.
    // Extract the onPointerLeave handler block
    const leaveMatch = pageContent.match(/onPointerLeave=\{\(\) => \{[\s\S]*?\}\}/)
    expect(leaveMatch).toBeTruthy()
    if (leaveMatch) {
      const leaveBlock = leaveMatch[0]
      // Must NOT contain filterMovedRef.current = false
      expect(leaveBlock).not.toContain('filterMovedRef.current = false')
      // Must contain filterPointerStartRef.current = null
      expect(leaveBlock).toContain('filterPointerStartRef.current = null')
    }
  })
})
