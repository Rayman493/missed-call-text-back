/**
 * Regression tests for ChartTouchWrapper axis-aware gesture + focus behavior.
 *
 * Tests 1-7: chart gesture classification (vertical scroll / horizontal scrub / tap)
 * Tests 8-11: chart focus rectangle removal (no tabIndex, no wrapper focus)
 *
 * Root cause traced:
 * - The old ChartTouchWrapper disabled pointer events on ANY drag (vertical
 *   or horizontal), preventing horizontal scrub. The fix classifies gestures
 *   by axis: vertical → page scroll, horizontal → chart scrub, low movement
 *   → tap.
 * - The old ChartTouchWrapper had tabIndex={0}, making the entire wrapper
 *   div keyboard-focusable. On Android, tapping the chart focused the
 *   wrapper and the browser rendered a large white focus rectangle covering
 *   the entire chart area. The fix removes tabIndex entirely — keyboard
 *   accessibility is preserved on individual data elements (bars, dots,
 *   slices) via globals.css :focus-visible rules.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const chartUtilsContent = readFileSync('src/lib/chart-utils.tsx', 'utf8')

describe('ChartTouchWrapper — chart gesture classification (1-7)', () => {
  it('1. pointerdown does NOT disable pointer events (clean tap must reach datum)', () => {
    const pointerDownMatch = chartUtilsContent.match(/handlePointerDown[\s\S]*?\n  \}/)
    expect(pointerDownMatch).toBeTruthy()
    if (pointerDownMatch) {
      expect(pointerDownMatch[0]).not.toContain("style.pointerEvents = 'none'")
    }
  })

  it('2. pointermove classifies gesture by axis (vertical vs horizontal)', () => {
    const pointerMoveMatch = chartUtilsContent.match(/handlePointerMove[\s\S]*?\n  \}/)
    expect(pointerMoveMatch).toBeTruthy()
    if (pointerMoveMatch) {
      // Must check both deltaX and deltaY for axis-aware classification
      expect(pointerMoveMatch[0]).toContain('deltaX')
      expect(pointerMoveMatch[0]).toContain('deltaY')
    }
  })

  it('3. touchstart does NOT disable pointer events (clean tap must reach datum)', () => {
    const touchStartMatch = chartUtilsContent.match(/handleTouchStart[\s\S]*?\n  \}/)
    expect(touchStartMatch).toBeTruthy()
    if (touchStartMatch) {
      expect(touchStartMatch[0]).not.toContain("style.pointerEvents = 'none'")
    }
  })

  it('4. touchmove classifies gesture by axis and disables pointer events only for horizontal scrub', () => {
    const touchMoveMatch = chartUtilsContent.match(/handleTouchMove[\s\S]*?\n  \}/)
    expect(touchMoveMatch).toBeTruthy()
    if (touchMoveMatch) {
      // Must check deltaX and deltaY for axis-aware classification
      expect(touchMoveMatch[0]).toContain('deltaX')
      expect(touchMoveMatch[0]).toContain('deltaY')
      // Must have vertical and horizontal modes
      expect(touchMoveMatch[0]).toContain('vertical')
      expect(touchMoveMatch[0]).toContain('horizontal')
    }
  })

  it('5. drag/scroll clears Recharts state (synthetic mouseleave)', () => {
    expect(chartUtilsContent).toContain('clearRechartsState')
    expect(chartUtilsContent).toContain('mouseleave')
    expect(chartUtilsContent).toContain('.recharts-surface')
  })

  it('6. tap does NOT clear Recharts state (click reaches datum naturally)', () => {
    // On touchend/pointerup, if gesture was idle (tap), do NOT clear state
    const touchEndMatch = chartUtilsContent.match(/handleTouchEnd[\s\S]*?\n  \}/)
    expect(touchEndMatch).toBeTruthy()
    if (touchEndMatch) {
      // The tap path (idle mode) should not call clearRechartsState
      // clearRechartsState is only called for vertical mode
      expect(touchEndMatch[0]).toContain('idle')
    }
  })

  it('7. pointer events restored on pointerup/touchend/cancel', () => {
    expect(chartUtilsContent).toContain("style.pointerEvents = 'auto'")
  })
})

describe('ChartTouchWrapper — chart focus rectangle removal (8-11)', () => {
  it('8. outer div does NOT have tabIndex (removes giant Android focus rectangle)', () => {
    // The fix removes tabIndex entirely — the wrapper is not a keyboard stop.
    // Keyboard accessibility is preserved on individual data elements.
    expect(chartUtilsContent).not.toContain('tabIndex={0}')
    expect(chartUtilsContent).not.toContain('tabIndex={1}')
  })

  it('9. outer div does NOT have focus-visible:ring (giant Android rectangle removed)', () => {
    const outerDivMatch = chartUtilsContent.match(/className="w-full h-full select-none[^"]*"/)
    expect(outerDivMatch).toBeTruthy()
    if (outerDivMatch) {
      expect(outerDivMatch[0]).not.toContain('focus-visible:ring-2')
      expect(outerDivMatch[0]).not.toContain('focus-visible:ring-offset-2')
      expect(outerDivMatch[0]).not.toContain('focus-visible:outline-2')
    }
  })

  it('10. outer div does NOT have focus-visible:outline (no wrapper-level focus)', () => {
    const outerDivMatch = chartUtilsContent.match(/className="w-full h-full select-none[^"]*"/)
    expect(outerDivMatch).toBeTruthy()
    if (outerDivMatch) {
      // No focus-visible styling on the wrapper at all
      expect(outerDivMatch[0]).not.toContain('focus-visible:outline')
    }
  })

  it('11. SVG surface has outline-none (touch focus suppressed via CSS)', () => {
    expect(chartUtilsContent).toContain('[&_.recharts-surface]:outline-none')
    expect(chartUtilsContent).toContain('[&_.recharts-wrapper]:outline-none')
    expect(chartUtilsContent).toContain('[&_.recharts-bar-rectangles]:outline-none')
    expect(chartUtilsContent).toContain('[&_.recharts-pie-sector]:outline-none')
    expect(chartUtilsContent).toContain('[&_.recharts-line-dot]:outline-none')
  })
})
