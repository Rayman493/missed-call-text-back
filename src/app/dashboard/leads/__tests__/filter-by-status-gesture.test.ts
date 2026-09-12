/**
 * Regression tests for Filter by Status gesture handling.
 *
 * Tests 12-18: Filter by Status gesture contract
 *
 * Root cause traced (initial):
 * The onPointerLeave handler cleared filterMovedRef to false during scroll.
 * When the page scrolls, the content moves under the finger, causing
 * pointerleave to fire on the button even though the finger hasn't moved
 * relative to the screen. This cleared filterMovedRef, so the subsequent
 * pointerup thought it was a clean tap, opening the filter during scroll.
 *
 * Root cause traced (Android physical QA):
 * onPointerUp directly called setFilterMenuOpen(true) for taps. On Android
 * WebView, pointerup can fire before touchmove sets the drag flag, so the
 * filter opened during scroll. Also, onPointerCancel cleared the suppress
 * flag, so if click fired after pointercancel (some Android devices), the
 * filter opened.
 *
 * The fix:
 * - Move the opening decision from onPointerUp to onClick (fires AFTER all
 *   touch events, so onTouchMove has already set the suppress flag).
 * - In onPointerCancel, KEEP the suppress flag if a drag was detected
 *   (don't clear it) so the subsequent click is blocked.
 * - onPointerUp only sets the suppress flag if a drag was detected; it
 *   does NOT open the menu.
 * - onClick opens the menu for clean taps and blocks for drags.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')

describe('Filter by Status — gesture contract (12-18)', () => {
  it('12. clean tap opens filter (setFilterMenuOpen(true) in onClick, not onPointerUp)', () => {
    expect(pageContent).toContain('setFilterMenuOpen(true)')
    // The opening must be in onClick, not in onPointerUp
    const pointerUpMatch = pageContent.match(/onPointerUp=\{\(e\) => \{[\s\S]*?\}\}/)
    expect(pointerUpMatch).toBeTruthy()
    if (pointerUpMatch) {
      // onPointerUp must NOT contain setFilterMenuOpen(true)
      expect(pointerUpMatch[0]).not.toContain('setFilterMenuOpen(true)')
    }
    // onClick must contain setFilterMenuOpen(true)
    const clickMatch = pageContent.match(/onClick=\{\(e\) => \{[\s\S]*?setFilterMenuOpen\(true\)[\s\S]*?\}\}/)
    expect(clickMatch).toBeTruthy()
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

  it('18. onPointerCancel keeps suppress flag if drag was detected (Android fix)', () => {
    // The Android fix: onPointerCancel must NOT clear the suppress flag
    // if a drag was detected. Some Android devices fire click after
    // pointercancel, and the suppress flag must survive to block it.
    const cancelMatch = pageContent.match(/onPointerCancel=\{\(\) => \{[\s\S]*?\}\}/)
    expect(cancelMatch).toBeTruthy()
    if (cancelMatch) {
      const cancelBlock = cancelMatch[0]
      // Must set suppress flag if filterMovedRef was true
      expect(cancelBlock).toContain('filterMovedRef.current')
      expect(cancelBlock).toContain('filterSuppressNextOpenRef.current = true')
      // Must NOT unconditionally clear the suppress flag
      expect(cancelBlock).not.toMatch(/filterSuppressNextOpenRef\.current = false/)
    }
  })
})
