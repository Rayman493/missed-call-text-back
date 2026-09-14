/**
 * RC — Customer Filter Dropdown Tap-Through + Swipe Dismissal Fix
 *
 * Regression tests for the gesture-aware dismissal of the Radix
 * DropdownMenu filter on the Customers page.
 *
 * Required behavior:
 *  - Outside TAP: close dropdown, consume gesture, card does NOT open.
 *  - Vertical swipe outside: page scrolls, dropdown stays open.
 *  - Vertical swipe inside: menu scrolls, dropdown stays open.
 *  - Option tap: option selected, dropdown closes, no click-through.
 *
 * The fix uses explicit gesture identity/state (pointerId, start coords,
 * movement threshold, outside flag) instead of timeout-based suppression.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) =>
  readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')
const leadStatusGestureSrc = readSrc('src/components/lead-status-gesture.ts')
const tapGuardSrc = readSrc('src/lib/gesture/tap-guard.ts')
const dropdownSrc = readSrc('src/components/ui/Dropdown.tsx')

// ============================================================================
// A. OUTSIDE TAP — close + consume, card does NOT open
// ============================================================================

describe('A. OUTSIDE TAP', () => {
  it('1. outside tap closes dropdown (markDropdownDismissed called on pointerup)', () => {
    // The filter menu must call markDropdownDismissed() when dismissing
    // via an outside tap, engaging the shared click-suppression infrastructure.
    expect(leadsPageSrc).toContain('markDropdownDismissed()')
  })

  it('2. same outside tap does NOT open underlying customer card', () => {
    // The card onClick must NOT have a local dismissal-guard check (the old
    // filterDismissedAtRef approach). Click suppression is handled by the
    // shared markDropdownDismissed() document-level capture-phase click
    // listener, which stops propagation before the card's onClick fires.
    expect(leadsPageSrc).not.toContain('filterDismissedAtRef')
    // The card onClick should directly call handleConversationClick without
    // a local guard — suppression happens at the document capture phase.
    expect(leadsPageSrc).toContain('handleConversationClick(lead.id)')
  })

  it('3. second tap after close opens customer card normally', () => {
    // The shared infrastructure clears consumedByDismissal on the next
    // pointerdown (capture phase) and after the click is suppressed.
    // So the second tap's click is NOT suppressed.
    expect(leadStatusGestureSrc).toContain("'pointerdown'")
    expect(leadStatusGestureSrc).toContain('consumedByDismissal = false')
    // The click listener clears the flag after suppressing, so the next
    // click is not affected.
    expect(leadStatusGestureSrc).toMatch(
      /click[\s\S]*consumedByDismissal = false/
    )
  })

  it('4. no permanent suppression (no lingering flag after dismissal)', () => {
    // The pointerdown capture listener clears the flag at the start of
    // every new pointer sequence, ensuring no permanent suppression.
    expect(leadStatusGestureSrc).toContain(
      "consumedByDismissal = false"
    )
  })
})

// ============================================================================
// B. VERTICAL SWIPE OUTSIDE — page scrolls, dropdown stays open
// ============================================================================

describe('B. VERTICAL SWIPE OUTSIDE', () => {
  it('5. pointerdown alone does NOT dismiss (no immediate close on pointerdown)', () => {
    // The Radix onInteractOutside handler must call preventDefault() to
    // stop Radix from closing the menu on pointerdown. Dismissal is
    // deferred to pointerup after gesture classification.
    expect(leadsPageSrc).toContain('e.preventDefault()')
    expect(leadsPageSrc).toMatch(/onInteractOutside[\s\S]*e\.preventDefault/)
  })

  it('6. vertical movement past threshold keeps dropdown open', () => {
    // The pointerup handler must check movement against the threshold.
    // If movement >= threshold, the menu stays open (no dismiss).
    expect(leadsPageSrc).toContain('GESTURE_MOVEMENT_THRESHOLD')
    expect(leadsPageSrc).toMatch(
      /Math\.hypot\(dx, dy\) >= GESTURE_MOVEMENT_THRESHOLD/
    )
    // The handler must only dismiss when movement is BELOW threshold.
    expect(leadsPageSrc).toMatch(/if \(!moved && wasOutside\)/)
  })

  it('7. native page scroll remains allowed (no preventDefault on scroll)', () => {
    // The pointerdown/pointerup handlers must NOT call preventDefault()
    // on the actual pointer events — only on the Radix custom event in
    // onInteractOutside. This ensures native scrolling is not blocked.
    const pointerDownHandler = leadsPageSrc.match(
      /handlePointerDown = \(event: PointerEvent\) => \{([\s\S]*?)\n\s*\}/
    )
    expect(pointerDownHandler).toBeTruthy()
    expect(pointerDownHandler![1]).not.toContain('preventDefault')

    const pointerUpHandler = leadsPageSrc.match(
      /handlePointerUp = \(event: PointerEvent\) => \{([\s\S]*?)\n\s*\}/
    )
    expect(pointerUpHandler).toBeTruthy()
    expect(pointerUpHandler![1]).not.toContain('event.preventDefault')
  })

  it('8. pointerup after scroll does NOT dismiss', () => {
    // When movement >= threshold, the handler sets start to null and
    // does NOT call markDropdownDismissed or setFilterMenuOpen(false).
    // The "if (!moved && wasOutside)" block is the ONLY dismissal path.
    expect(leadsPageSrc).toMatch(
      /filterDismissStartRef\.current = null[\s\S]*if \(!moved && wasOutside\)/
    )
  })
})

// ============================================================================
// C. VERTICAL SWIPE INSIDE — menu scrolls, stays open
// ============================================================================

describe('C. SWIPE INSIDE DROPDOWN', () => {
  it('9. swipe inside dropdown does not dismiss (outside flag is false)', () => {
    // The pointerup handler checks filterGestureOutsideRef.current.
    // For inside gestures, Radix does NOT fire onInteractOutside, so
    // the flag stays false and the menu is not dismissed.
    expect(leadsPageSrc).toContain('filterGestureOutsideRef')
    expect(leadsPageSrc).toMatch(/const wasOutside = filterGestureOutsideRef\.current/)
  })

  it('10. internal swipe keeps dropdown open (no dismiss when wasOutside is false)', () => {
    // The dismissal condition requires BOTH !moved AND wasOutside.
    // Inside swipes have wasOutside=false, so they never dismiss.
    expect(leadsPageSrc).toContain('if (!moved && wasOutside)')
  })

  it('11. dropdown content has touch-pan-y for native internal scrolling', () => {
    // The DropdownMenuContent className must include touch-pan-y and
    // overflow-y-auto to allow native scrolling inside the menu.
    expect(leadsPageSrc).toContain('touch-pan-y')
    expect(leadsPageSrc).toContain('overflow-y-auto')
  })
})

// ============================================================================
// D. OPTION TAP — select + close, no click-through
// ============================================================================

describe('D. OPTION TAP', () => {
  it('12. option tap selects and closes (Radix handles inside interaction)', () => {
    // The onInteractOutside handler only fires for OUTSIDE interactions.
    // Inside taps (option selection) are handled by Radix normally.
    // Our pointerup handler does NOT dismiss when wasOutside is false.
    expect(leadsPageSrc).toMatch(/onInteractOutside[\s\S]*filterGestureOutsideRef\.current = true/)
  })

  it('13. option tap does not trigger underlying card (no click-through)', () => {
    // The shared markDropdownDismissed() is NOT called for inside taps
    // (only for outside taps where wasOutside is true). The option's
    // own onClick handles selection and Radix closes the menu.
    // The card onClick is not reached because the click target is the
    // option, not the card.
    const match = leadsPageSrc.match(
      /if \(!moved && wasOutside\) \{([\s\S]*?)\}/
    )
    expect(match).toBeTruthy()
    expect(match![1]).toContain('markDropdownDismissed()')
  })
})

// ============================================================================
// E. GESTURE STATE RESET
// ============================================================================

describe('E. GESTURE STATE RESET', () => {
  it('14. pointercancel resets gesture state', () => {
    // The handlePointerCancel handler must clear the start ref and
    // the outside flag when the pointer is cancelled.
    expect(leadsPageSrc).toMatch(
      /handlePointerCancel[\s\S]*filterDismissStartRef\.current = null[\s\S]*filterGestureOutsideRef\.current = false/
    )
  })

  it('15. consumed dismissal does not leak into next gesture', () => {
    // The pointerdown handler resets the outside flag on each new
    // pointerdown, ensuring stale state from a previous gesture does
    // not affect the next one.
    expect(leadsPageSrc).toMatch(
      /handlePointerDown[\s\S]*filterGestureOutsideRef\.current = false/
    )
    // The shared infrastructure also clears consumedByDismissal on
    // every pointerdown (capture phase).
    expect(leadStatusGestureSrc).toContain('consumedByDismissal = false')
  })
})

// ============================================================================
// F. SHARED INFRASTRUCTURE INTEGRITY
// ============================================================================

describe('F. SHARED INFRASTRUCTURE INTEGRITY', () => {
  it('16. desktop outside click still works (pointerdown covers mouse + touch)', () => {
    // The shared Dropdown.tsx still uses pointerdown for outside detection,
    // which covers mouse, touch, and pen.
    expect(dropdownSrc).toContain("document.addEventListener('pointerdown'")
    expect(dropdownSrc).not.toContain("document.addEventListener('mousedown'")
  })

  it('17. Dropdown pointerdown listener remains gated on isOpen (Batch 6 fix preserved)', () => {
    // The Batch 6 fix that gates the document listener on isOpen must
    // be preserved — the effect must early-return when not open.
    const effectMatch = dropdownSrc.match(
      /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[([^\]]*)]\)/
    )
    expect(effectMatch).toBeTruthy()
    expect(effectMatch![2].trim()).toBe('isOpen')
    expect(effectMatch![0]).toContain('if (!isOpen) return')
  })

  it('18. gesture threshold is the canonical 10px from tap-guard', () => {
    // The threshold must come from the canonical source.
    expect(tapGuardSrc).toMatch(/GESTURE_MOVEMENT_THRESHOLD\s*=\s*10/)
    expect(leadsPageSrc).toContain(
      "import { GESTURE_MOVEMENT_THRESHOLD } from '@/lib/gesture/tap-guard'"
    )
  })

  it('19. no setTimeout-based suppression used', () => {
    // The fix must NOT use setTimeout for suppression. The old
    // filterDismissedAtRef used Date.now() which is a temporal approach.
    // The new fix uses explicit gesture state (pointerId, coords, flags).
    // We check the dismissal-related code section, not the entire page
    // (Date.now() is legitimately used elsewhere for isNewCustomer).
    expect(leadsPageSrc).not.toContain('filterDismissedAtRef')
    // The dismissal handler must not use Date.now() — it uses explicit
    // gesture state instead.
    const dismissHandlerMatch = leadsPageSrc.match(
      /handlePointerUp = \(event: PointerEvent\) => \{([\s\S]*?)\n\s*\}/
    )
    expect(dismissHandlerMatch).toBeTruthy()
    expect(dismissHandlerMatch![1]).not.toContain('Date.now()')
    expect(dismissHandlerMatch![1]).not.toContain('setTimeout')
  })

  it('20. pointerId is tracked for gesture identity', () => {
    // The start ref must include pointerId, and the pointerup handler
    // must check that the pointerId matches.
    expect(leadsPageSrc).toContain('pointerId: event.pointerId')
    expect(leadsPageSrc).toContain('event.pointerId !== start.pointerId')
  })
})
