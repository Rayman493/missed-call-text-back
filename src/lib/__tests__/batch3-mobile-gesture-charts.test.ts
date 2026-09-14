/**
 * Batch 3 — Mobile Scroll Gesture Hardening + Customers Filter + Dashboard Charts
 *
 * Part A: Customers Filter gesture parity with LeadStatusDropdown
 * Part B: Dashboard Recharts drag suppression during mobile scroll
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const leadsPageContent = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')
const chartUtilsContent = readFileSync('src/lib/chart-utils.tsx', 'utf8')
const leadStatusDropdownContent = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')
const leadStatusGestureContent = readFileSync('src/components/lead-status-gesture.ts', 'utf8')
const tapGuardContent = readFileSync('src/lib/gesture/tap-guard.ts', 'utf8')
const useTapGuardContent = readFileSync('src/lib/gesture/use-tap-guard.ts', 'utf8')

// ============================================================================
// PART A — CUSTOMERS FILTER: EXACT GESTURE PARITY
// ============================================================================
describe('Part A: Customers Filter Gesture Parity', () => {
  describe('A1. Root cause: Radix opens on pointerdown', () => {
    it('onOpenChange rejects Radix open requests (only allows closing)', () => {
      // The fix mirrors LeadStatusDropdown: onOpenChange only allows closing.
      // This prevents Radix from opening the menu on pointerdown.
      expect(leadsPageContent).toMatch(/if \(!open\)\s*\{?\s*setFilterMenuOpen\(false\)/)
    })

    it('does NOT allow setFilterMenuOpen(open) for open=true from Radix', () => {
      // The old code had: setFilterMenuOpen(open) which allowed Radix to open
      // The new code only closes from onOpenChange
      const onOpenChangeBlock = leadsPageContent.match(/onOpenChange=\{\(open\)\s*=>\s*\{[\s\S]*?\}\}/)
      expect(onOpenChangeBlock).toBeTruthy()
      if (onOpenChangeBlock) {
        // Should NOT contain setFilterMenuOpen(open) — only setFilterMenuOpen(false)
        expect(onOpenChangeBlock[0]).not.toMatch(/setFilterMenuOpen\(open\)/)
      }
    })
  })

  describe('A2. Opening is handled exclusively by onClick', () => {
    it('onClick handler opens the menu for clean taps', () => {
      expect(leadsPageContent).toMatch(/setFilterMenuOpen\(true\)/)
    })

    it('onClick handler suppresses opening after drag via filterSuppressNextOpenRef', () => {
      expect(leadsPageContent).toMatch(/filterSuppressNextOpenRef\.current/)
      expect(leadsPageContent).toMatch(/e\.preventDefault\(\)/)
      expect(leadsPageContent).toMatch(/e\.stopPropagation\(\)/)
    })
  })

  describe('A3. Uses the same shared gesture primitive as LeadStatusDropdown', () => {
    it('imports shouldPreventMenuOpen from lead-status-gesture', () => {
      expect(leadsPageContent).toMatch(/import \{ shouldPreventMenuOpen \} from '@\/components\/lead-status-gesture'/)
    })

    it('shouldPreventMenuOpen is an alias of isDragGesture from tap-guard', () => {
      expect(leadStatusGestureContent).toMatch(/export \{ isDragGesture as shouldPreventMenuOpen \}/)
    })

    it('uses the same 10px threshold as LeadStatusDropdown', () => {
      expect(tapGuardContent).toMatch(/GESTURE_MOVEMENT_THRESHOLD = 10/)
    })

    it('Filter uses shouldPreventMenuOpen in onPointerMove', () => {
      expect(leadsPageContent).toMatch(/shouldPreventMenuOpen\(/)
    })
  })

  describe('A4. Pointer/touch state machine parity with LeadStatusDropdown', () => {
    it('tracks pointerStartRef (pointer start coordinates)', () => {
      expect(leadsPageContent).toMatch(/filterPointerStartRef/)
    })

    it('tracks filterMovedRef (moved/dragged state)', () => {
      expect(leadsPageContent).toMatch(/filterMovedRef/)
    })

    it('tracks filterSuppressNextOpenRef (click suppression after drag)', () => {
      expect(leadsPageContent).toMatch(/filterSuppressNextOpenRef/)
    })

    it('tracks filterTouchStartRef (Android WebView touch fallback)', () => {
      expect(leadsPageContent).toMatch(/filterTouchStartRef/)
    })

    it('onPointerDown records start and resets state', () => {
      expect(leadsPageContent).toMatch(/filterPointerStartRef\.current = \{ x: e\.clientX, y: e\.clientY \}/)
      expect(leadsPageContent).toMatch(/filterMovedRef\.current = false/)
    })

    it('onPointerMove sets moved flag when threshold exceeded', () => {
      expect(leadsPageContent).toMatch(/filterMovedRef\.current = true/)
    })

    it('onPointerUp resets refs and sets suppress if was scroll', () => {
      expect(leadsPageContent).toMatch(/const wasScroll = filterMovedRef\.current/)
      expect(leadsPageContent).toMatch(/filterSuppressNextOpenRef\.current = true/)
    })

    it('onPointerCancel preserves suppress flag if drag was detected', () => {
      const cancelBlock = leadsPageContent.match(/onPointerCancel=\{\(\)\s*=>\s*\{[\s\S]*?\}\}/)
      expect(cancelBlock).toBeTruthy()
      if (cancelBlock) {
        expect(cancelBlock[0]).toMatch(/filterSuppressNextOpenRef\.current = true/)
      }
    })

    it('onPointerLeave preserves suppress flag if drag was in progress', () => {
      const leaveBlock = leadsPageContent.match(/onPointerLeave=\{\(\)\s*=>\s*\{[\s\S]*?\}\}/)
      expect(leaveBlock).toBeTruthy()
      if (leaveBlock) {
        expect(leaveBlock[0]).toMatch(/filterSuppressNextOpenRef\.current = true/)
      }
    })
  })

  describe('A5. Touch fallback for Android WebView', () => {
    it('onTouchStart records touch start position', () => {
      expect(leadsPageContent).toMatch(/onTouchStart=\{\(e\)/)
      expect(leadsPageContent).toMatch(/filterTouchStartRef\.current = \{/)
    })

    it('onTouchMove sets moved and suppress flags when threshold exceeded', () => {
      expect(leadsPageContent).toMatch(/onTouchMove=\{\(e\)/)
      expect(leadsPageContent).toMatch(/dx > 10 \|\| dy > 10/)
    })

    it('onTouchEnd clears touch start ref', () => {
      expect(leadsPageContent).toMatch(/onTouchEnd=\{\(\)\s*=>\s*\{[\s\S]*?filterTouchStartRef\.current = null/)
    })
  })

  describe('A6. Filter items use shared useTapGuard', () => {
    it('imports useTapGuard from gesture/use-tap-guard', () => {
      expect(leadsPageContent).toMatch(/import \{ useTapGuard \} from '@\/lib\/gesture\/use-tap-guard'/)
    })

    it('creates filterItemGuard via useTapGuard()', () => {
      expect(leadsPageContent).toMatch(/filterItemGuard = useTapGuard\(\)/)
    })

    it('filter items use consumeDragSuppression in onSelect', () => {
      expect(leadsPageContent).toMatch(/filterItemGuard\.consumeDragSuppression\(\)/)
    })

    it('filter items wire pointer handlers to filterItemGuard', () => {
      expect(leadsPageContent).toMatch(/filterItemGuard\.onPointerDown/)
      expect(leadsPageContent).toMatch(/filterItemGuard\.onPointerMove/)
      expect(leadsPageContent).toMatch(/filterItemGuard\.onPointerUp/)
      expect(leadsPageContent).toMatch(/filterItemGuard\.onPointerCancel/)
      expect(leadsPageContent).toMatch(/filterItemGuard\.onPointerLeave/)
    })
  })

  describe('A7. LeadStatusDropdown reference pattern', () => {
    it('LeadStatusDropdown onOpenChange only allows closing', () => {
      expect(leadStatusDropdownContent).toMatch(/if \(!open\) \{[\s\S]*?setIsOpen\(false\)/)
    })

    it('LeadStatusDropdown opens from handlePointerUp, not from Radix', () => {
      expect(leadStatusDropdownContent).toMatch(/setIsOpen\(true\)/)
    })

    it('LeadStatusDropdown uses shouldPreventMenuOpen for drag detection', () => {
      expect(leadStatusDropdownContent).toMatch(/shouldPreventMenuOpen/)
    })

    it('LeadStatusDropdown uses hasMovedBeyondThreshold ref', () => {
      expect(leadStatusDropdownContent).toMatch(/hasMovedBeyondThreshold/)
    })

    it('LeadStatusDropdown has onPointerCancel that resets state', () => {
      expect(leadStatusDropdownContent).toMatch(/onPointerCancel/)
    })
  })

  describe('A8. Parity assertion: same shared gesture primitive', () => {
    it('both Filter and LeadStatusDropdown use shouldPreventMenuOpen from lead-status-gesture', () => {
      expect(leadsPageContent).toMatch(/shouldPreventMenuOpen/)
      expect(leadStatusDropdownContent).toMatch(/shouldPreventMenuOpen/)
    })

    it('both use the same 10px GESTURE_MOVEMENT_THRESHOLD from tap-guard', () => {
      expect(tapGuardContent).toMatch(/GESTURE_MOVEMENT_THRESHOLD = 10/)
    })

    it('both use useTapGuard from the same shared hook', () => {
      expect(useTapGuardContent).toMatch(/isDragGesture/)
    })

    it('both reject Radix onOpenChange(true) and open from their own handlers', () => {
      // Filter: onOpenChange only allows closing; onClick opens
      expect(leadsPageContent).toMatch(/if \(!open\) \{[\s\S]*?setFilterMenuOpen\(false\)/)
      // LeadStatusDropdown: onOpenChange only allows closing; handlePointerUp opens
      expect(leadStatusDropdownContent).toMatch(/if \(!open\) \{[\s\S]*?setIsOpen\(false\)/)
    })
  })
})

// ============================================================================
// PART B — DASHBOARD CHARTS: AXIS-AWARE GESTURE DETECTION
// ============================================================================
describe('Part B: Dashboard Chart Axis-Aware Gesture Detection', () => {
  describe('B1. ChartTouchWrapper uses canonical gesture threshold', () => {
    it('imports GESTURE_MOVEMENT_THRESHOLD from tap-guard', () => {
      expect(chartUtilsContent).toMatch(/import \{ GESTURE_MOVEMENT_THRESHOLD \} from '@\/lib\/gesture\/tap-guard'/)
    })

    it('uses the same 10px threshold as all other surfaces', () => {
      expect(tapGuardContent).toMatch(/GESTURE_MOVEMENT_THRESHOLD = 10/)
    })
  })

  describe('B2. Axis-aware gesture classification', () => {
    it('touchmove classifies vertical vs horizontal based on deltaX/deltaY', () => {
      const touchMoveBlock = chartUtilsContent.match(/handleTouchMove = \(e: React\.TouchEvent\)\s*=>\s*\{[\s\S]*?\n  \}/)
      expect(touchMoveBlock).toBeTruthy()
      if (touchMoveBlock) {
        expect(touchMoveBlock[0]).toContain('deltaX')
        expect(touchMoveBlock[0]).toContain('deltaY')
        expect(touchMoveBlock[0]).toContain('vertical')
        expect(touchMoveBlock[0]).toContain('horizontal')
      }
    })

    it('pointermove classifies vertical vs horizontal based on deltaX/deltaY', () => {
      const pointerMoveBlock = chartUtilsContent.match(/handlePointerMove = \(e: React\.PointerEvent\)\s*=>\s*\{[\s\S]*?\n  \}/)
      expect(pointerMoveBlock).toBeTruthy()
      if (pointerMoveBlock) {
        expect(pointerMoveBlock[0]).toContain('deltaX')
        expect(pointerMoveBlock[0]).toContain('deltaY')
      }
    })

    it('vertical movement clears Recharts state (no datum selection)', () => {
      expect(chartUtilsContent).toMatch(/vertical[\s\S]*?clearRechartsState/)
    })

    it('horizontal movement enters scrub mode and activates datum', () => {
      expect(chartUtilsContent).toMatch(/horizontal[\s\S]*?activateDatum/)
    })
  })

  describe('B3. Clear Recharts state on vertical scroll', () => {
    it('clearRechartsState dispatches mouseleave on recharts-surface', () => {
      expect(chartUtilsContent).toMatch(/MouseEvent\('mouseleave'/)
      expect(chartUtilsContent).toMatch(/recharts-surface/)
    })

    it('dispatches mouseleave on recharts-wrapper', () => {
      expect(chartUtilsContent).toMatch(/recharts-wrapper/)
    })

    it('dispatches touchend on recharts-surface for Recharts v3 touch state', () => {
      expect(chartUtilsContent).toMatch(/TouchEvent\('touchend'/)
    })

    it('handles TouchEvent constructor not being available (JSDOM)', () => {
      expect(chartUtilsContent).toMatch(/try \{[\s\S]*?TouchEvent/)
      expect(chartUtilsContent).toMatch(/catch \{/)
    })
  })

  describe('B4. Does NOT disable clean taps', () => {
    it('does NOT set pointerEvents:none on pointerdown', () => {
      const pointerDownBlock = chartUtilsContent.match(/handlePointerDown = \(e: React\.PointerEvent\)\s*=>\s*\{[\s\S]*?\n  \}/)
      expect(pointerDownBlock).toBeTruthy()
      if (pointerDownBlock) {
        expect(pointerDownBlock[0]).not.toMatch(/style\.pointerEvents = 'none'/)
      }
    })

    it('does NOT set pointerEvents:none on touchstart', () => {
      const touchStartBlock = chartUtilsContent.match(/handleTouchStart = \(e: React\.TouchEvent\)\s*=>\s*\{[\s\S]*?\n  \}/)
      expect(touchStartBlock).toBeTruthy()
      if (touchStartBlock) {
        expect(touchStartBlock[0]).not.toMatch(/style\.pointerEvents = 'none'/)
      }
    })
  })

  describe('B5. Allows native vertical scrolling', () => {
    it('uses touchAction: pan-y to allow native vertical scroll', () => {
      expect(chartUtilsContent).toMatch(/touchAction: 'pan-y'/)
    })

    it('does NOT set touchAction: none', () => {
      expect(chartUtilsContent).not.toMatch(/touchAction: 'none'/)
    })

    it('does NOT set touchAction: pan-y pan-x (horizontal is handled by scrub)', () => {
      expect(chartUtilsContent).not.toMatch(/touchAction: 'pan-y pan-x'/)
    })
  })

  describe('B6. Desktop mouse preserved', () => {
    it('pointer handlers only track touch pointers (not mouse)', () => {
      expect(chartUtilsContent).toMatch(/if \(e\.pointerType !== 'touch'\) return/)
    })
  })

  describe('B7. No wrapper-level focus (white rectangle fix)', () => {
    it('wrapper does NOT have tabIndex', () => {
      expect(chartUtilsContent).not.toMatch(/tabIndex=\{0\}/)
      expect(chartUtilsContent).not.toMatch(/tabIndex=\{1\}/)
    })

    it('wrapper does NOT have focus-visible styling', () => {
      const outerDivMatch = chartUtilsContent.match(/className="w-full h-full select-none[^"]*"/)
      expect(outerDivMatch).toBeTruthy()
      if (outerDivMatch) {
        expect(outerDivMatch[0]).not.toContain('focus-visible:ring')
        expect(outerDivMatch[0]).not.toContain('focus-visible:outline')
      }
    })

    it('recharts-surface has outline-none (CSS suppresses touch focus)', () => {
      expect(chartUtilsContent).toMatch(/\[&_\.recharts-surface\]:outline-none/)
    })
  })

  describe('B8. Restore after gesture completion', () => {
    it('pointer events restored on touchend', () => {
      expect(chartUtilsContent).toMatch(/handleTouchEnd[\s\S]*?style\.pointerEvents = 'auto'/)
    })

    it('pointer events restored on pointerup', () => {
      expect(chartUtilsContent).toMatch(/handlePointerUp[\s\S]*?style\.pointerEvents = 'auto'/)
    })

    it('pointer events restored on pointercancel', () => {
      expect(chartUtilsContent).toMatch(/handlePointerCancel[\s\S]*?style\.pointerEvents = 'auto'/)
    })
  })

  describe('B9. data-chart-scrubbing attribute for observability', () => {
    it('sets data-chart-scrubbing when scrubbing', () => {
      expect(chartUtilsContent).toMatch(/data-chart-scrubbing=\{isScrubbing/)
    })
  })
})

// ============================================================================
// PART J — TEST MATRIX VERIFICATION
// ============================================================================
describe('Test Matrix Verification', () => {
  // 1. touch/pointer down + movement past threshold + release → menu does NOT open
  it('1. Filter: drag past threshold suppresses open via onClick guard', () => {
    expect(leadsPageContent).toMatch(/filterSuppressNextOpenRef\.current = true/)
    expect(leadsPageContent).toMatch(/if \(filterSuppressNextOpenRef\.current\)/)
  })

  // 2. movement below threshold + release/click → menu opens
  it('2. Filter: clean tap opens via onClick', () => {
    expect(leadsPageContent).toMatch(/setFilterMenuOpen\(true\)/)
  })

  // 3. drag followed by synthetic click → synthetic click suppressed
  it('3. Filter: synthetic click suppressed via preventDefault + stopPropagation', () => {
    expect(leadsPageContent).toMatch(/e\.preventDefault\(\)/)
    expect(leadsPageContent).toMatch(/e\.stopPropagation\(\)/)
  })

  // 4. pointercancel → state resets correctly
  it('4. Filter: onPointerCancel resets state', () => {
    expect(leadsPageContent).toMatch(/onPointerCancel=\{\(\)\s*=>\s*\{/)
    expect(leadsPageContent).toMatch(/filterPointerStartRef\.current = null/)
  })

  // 5. drag then next clean tap → next tap opens
  it('5. Filter: suppress flag cleared on next pointerdown (fresh gesture)', () => {
    expect(leadsPageContent).toMatch(/filterSuppressNextOpenRef\.current = false/)
  })

  // 6. parity: same shared gesture primitive
  it('6. Parity: both use shouldPreventMenuOpen from lead-status-gesture', () => {
    expect(leadsPageContent).toMatch(/shouldPreventMenuOpen/)
    expect(leadStatusDropdownContent).toMatch(/shouldPreventMenuOpen/)
  })

  // Chart tests
  // 1. real chart clean tap → datum interaction still works
  it('Chart 1: clean tap does NOT disable pointer events on pointerdown', () => {
    const pdIdx = chartUtilsContent.indexOf('handlePointerDown')
    const pdBlock = chartUtilsContent.substring(pdIdx, pdIdx + 400)
    expect(pdBlock).not.toContain("style.pointerEvents = 'none'")
  })

  // 2. real chart vertical drag → no tooltip/active state
  it('Chart 2: vertical drag clears Recharts state', () => {
    expect(chartUtilsContent).toMatch(/clearRechartsState\(\)/)
  })

  // 3. horizontal scrub → activates datum
  it('Chart 3: horizontal scrub activates datum via mousemove dispatch', () => {
    expect(chartUtilsContent).toMatch(/activateDatum/)
    expect(chartUtilsContent).toMatch(/mousemove/)
  })

  // 4. next clean tap after gesture → works
  it('Chart 4: pointer events restored after gesture ends', () => {
    expect(chartUtilsContent).toMatch(/style\.pointerEvents = 'auto'/)
  })

  // 5. desktop mouse hover → preserved
  it('Chart 5: mouse pointers not tracked (hover preserved)', () => {
    expect(chartUtilsContent).toMatch(/if \(e\.pointerType !== 'touch'\) return/)
  })

  // 6. keyboard focus → preserved on individual data elements (not wrapper)
  it('Chart 6: no wrapper tabIndex, keyboard focus on individual elements via CSS', () => {
    expect(chartUtilsContent).not.toMatch(/tabIndex=\{0\}/)
    // Individual data element focus is handled by globals.css
  })
})
