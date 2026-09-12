/**
 * Regression tests for ChartTouchWrapper drag/focus behavior.
 *
 * Tests 1-7: chart drag activation
 * Tests 8-11: chart focus rectangle
 *
 * Root cause traced:
 * - ChartTouchWrapper set pointerEvents:'none' on the inner div on
 *   pointerdown/touchstart. This prevented the clean tap's click from
 *   reaching Recharts' datum handlers. The fix only disables pointer
 *   events when a drag is detected (movement beyond threshold), so a
 *   clean tap's click reaches the datum naturally.
 * - The .recharts-surface SVG element received focus on tap, showing a
 *   whole-chart outline. The fix adds [&_.recharts-surface]:outline-none
 *   with :focus-visible preserved for keyboard accessibility.
 * - The outer div's focus-visible:ring-2 was triggered on touch by some
 *   Android browsers, producing a large white rounded focus rectangle
 *   around the entire chart. The fix replaces ring with a localized
 *   outline (focus-visible:outline-2, no ring-offset) and adds tabIndex=0
 *   for keyboard focusability.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const chartUtilsContent = readFileSync('src/lib/chart-utils.tsx', 'utf8')

describe('ChartTouchWrapper — chart drag activation (1-7)', () => {
  it('1. pointerdown does NOT disable pointer events (clean tap must reach datum)', () => {
    // The fix: do NOT set pointerEvents:'none' on pointerdown.
    // Only disable when drag is detected (pointermove beyond threshold).
    const pointerDownMatch = chartUtilsContent.match(/handlePointerDown[\s\S]*?\n  \}/)
    expect(pointerDownMatch).toBeTruthy()
    if (pointerDownMatch) {
      // Must NOT call disableChartPointerEvents in pointerdown
      expect(pointerDownMatch[0]).not.toContain('disableChartPointerEvents()')
    }
  })

  it('2. pointermove disables pointer events when drag is detected', () => {
    const pointerMoveMatch = chartUtilsContent.match(/handlePointerMove[\s\S]*?\n  \}/)
    expect(pointerMoveMatch).toBeTruthy()
    if (pointerMoveMatch) {
      expect(pointerMoveMatch[0]).toContain('disableChartPointerEvents()')
    }
  })

  it('3. touchstart does NOT disable pointer events (clean tap must reach datum)', () => {
    const touchStartMatch = chartUtilsContent.match(/handleTouchStart[\s\S]*?\n  \}/)
    expect(touchStartMatch).toBeTruthy()
    if (touchStartMatch) {
      expect(touchStartMatch[0]).not.toContain('disableChartPointerEvents()')
    }
  })

  it('4. touchmove disables pointer events when drag is detected', () => {
    const touchMoveMatch = chartUtilsContent.match(/handleTouchMove[\s\S]*?\n  \}/)
    expect(touchMoveMatch).toBeTruthy()
    if (touchMoveMatch) {
      expect(touchMoveMatch[0]).toContain('disableChartPointerEvents()')
    }
  })

  it('5. drag clears Recharts state (synthetic mouseleave on touchend/pointerup)', () => {
    expect(chartUtilsContent).toContain('clearRechartsState')
    expect(chartUtilsContent).toContain('mouseleave')
    expect(chartUtilsContent).toContain('.recharts-surface')
  })

  it('6. tap does NOT clear Recharts state (click reaches datum naturally)', () => {
    // On pointerup/touchend, if NOT a drag, do NOT call clearRechartsState
    const pointerUpMatch = chartUtilsContent.match(/handlePointerUp[\s\S]*?\n  \}/)
    expect(pointerUpMatch).toBeTruthy()
    if (pointerUpMatch) {
      // clearRechartsState is inside the if (isDraggingRef.current) block
      expect(pointerUpMatch[0]).toContain('if (isDraggingRef.current)')
      expect(pointerUpMatch[0]).toContain('clearRechartsState()')
    }
  })

  it('7. pointer events restored on pointerup/touchend/cancel', () => {
    expect(chartUtilsContent).toContain('restoreChartPointerEvents()')
  })
})

describe('ChartTouchWrapper — chart focus rectangle (8-11)', () => {
  it('8. outer div has tabIndex=0 for keyboard focusability', () => {
    expect(chartUtilsContent).toContain('tabIndex={0}')
  })

  it('9. outer div does NOT have focus-visible:ring (giant Android rectangle removed)', () => {
    const outerDivMatch = chartUtilsContent.match(/className="w-full h-full select-none[^"]*"/)
    expect(outerDivMatch).toBeTruthy()
    if (outerDivMatch) {
      expect(outerDivMatch[0]).not.toContain('focus-visible:ring-2')
      expect(outerDivMatch[0]).not.toContain('focus-visible:ring-offset-2')
    }
  })

  it('10. outer div has focus-visible:outline-2 for keyboard (localized, no offset)', () => {
    const outerDivMatch = chartUtilsContent.match(/className="w-full h-full select-none[^"]*"/)
    expect(outerDivMatch).toBeTruthy()
    if (outerDivMatch) {
      expect(outerDivMatch[0]).toContain('focus-visible:outline-2')
      expect(outerDivMatch[0]).toContain('focus-visible:outline-blue-500/30')
    }
  })

  it('11. SVG surface has :focus-visible:outline for keyboard, outline-none for touch', () => {
    expect(chartUtilsContent).toContain('[&_.recharts-surface]:outline-none')
    expect(chartUtilsContent).toContain('[&_.recharts-surface:focus-visible]:outline-2')
    expect(chartUtilsContent).toContain('[&_.recharts-surface:focus-visible]:outline-blue-500/30')
  })
})
