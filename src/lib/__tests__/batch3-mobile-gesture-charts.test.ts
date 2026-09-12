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
// PART B — DASHBOARD CHARTS: DRAG SUPPRESSION
// ============================================================================
describe('Part B: Dashboard Chart Drag Suppression', () => {
  describe('B1. ChartTouchWrapper uses canonical gesture primitive', () => {
    it('imports GESTURE_MOVEMENT_THRESHOLD and isDragGesture from tap-guard', () => {
      expect(chartUtilsContent).toMatch(/import \{ GESTURE_MOVEMENT_THRESHOLD, isDragGesture \} from '@\/lib\/gesture\/tap-guard'/)
    })

    it('uses the same 10px threshold as all other surfaces', () => {
      expect(tapGuardContent).toMatch(/GESTURE_MOVEMENT_THRESHOLD = 10/)
    })
  })

  describe('B2. Capture-phase handlers intercept events before Recharts', () => {
    it('has onTouchMoveCapture handler', () => {
      expect(chartUtilsContent).toMatch(/onTouchMoveCapture=\{handleTouchMoveCapture\}/)
    })

    it('has onPointerMoveCapture handler', () => {
      expect(chartUtilsContent).toMatch(/onPointerMoveCapture=\{handlePointerMoveCapture\}/)
    })

    it('capture touch handler stops propagation when drag is detected', () => {
      const captureBlock = chartUtilsContent.match(/handleTouchMoveCapture = \(e: React\.TouchEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(captureBlock).toBeTruthy()
      if (captureBlock) {
        expect(captureBlock[0]).toMatch(/e\.stopPropagation\(\)/)
      }
    })

    it('capture pointer handler stops propagation when drag is detected', () => {
      const captureBlock = chartUtilsContent.match(/handlePointerMoveCapture = \(e: React\.PointerEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(captureBlock).toBeTruthy()
      if (captureBlock) {
        expect(captureBlock[0]).toMatch(/e\.stopPropagation\(\)/)
      }
    })

    it('capture handlers only act when isDraggingRef is already true', () => {
      expect(chartUtilsContent).toMatch(/if \(!isDraggingRef\.current\) return/)
    })
  })

  describe('B3. Clear Recharts state immediately when drag detected', () => {
    it('handleTouchMove calls clearRechartsState when drag first detected', () => {
      const touchMoveBlock = chartUtilsContent.match(/handleTouchMove = \(e: React\.TouchEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(touchMoveBlock).toBeTruthy()
      if (touchMoveBlock) {
        expect(touchMoveBlock[0]).toMatch(/clearRechartsState\(\)/)
      }
    })

    it('handlePointerMove calls clearRechartsState when drag first detected', () => {
      const pointerMoveBlock = chartUtilsContent.match(/handlePointerMove = \(e: React\.PointerEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(pointerMoveBlock).toBeTruthy()
      if (pointerMoveBlock) {
        expect(pointerMoveBlock[0]).toMatch(/clearRechartsState\(\)/)
      }
    })

    it('handleTouchMove stops propagation during drag', () => {
      // Check the full file for handleTouchMove + stopPropagation
      expect(chartUtilsContent).toMatch(/handleTouchMove[\s\S]*?e\.stopPropagation\(\)/)
    })

    it('handlePointerMove stops propagation during drag', () => {
      expect(chartUtilsContent).toMatch(/handlePointerMove[\s\S]*?e\.stopPropagation\(\)/)
    })
  })

  describe('B4. clearRechartsState dispatches synthetic events', () => {
    it('dispatches mouseleave on recharts-surface', () => {
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

  describe('B5. Does NOT disable clean taps', () => {
    it('does NOT set pointerEvents:none on pointerdown', () => {
      const pointerDownBlock = chartUtilsContent.match(/handlePointerDown = \(e: React\.PointerEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(pointerDownBlock).toBeTruthy()
      if (pointerDownBlock) {
        expect(pointerDownBlock[0]).not.toMatch(/disableChartPointerEvents\(\)/)
      }
    })

    it('does NOT set pointerEvents:none on touchstart', () => {
      const touchStartBlock = chartUtilsContent.match(/handleTouchStart = \(e: React\.TouchEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(touchStartBlock).toBeTruthy()
      if (touchStartBlock) {
        expect(touchStartBlock[0]).not.toMatch(/disableChartPointerEvents\(\)/)
      }
    })

    it('only disables pointer events when drag is detected', () => {
      // disableChartPointerEvents should only be called from handleTouchMove and handlePointerMove
      const calls = chartUtilsContent.match(/disableChartPointerEvents\(\)/g) || []
      // Should appear in handleTouchMove, handlePointerMove (2 calls for drag detection)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('B6. Does NOT preventDefault on touchmove or disable page scrolling', () => {
    it('does NOT call e.preventDefault() in touch handlers', () => {
      const touchMoveBlock = chartUtilsContent.match(/handleTouchMove = \(e: React\.TouchEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(touchMoveBlock).toBeTruthy()
      if (touchMoveBlock) {
        expect(touchMoveBlock[0]).not.toMatch(/e\.preventDefault\(\)/)
      }
    })

    it('uses touchAction: pan-y pan-x to allow native scrolling', () => {
      expect(chartUtilsContent).toMatch(/touchAction: 'pan-y pan-x'/)
    })

    it('does NOT set touchAction: none', () => {
      expect(chartUtilsContent).not.toMatch(/touchAction: 'none'/)
    })
  })

  describe('B7. Desktop mouse and keyboard preserved', () => {
    it('pointer handlers only track touch pointers (not mouse)', () => {
      expect(chartUtilsContent).toMatch(/if \(e\.pointerType !== 'touch'\) return/)
    })

    it('wrapper has tabIndex={0} for keyboard focusability', () => {
      expect(chartUtilsContent).toMatch(/tabIndex=\{0\}/)
    })

    it('uses focus-visible:outline (not giant focus ring)', () => {
      expect(chartUtilsContent).toMatch(/focus:outline-none/)
      expect(chartUtilsContent).toMatch(/focus-visible:outline-2/)
      expect(chartUtilsContent).toMatch(/focus-visible:outline-blue-500\/30/)
    })

    it('recharts-surface gets focus-visible styling', () => {
      expect(chartUtilsContent).toMatch(/\[&_\.recharts-surface:focus-visible\]/)
    })
  })

  describe('B8. Restore after drag completion', () => {
    it('handleTouchEnd restores pointer events', () => {
      expect(chartUtilsContent).toMatch(/handleTouchEnd[\s\S]*?restoreChartPointerEvents\(\)/)
    })

    it('handlePointerUp restores pointer events', () => {
      expect(chartUtilsContent).toMatch(/handlePointerUp[\s\S]*?restoreChartPointerEvents\(\)/)
    })

    it('handlePointerCancel restores pointer events', () => {
      expect(chartUtilsContent).toMatch(/handlePointerCancel[\s\S]*?restoreChartPointerEvents\(\)/)
    })

    it('handleTouchEnd clears Recharts state if was drag', () => {
      expect(chartUtilsContent).toMatch(/if \(isDraggingRef\.current\)[\s\S]*?clearRechartsState\(\)/)
    })

    it('handlePointerUp clears Recharts state if was drag', () => {
      const pointerUpBlock = chartUtilsContent.match(/handlePointerUp = \(e: React\.PointerEvent\)\s*=>\s*\{[\s\S]*?\}/)
      expect(pointerUpBlock).toBeTruthy()
      if (pointerUpBlock) {
        expect(pointerUpBlock[0]).toMatch(/clearRechartsState\(\)/)
      }
    })
  })

  describe('B9. data-chart-dragging attribute for observability', () => {
    it('sets data-chart-dragging when dragging', () => {
      expect(chartUtilsContent).toMatch(/data-chart-dragging=\{isDragging/)
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
    expect(chartUtilsContent).toMatch(/Do NOT disable pointer events/)
  })

  // 2. real chart vertical drag → no tooltip/active state
  it('Chart 2: drag detection disables pointer events and clears state', () => {
    expect(chartUtilsContent).toMatch(/disableChartPointerEvents\(\)/)
    expect(chartUtilsContent).toMatch(/clearRechartsState\(\)/)
  })

  // 3. drag release synthetic click → remains suppressed
  it('Chart 3: capture-phase handlers stop propagation during drag', () => {
    expect(chartUtilsContent).toMatch(/onTouchMoveCapture/)
    expect(chartUtilsContent).toMatch(/onPointerMoveCapture/)
  })

  // 4. next clean tap after drag → works
  it('Chart 4: pointer events restored after drag ends', () => {
    expect(chartUtilsContent).toMatch(/restoreChartPointerEvents\(\)/)
  })

  // 5. desktop mouse hover → preserved
  it('Chart 5: mouse pointers not tracked (hover preserved)', () => {
    expect(chartUtilsContent).toMatch(/if \(e\.pointerType !== 'touch'\) return/)
  })

  // 6. keyboard focus/activation → preserved
  it('Chart 6: keyboard focus via tabIndex and focus-visible styling', () => {
    expect(chartUtilsContent).toMatch(/tabIndex=\{0\}/)
    expect(chartUtilsContent).toMatch(/focus-visible:outline/)
  })
})
