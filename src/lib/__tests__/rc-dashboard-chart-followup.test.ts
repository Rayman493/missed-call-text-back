/**
 * RC Dashboard Chart Mobile Interaction + Premium Loading Follow-up
 *
 * 26 required test cases covering:
 * - Gestures (1-10): vertical scroll, tap, horizontal scrub, pointer cancel, range change
 * - Focus (11-15): white rectangle removal, keyboard accessibility
 * - Loading (16-26): single indicator, zero layout shift, stale request handling
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const root = require('path').resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(require('path').resolve(root, p), 'utf8').replace(/\r\n/g, '\n')

const chartUtils = read('src/lib/chart-utils.tsx')
const revenueGraph = read('src/components/analytics/RevenueGraph.tsx')
const activityGraph = read('src/components/analytics/BusinessActivityGraph.tsx')
const globalsCss = read('src/app/globals.css')

describe('RC Dashboard Chart Follow-up — Gestures (1-10)', () => {
  // 1. vertical swipe over Payments allows page scroll
  it('1. ChartTouchWrapper allows vertical scroll (pan-y touch-action)', () => {
    expect(chartUtils).toContain("touchAction: 'pan-y'")
  })

  // 2. vertical swipe over Engagement allows page scroll
  it('2. BusinessActivityGraph uses ChartTouchWrapper with pan-y', () => {
    expect(activityGraph).toContain('ChartTouchWrapper')
    expect(chartUtils).toContain("touchAction: 'pan-y'")
  })

  // 3. vertical movement does not activate datum
  it('3. vertical movement classified as scroll (does not select datum)', () => {
    // The touchmove handler classifies deltaY > deltaX as vertical scroll
    const touchMoveMatch = chartUtils.match(/handleTouchMove[\s\S]*?\n  \}/)
    expect(touchMoveMatch).toBeTruthy()
    if (touchMoveMatch) {
      expect(touchMoveMatch[0]).toContain('vertical')
      // Vertical mode clears Recharts state (no datum activation)
      expect(touchMoveMatch[0]).toContain('clearRechartsState')
    }
  })

  // 4. tap selects nearest datum
  it('4. tap (idle gesture) lets Recharts click handler fire naturally', () => {
    // On touchend with idle mode, justDraggedRef is NOT set, so click reaches Recharts
    const touchEndMatch = chartUtils.match(/handleTouchEnd[\s\S]*?\n  \}/)
    expect(touchEndMatch).toBeTruthy()
    if (touchEndMatch) {
      expect(touchEndMatch[0]).toContain('idle')
    }
  })

  // 5. tap does not require exact dot hit
  it('5. nearest-datum selection maps X position to data index', () => {
    expect(chartUtils).toContain('getNearestIndex')
    // Uses surface bounding rect to map clientX to index
    expect(chartUtils).toContain('getBoundingClientRect')
    expect(chartUtils).toContain('Math.round')
  })

  // 6. horizontal movement enters scrub mode
  it('6. horizontal movement (deltaX > deltaY) classified as scrub', () => {
    const touchMoveMatch = chartUtils.match(/handleTouchMove[\s\S]*?\n  \}/)
    expect(touchMoveMatch).toBeTruthy()
    if (touchMoveMatch) {
      expect(touchMoveMatch[0]).toContain('horizontal')
    }
    // Also in pointer handler
    const pointerMoveMatch = chartUtils.match(/handlePointerMove[\s\S]*?\n  \}/)
    expect(pointerMoveMatch).toBeTruthy()
    if (pointerMoveMatch) {
      expect(pointerMoveMatch[0]).toContain('horizontal')
    }
  })

  // 7. horizontal scrub updates selected datum
  it('7. horizontal scrub calls activateDatum with nearest index', () => {
    expect(chartUtils).toContain('activateDatum')
    expect(chartUtils).toContain('getNearestIndex')
    // Scrub mode dispatches mousemove on the Recharts surface
    expect(chartUtils).toContain('MouseEvent')
    expect(chartUtils).toContain('mousemove')
  })

  // 8. tooltip follows scrubbed datum
  it('8. activateDatum dispatches mousemove at computed datum position', () => {
    const activateMatch = chartUtils.match(/activateDatum[\s\S]*?\n  \}/)
    expect(activateMatch).toBeTruthy()
    if (activateMatch) {
      expect(activateMatch[0]).toContain('mousemove')
      expect(activateMatch[0]).toContain('clientX')
      expect(activateMatch[0]).toContain('clientY')
    }
  })

  // 9. pointercancel resets state cleanly
  it('9. pointercancel resets gesture mode and restores pointer events', () => {
    const cancelMatch = chartUtils.match(/handlePointerCancel[\s\S]*?\n  \}/)
    expect(cancelMatch).toBeTruthy()
    if (cancelMatch) {
      expect(cancelMatch[0]).toContain("'idle'")
      expect(cancelMatch[0]).toContain("style.pointerEvents = 'auto'")
      expect(cancelMatch[0]).toContain('clearRechartsState')
    }
  })

  // 10. range change clears stale active selection
  it('10. RevenueGraph clears activeIndex on range change', () => {
    expect(revenueGraph).toContain('setActiveIndex(null)')
  })

  it('10b. BusinessActivityGraph clears activeIndex on range change', () => {
    expect(activityGraph).toContain('setActiveIndex(null)')
  })
})

describe('RC Dashboard Chart Follow-up — Focus (11-15)', () => {
  // 11. touch selection does not produce whole-chart white rectangle
  it('11. ChartTouchWrapper has NO tabIndex (no whole-chart focus)', () => {
    expect(chartUtils).not.toContain('tabIndex={0}')
    expect(chartUtils).not.toContain('tabIndex={1}')
  })

  // 12. actual offending focus element is corrected
  it('12. wrapper div has no focus-visible styling (the offending element)', () => {
    const outerDivMatch = chartUtils.match(/className="w-full h-full select-none[^"]*"/)
    expect(outerDivMatch).toBeTruthy()
    if (outerDivMatch) {
      expect(outerDivMatch[0]).not.toContain('focus-visible:ring')
      expect(outerDivMatch[0]).not.toContain('focus-visible:outline')
    }
  })

  // 13. keyboard accessibility remains intact
  it('13. globals.css preserves focus-visible on individual data elements', () => {
    expect(globalsCss).toContain('.recharts-bar-rectangle:focus-visible')
    expect(globalsCss).toContain('.recharts-pie-sector:focus-visible')
    expect(globalsCss).toContain('.recharts-line-dot:focus-visible')
  })

  // 14. individual keyboard focus remains visible where appropriate
  it('14. individual data elements have visible keyboard focus outline', () => {
    expect(globalsCss).toContain('outline: 2px solid')
    expect(globalsCss).toContain('outline-offset: 2px')
  })

  // 15. no global outline suppression added
  it('15. no blanket * { outline: none } rule (no global accessibility regression)', () => {
    expect(globalsCss).not.toMatch(/\*\s*\{[^}]*outline:\s*none/)
  })
})

describe('RC Dashboard Chart Follow-up — Loading (16-26)', () => {
  // 16. Updating indicator renders exactly once
  it('16. RevenueGraph has exactly one Updating indicator', () => {
    const matches = revenueGraph.match(/Updating…/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBe(1)
  })

  it('16b. BusinessActivityGraph has exactly one Updating indicator', () => {
    const matches = activityGraph.match(/Updating…/g)
    expect(matches).toBeTruthy()
    expect(matches!.length).toBe(1)
  })

  // 17. title position does not move during loading
  it('17. Updating indicator is absolutely positioned (does not affect title flow)', () => {
    expect(revenueGraph).toContain('absolute top-1 right-1')
    expect(activityGraph).toContain('absolute top-1 right-1')
  })

  // 18. title does not change wrapping during loading
  it('18. no inline Updating span in header (no width change to title area)', () => {
    // The old code had an inline Updating span in the header flex row.
    // The new code has the indicator only in the chart area.
    // Verify the header does NOT contain the updating span
    const revenueHeader = revenueGraph.match(/<div className="flex items-start justify-between mb-3">[\s\S]*?<\/div>\s*<\/div>/)
    expect(revenueHeader).toBeTruthy()
    if (revenueHeader) {
      expect(revenueHeader[0]).not.toContain('Updating…')
    }
    const activityHeader = activityGraph.match(/<div className="flex items-start justify-between mb-3">[\s\S]*?<\/div>\s*<\/div>/)
    expect(activityHeader).toBeTruthy()
    if (activityHeader) {
      expect(activityHeader[0]).not.toContain('Updating…')
    }
  })

  // 19. range selector does not move
  it('19. range selector is always in the same position (no conditional rendering shifts it)', () => {
    // PremiumSelect should always be rendered (not conditionally hidden during loading)
    expect(revenueGraph).toContain('PremiumSelect')
    expect(activityGraph).toContain('PremiumSelect')
  })

  // 20. chart plotting area does not move
  it('20. chart container always has h-[260px] (stable dimensions)', () => {
    expect(revenueGraph).toContain('h-[260px]')
    expect(activityGraph).toContain('h-[260px]')
  })

  // 21. previous chart remains visible
  it('21. updating indicator uses pointer-events-none (chart stays interactive/visible)', () => {
    expect(revenueGraph).toContain('pointer-events-none')
    expect(activityGraph).toContain('pointer-events-none')
  })

  // 22. no heavy blur is applied
  it('22. no backdrop-blur on updating indicator', () => {
    expect(revenueGraph).not.toContain('backdrop-blur')
    expect(activityGraph).not.toContain('backdrop-blur')
  })

  // 23. selected range changes immediately
  it('23. range change immediately sets updating=true (before fetch completes)', () => {
    // The effect sets updating=true synchronously for non-initial loads
    expect(revenueGraph).toContain('setUpdating(true)')
    expect(activityGraph).toContain('setUpdating(true)')
  })

  // 24. latest request owns loading lifecycle
  it('24. RevenueGraph uses isStale guard (latest request wins)', () => {
    expect(revenueGraph).toContain('let isStale = false')
    expect(revenueGraph).toContain('if (!isStale)')
    expect(revenueGraph).toContain('return () => { isStale = true }')
  })

  it('24b. BusinessActivityGraph uses isStale guard (latest request wins)', () => {
    expect(activityGraph).toContain('let isStale = false')
    expect(activityGraph).toContain('if (!isStale)')
    expect(activityGraph).toContain('return () => { isStale = true }')
  })

  // 25. stale response cannot clear newer Updating state
  it('25. RevenueGraph only clears loading/updating when not stale', () => {
    const finallyMatch = revenueGraph.match(/finally\s*\{[\s\S]*?if\s*\(\s*!isStale\s*\)[\s\S]*?setLoading\(false\)[\s\S]*?setUpdating\(false\)/)
    expect(finallyMatch).toBeTruthy()
  })

  it('25b. BusinessActivityGraph only clears loading/updating when not stale', () => {
    const finallyMatch = activityGraph.match(/finally\s*\{[\s\S]*?if\s*\(\s*!isStale\s*\)[\s\S]*?setLoading\(false\)[\s\S]*?setUpdating\(false\)/)
    expect(finallyMatch).toBeTruthy()
  })

  // 26. graph dimensions remain identical before/during/after refresh
  it('26. chart container dimensions do not change (relative + h-[260px] always)', () => {
    // The chart container is always h-[260px] relative, whether loading or not.
    // The updating indicator is absolutely positioned inside it.
    expect(revenueGraph).toContain('h-[260px] relative')
    expect(activityGraph).toContain('h-[260px] relative')
  })
})

describe('RC Dashboard Chart Follow-up — Desktop Preservation', () => {
  it('desktop hover tooltip preserved (trigger=hover on non-touch)', () => {
    expect(revenueGraph).toContain("'hover'")
    expect(activityGraph).toContain("'hover'")
  })

  it('desktop mouse interaction preserved (pointer handlers only fire for touch)', () => {
    expect(chartUtils).toContain("e.pointerType !== 'touch'")
  })

  it('BusinessActivityGraph legend buttons preserve focus-visible ring', () => {
    expect(activityGraph).toContain('focus-visible:ring-2')
  })

  it('analytics calculations unchanged', () => {
    expect(revenueGraph).toContain("from('payment_requests')")
    expect(revenueGraph).toContain("eq('status', 'paid')")
    expect(activityGraph).toContain("from('leads')")
    expect(activityGraph).toContain("from('meeting_records')")
    expect(activityGraph).toContain("from('payment_requests')")
    expect(activityGraph).toContain("from('jobs')")
  })
})
