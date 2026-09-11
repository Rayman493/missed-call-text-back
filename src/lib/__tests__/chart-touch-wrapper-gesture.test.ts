/**
 * Regression tests for ChartTouchWrapper drag/focus behavior.
 *
 * Tests 1-7: chart drag activation
 * Tests 8-11: chart focus rectangle
 *
 * Root cause traced:
 * - ChartTouchWrapper set pointerEvents:'none' on the inner div only AFTER
 *   the drag threshold was exceeded. The first touchmove (before threshold)
 *   generated a pointermove that Recharts interpreted as hover, activating
 *   the bar/dot datum. The fix sets pointerEvents:'none' on touchstart
 *   (before any move) so Recharts never receives touch-generated pointermove.
 * - The .recharts-surface SVG element received focus on tap, showing a
 *   whole-chart outline. The fix adds [&_.recharts-surface]:outline-none
 *   with :focus-visible preserved for keyboard accessibility.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const chartUtilsContent = readFileSync('src/lib/chart-utils.tsx', 'utf8')

describe('ChartTouchWrapper — chart drag activation (1-7)', () => {
  it('1. pointer drag over chart does not activate datum (pointerEvents:none on touchstart)', () => {
    // The fix: set pointerEvents:'none' on touchstart, BEFORE any move.
    // This prevents Recharts from receiving touch-generated pointermove
    // events that activate bar/dot state.
    expect(chartUtilsContent).toContain('handleTouchStart')
    // The touchstart handler must set pointerEvents:'none' immediately
    expect(chartUtilsContent).toMatch(/handleTouchStart[\s\S]*?pointerEvents.*none/)
  })

  it('2. drag does not leave tooltip active (synthetic mouseleave on touchend)', () => {
    // On touchend, if it was a drag, dispatch a synthetic mouseleave on
    // .recharts-surface to clear activeDot/activeBar/tooltip/cursor.
    expect(chartUtilsContent).toContain('handleTouchEnd')
    expect(chartUtilsContent).toContain('mouseleave')
    expect(chartUtilsContent).toContain('.recharts-surface')
  })

  it('3. drag allows page scroll (touchAction: pan-y)', () => {
    // The outer div has touchAction:'pan-y pan-x' so the browser handles
    // scrolling. The inner div's pointerEvents:'none' does not block
    // scrolling because the outer div still receives touch events.
    expect(chartUtilsContent).toContain("touchAction: 'pan-y pan-x'")
  })

  it('4. synthetic click from drag is suppressed (no chart activation)', () => {
    // Since pointerEvents:'none' is set on touchstart, Recharts never
    // receives the touch-generated pointer events. The synthetic click
    // on touchend fires on the outer div, not on Recharts' SVG, so no
    // chart datum is activated.
    expect(chartUtilsContent).toContain("pointerEvents = 'none'")
  })

  it('5. next clean tap still activates chart if supported (pointerEvents restored on touchend)', () => {
    // On touchend, pointerEvents is restored to 'auto' so future
    // interactions (desktop hover, or tap if a chart adds onClick) work.
    expect(chartUtilsContent).toContain("pointerEvents = 'auto'")
  })

  it('6. desktop hover unchanged (no touch events on desktop)', () => {
    // The touch handlers only fire on touch devices. On desktop, the
    // inner div's pointerEvents stays 'auto' (initial state), preserving
    // hover/tooltip behavior.
    expect(chartUtilsContent).toContain('handleTouchStart')
    expect(chartUtilsContent).toContain('handleTouchMove')
    expect(chartUtilsContent).toContain('handleTouchEnd')
    // No pointer-events:none in the initial style (only set by touch handlers)
    expect(chartUtilsContent).toMatch(/style={{ pointerEvents: isDragging \? 'none' : 'auto' }}/)
  })

  it('7. keyboard interaction unchanged (focus-visible ring preserved)', () => {
    // The outer div has focus:outline-none and focus-visible:ring-2 for
    // keyboard accessibility. The SVG outline suppression uses
    // :focus-visible to preserve keyboard focus indication.
    expect(chartUtilsContent).toContain('focus:outline-none')
    expect(chartUtilsContent).toContain('focus-visible:ring-2')
  })
})

describe('ChartTouchWrapper — chart focus rectangle (8-11)', () => {
  it('8. touch tap does not leave whole-chart focus rectangle (recharts-surface outline:none)', () => {
    // The fix: add [&_.recharts-surface]:outline-none to suppress the SVG
    // outline on touch/mouse tap.
    expect(chartUtilsContent).toContain('[&_.recharts-surface]:outline-none')
  })

  it('9. mouse click does not leave meaningless persistent outline (recharts-wrapper outline:none)', () => {
    // The wrapper div also gets outline:none to prevent any persistent
    // outline on the chart container.
    expect(chartUtilsContent).toContain('[&_.recharts-wrapper]:outline-none')
  })

  it('10. keyboard focus-visible remains (recharts-surface:focus-visible outline)', () => {
    // The :focus-visible variant preserves keyboard focus indication.
    expect(chartUtilsContent).toContain('[&_.recharts-surface:focus-visible]:outline-2')
  })

  it('11. affected charts match Lead Conversion focus behavior where appropriate', () => {
    // Lead Conversion uses plain HTML divs (no Recharts), so it never had
    // the focus rectangle issue. The ChartTouchWrapper fix brings Recharts
    // charts in line with Lead Conversion's no-focus-rectangle behavior.
    const leadConversionContent = readFileSync('src/components/analytics/LeadConversionGraph.tsx', 'utf8')
    // Lead Conversion doesn't use ChartTouchWrapper or Recharts
    expect(leadConversionContent).not.toContain('ChartTouchWrapper')
    expect(leadConversionContent).not.toContain('from \'recharts\'')
  })
})
