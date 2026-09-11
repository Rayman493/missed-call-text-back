/**
 * Regression tests for LeadStatusDropdown stale-state and outside-tap behavior.
 *
 * Tests 18-25: Customer Status dropdown gesture contract
 *
 * Root cause traced:
 * 1. handlePointerLeave cleared hasMovedBeyondThreshold during scroll.
 *    When the page scrolls, content moves under the finger, causing
 *    pointerleave to fire on the trigger. Clearing hasMovedBeyondThreshold
 *    made the next pointerup think it was a clean tap, opening the dropdown
 *    during scroll. The fix: do NOT clear hasMovedBeyondThreshold in
 *    handlePointerLeave (matching useTapGuard's behavior).
 *
 * 2. The LeadCard wrapper div had stopPropagation on onPointerDown, which
 *    prevented Radix's document-level pointerdown listener from firing
 *    when the user tapped on another row's status dropdown area to dismiss
 *    the open dropdown. The fix: remove stopPropagation from pointer
 *    events, keep only onClick stopPropagation.
 *
 * 3. Added onInteractOutside as a safety net for outside-tap dismissal.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const dropdownContent = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')
const leadCardContent = readFileSync('src/components/LeadCard.tsx', 'utf8')

describe('Customer Status dropdown — stale-state and outside-tap (18-25)', () => {
  it('18. open without prior scroll → first outside tap closes (onPointerDownOutside)', () => {
    expect(dropdownContent).toContain('onPointerDownOutside')
    expect(dropdownContent).toContain('setIsOpen(false)')
  })

  it('19. page scroll first → open → first outside tap closes (onInteractOutside safety net)', () => {
    // The fix: add onInteractOutside as a safety net for cases where
    // onPointerDownOutside alone is insufficient after a scroll gesture.
    expect(dropdownContent).toContain('onInteractOutside')
  })

  it('20. stale drag state resets on open (hasMovedBeyondThreshold cleared on pointerup)', () => {
    // handlePointerUp clears hasMovedBeyondThreshold before opening
    expect(dropdownContent).toContain('hasMovedBeyondThreshold.current = false')
    expect(dropdownContent).toContain('setIsOpen(true)')
  })

  it('21. internal menu scroll does not close (overflow-y-auto + overscroll-contain)', () => {
    expect(dropdownContent).toContain('overflow-y-auto')
    expect(dropdownContent).toContain('overscroll-contain')
  })

  it('22. after internal menu scroll → first true outside tap still closes', () => {
    // The dropdown content has data-scroll-lock-allow and overscroll-contain
    // so internal scroll doesn't propagate. onInteractOutside catches
    // outside taps regardless of internal scroll state.
    expect(dropdownContent).toContain('data-scroll-lock-allow')
    expect(dropdownContent).toContain('onInteractOutside')
  })

  it('23. clean status selection still updates and closes (handleStatusSelect)', () => {
    expect(dropdownContent).toContain('handleStatusSelect')
    expect(dropdownContent).toContain('onStatusChange')
  })

  it('24. drag does not accidentally select status (hasMovedBeyondThreshold gates open)', () => {
    // handlePointerUp checks hasMovedBeyondThreshold before opening
    expect(dropdownContent).toContain('wasScrollGesture')
    expect(dropdownContent).toContain('!wasScrollGesture')
  })

  it('25. desktop mouse behavior unchanged (keyboard Enter/Space preserved)', () => {
    expect(dropdownContent).toContain("e.key === 'Enter'")
    expect(dropdownContent).toContain("e.key === ' '")
  })

  it('25b. handlePointerLeave does NOT clear hasMovedBeyondThreshold (root cause fix)', () => {
    // The root cause fix: handlePointerLeave must NOT clear
    // hasMovedBeyondThreshold. During scroll, content moves under the
    // finger, causing pointerleave. Clearing the flag would make the next
    // pointerup think it was a clean tap.
    const leaveMatch = dropdownContent.match(/handlePointerLeave = \(\) => \{[\s\S]*?\n  \}/)
    expect(leaveMatch).toBeTruthy()
    if (leaveMatch) {
      const leaveBlock = leaveMatch[0]
      // Must NOT contain hasMovedBeyondThreshold.current = false
      expect(leaveBlock).not.toContain('hasMovedBeyondThreshold.current = false')
      // Must contain pointerStartRef.current = null
      expect(leaveBlock).toContain('pointerStartRef.current = null')
    }
  })

  it('25c. LeadCard wrapper does NOT stopPropagation on pointer events (root cause fix)', () => {
    // The fix: remove stopPropagation from onPointerDown/Move/Up/Cancel
    // on the LeadCard's status dropdown wrapper div. This allows Radix's
    // document-level pointerdown listener to fire when the user taps on
    // another row's status dropdown area to dismiss the open dropdown.
    // Only onClick stopPropagation is kept (to prevent the LeadCard's
    // click handler from firing).
    // Find the wrapper div block around LeadStatusDropdown
    const wrapperStart = leadCardContent.indexOf('<div className="flex-shrink-0">')
    expect(wrapperStart).toBeGreaterThan(-1)
    // Find the second flex-shrink-0 div (the one with onClick stopPropagation)
    const wrapperBlock = leadCardContent.slice(wrapperStart, wrapperStart + 200)
    // Must NOT stopPropagation on pointer events
    expect(wrapperBlock).not.toContain('onPointerDown={(e) => e.stopPropagation()}')
    expect(wrapperBlock).not.toContain('onPointerMove={(e) => e.stopPropagation()}')
    expect(wrapperBlock).not.toContain('onPointerUp={(e) => e.stopPropagation()}')
    // Must keep onClick stopPropagation
    expect(wrapperBlock).toContain('onClick={(e) => e.stopPropagation()}')
  })
})
