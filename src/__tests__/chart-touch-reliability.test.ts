/**
 * BATCH 2 — SHARED DASHBOARD CHART RELIABILITY
 *
 * Physical iOS/Android QA found chart taps needed several attempts, a second
 * point could not be selected while a tooltip was open, multi-series tooltips
 * showed only one series, and popups were detached from the selected datum.
 *
 * Root causes fixed here:
 *
 * A. Line charts: handleChartAreaClick required the tap to land within
 *    min(18px, halfStep) of a datum's X — ~5px on 30d, ~1.7px on 90d — so most
 *    in-plot taps silently CLEARED the selection (feeling like "must tap
 *    outside to deselect first"). Now every in-plot tap resolves to the
 *    nearest datum via shared nearestPointIndex on the measured plot rect.
 *
 * B. Bar charts: <Bar onClick> only fired on the rendered rectangle (3px for
 *    zero values). Taps elsewhere in the band cleared. Now in-plot taps
 *    resolve to the band index via shared nearestBandIndex.
 *
 * C. Multi-series popup: BusinessActivityGraph built a single-series payload
 *    for exact hits and filtered value > 0 for fallback. A selected date now
 *    shows every visible series, zeros included (tapped series first).
 *
 * D. Popup dismissal race: ChartSelectionPopup dismissed on ANY pointerdown
 *    outside itself — including taps on other datums inside the same chart —
 *    and same-datum re-tap could never toggle off (the pointerdown reset
 *    state to null before the click's toggle ran). Dismissal is now scoped
 *    to pointer downs outside the hosting chart container.
 *
 * E. Detached popups: popups were pinned to the chart's top-right corner.
 *    anchorX/anchorY pin the popup beside the selected datum, clamped so it
 *    stays inside the chart card.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  nearestPointIndex,
  nearestBandIndex,
  getChartPlotRect,
} from '@/lib/chart-utils'

const read = (rel: string) =>
  readFileSync(resolve(__dirname, '..', rel), 'utf8').replace(/\r\n/g, '\n')

const utils = read('lib/chart-utils.tsx')
const revenue = read('components/analytics/RevenueGraph.tsx')
const activity = read('components/analytics/BusinessActivityGraph.tsx')
const newCustomers = read('components/analytics/NewCustomersGraph.tsx')
const customersStatus = read('components/analytics/CustomersStatusGraph.tsx')
const pipeline = read('components/analytics/CustomerPipelineGraph.tsx')
const funnel = read('components/analytics/LeadConversionGraph.tsx')

const PLOT = { left: 100, top: 50, width: 300, height: 200 }

// ---------------------------------------------------------------------------
// 1. Pure resolver math — single-tap selection anywhere in the plot
// ---------------------------------------------------------------------------
describe('nearestPointIndex — every in-plot tap resolves', () => {
  it('maps the tap X to the nearest datum index', () => {
    expect(nearestPointIndex(100, 150, PLOT, 4)).toBe(0)
    expect(nearestPointIndex(200, 150, PLOT, 4)).toBe(1) // 100px in → index 1
    expect(nearestPointIndex(300, 150, PLOT, 4)).toBe(2)
    expect(nearestPointIndex(400, 150, PLOT, 4)).toBe(3)
  })

  it('taps BETWEEN two dates resolve to the nearer one (no dead zone)', () => {
    // 30 points: spacing ≈ 10.3px — a tap 5px right of a point must still select
    const plot = { left: 0, top: 0, width: 290, height: 200 }
    expect(nearestPointIndex(15, 100, plot, 30)).toBe(2) // 15/10 → 1.5 → 2
    expect(nearestPointIndex(14, 100, plot, 30)).toBe(1) // 1.4 → 1
  })

  it('a single datum always resolves regardless of tap X', () => {
    expect(nearestPointIndex(250, 150, PLOT, 1)).toBe(0)
  })

  it('taps outside the plot horizontally return null (dismiss)', () => {
    expect(nearestPointIndex(99, 150, PLOT, 4)).toBeNull()
    expect(nearestPointIndex(401, 150, PLOT, 4)).toBeNull()
  })

  it('taps far above/below the plot return null, with slack near the edges', () => {
    expect(nearestPointIndex(200, 10, PLOT, 4)).toBeNull() // 40px above
    expect(nearestPointIndex(200, 22, PLOT, 4)).toBe(1) // 28px slack covers tick inset
    expect(nearestPointIndex(200, 279, PLOT, 4)).toBeNull() // 29px below
  })
})

describe('nearestBandIndex — bar bands are generous targets', () => {
  it('resolves a tap anywhere in a column band (x axis)', () => {
    // 5 bands of 60px each
    expect(nearestBandIndex(110, 60, PLOT, 5, 'x')).toBe(0)
    expect(nearestBandIndex(215, 240, PLOT, 5, 'x')).toBe(1) // high tap still selects
    expect(nearestBandIndex(390, 100, PLOT, 5, 'x')).toBe(4)
  })

  it('resolves a tap anywhere in a row band (y axis, horizontal bars)', () => {
    // 4 rows of 50px each
    expect(nearestBandIndex(150, 60, PLOT, 4, 'y')).toBe(0)
    expect(nearestBandIndex(350, 210, PLOT, 4, 'y')).toBe(3)
  })

  it('clamps to the first/last band at the plot edges', () => {
    expect(nearestBandIndex(100, 100, PLOT, 5, 'x')).toBe(0)
    expect(nearestBandIndex(400, 100, PLOT, 5, 'x')).toBe(4)
    expect(nearestBandIndex(100, 50, PLOT, 4, 'y')).toBe(0)
    expect(nearestBandIndex(100, 250, PLOT, 4, 'y')).toBe(3)
  })

  it('taps outside the resolved axis bounds return null', () => {
    expect(nearestBandIndex(99, 100, PLOT, 5, 'x')).toBeNull()
    expect(nearestBandIndex(100, 49, PLOT, 4, 'y')).toBeNull()
  })

  it('zero-height and short bars select identically (band, not rect)', () => {
    // A tap at the BOTTOM of the band — where a zero bar's 3px stub sits —
    // resolves to the same index as a tap at the top of the band.
    expect(nearestBandIndex(200, 249, PLOT, 5, 'x')).toBe(1)
    expect(nearestBandIndex(200, 51, PLOT, 5, 'x')).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 2. Plot measurement prefers the exact grid bounds over margin math
// ---------------------------------------------------------------------------
describe('getChartPlotRect', () => {
  it('prefers the CartesianGrid bounds (exact plot incl. axis offsets)', () => {
    const container = document.createElement('div')
    const grid = document.createElement('div')
    grid.className = 'recharts-cartesian-grid'
    grid.getBoundingClientRect = () =>
      ({ left: 172, top: 16, right: 472, bottom: 216, width: 300, height: 200, x: 172, y: 16, toJSON: () => {} }) as DOMRect
    const surface = document.createElement('div')
    surface.className = 'recharts-surface'
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 260, width: 500, height: 260, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    container.appendChild(grid)
    container.appendChild(surface)
    expect(getChartPlotRect(container)).toEqual({ left: 172, top: 16, width: 300, height: 200 })
  })

  it('falls back to the surface minus chart margins when no grid exists', () => {
    const container = document.createElement('div')
    const surface = document.createElement('div')
    surface.className = 'recharts-surface'
    surface.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 500, bottom: 260, width: 500, height: 260, x: 0, y: 0, toJSON: () => {} }) as DOMRect
    container.appendChild(surface)
    // margin { top: 16, right: 12, bottom: 8, left: 12 }
    expect(getChartPlotRect(container)).toEqual({ left: 12, top: 16, width: 476, height: 236 })
  })

  it('returns null when nothing measurable exists', () => {
    expect(getChartPlotRect(document.createElement('div'))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. Source contracts — the shared fixes are wired in every chart
// ---------------------------------------------------------------------------
describe('Single-tap selection on line charts', () => {
  it('line graphs resolve taps via getChartPlotRect + nearestPointIndex', () => {
    for (const src of [revenue, activity]) {
      expect(src).toContain('getChartPlotRect')
      expect(src).toContain('nearestPointIndex(e.clientX, e.clientY, plot, data.length)')
      expect(src).not.toContain('tapHitTolerance')
      expect(src).not.toContain('Math.abs(relativeX - nearestX) > tolerance')
    }
  })

  it('tapping another datum while a popup is open replaces the selection', () => {
    // The popup no longer dismisses on in-chart pointer downs — the chart's
    // own click logic runs and selects the new datum immediately.
    const popupImpl = utils.slice(utils.indexOf('export function ChartSelectionPopup'), utils.indexOf('export const CHART_STYLES'))
    expect(popupImpl).toContain('popup.parentElement?.contains(target)')
    // Line graphs keep the same-datum toggle: re-tap the selected point to close
    expect(revenue).toMatch(/prev\?\.index === idx\s*\?\s*null/)
    expect(activity).toContain('prev?.index === idx && prev?.seriesKey === seriesKey')
  })
})

describe('Multi-series popup completeness', () => {
  it('a selected date shows every visible series — no single-series payload', () => {
    const handler = activity.slice(activity.indexOf('const toggleDatum'), activity.indexOf('const handleChartAreaClick'))
    expect(handler).toContain('visibleKeys.map((key) => ({')
    expect(handler).not.toContain('value > 0')
    expect(handler).not.toContain('payload.length === 0')
  })

  it('zero values are rendered, not filtered', () => {
    expect(activity).toContain('value: formatInteger(entry.value)')
    // The shared popup accepts 0 as a meaningful value
    const popupImpl = utils.slice(utils.indexOf('export function ChartSelectionPopup'), utils.indexOf('export const CHART_STYLES'))
    expect(popupImpl).toContain('v.value != null')
  })

  it('the tapped series is listed first for context', () => {
    expect(activity).toContain('a.dataKey === seriesKey ? -1')
  })
})

describe('Popup anchoring inside the chart card', () => {
  it('ChartSelectionPopup supports datum anchoring with in-card clamping', () => {
    const popupImpl = utils.slice(utils.indexOf('export function ChartSelectionPopup'), utils.indexOf('export const CHART_STYLES'))
    expect(popupImpl).toContain('anchorX?:')
    expect(popupImpl).toContain('anchorY?:')
    expect(popupImpl).toContain('getChartPlotRect(container)')
    // Clamped to stay inside: min(max(x, edge), width - edge)
    expect(popupImpl).toContain('Math.min(Math.max(x, edge)')
    expect(popupImpl).toContain('Math.min(Math.max(y, edge)')
    expect(popupImpl).toContain('translateX(-50%)')
  })

  it('line and column charts anchor the popup to the datum X', () => {
    expect(revenue).toContain('anchorX={data.length > 1 ? selectedDatum.index / (data.length - 1) : 0.5}')
    expect(activity).toContain('anchorX={data.length > 1 ? selectedDatum.index / (data.length - 1) : 0.5}')
    expect(newCustomers).toContain('anchorX={(data.indexOf(selectedDatum) + 0.5) / data.length}')
  })

  it('horizontal bar charts anchor the popup to the row Y', () => {
    expect(customersStatus).toContain('anchorY={(displayData.indexOf(selectedDatum) + 0.5) / displayData.length}')
    expect(pipeline).toContain('anchorY={(displayData.indexOf(selectedDatum) + 0.5) / displayData.length}')
  })
})

describe('Bar charts — generous band targets', () => {
  it('in-plot taps resolve to the column band', () => {
    expect(newCustomers).toContain("nearestBandIndex(e.clientX, e.clientY, plot, data.length, 'x')")
  })

  it('horizontal bars resolve to the row band', () => {
    for (const src of [customersStatus, pipeline]) {
      expect(src).toContain("nearestBandIndex(e.clientX, e.clientY, plot, displayData.length, 'y')")
    }
  })

  it('direct bar taps still go through Bar onClick (no double-toggle)', () => {
    for (const src of [newCustomers, customersStatus, pipeline]) {
      // Early return keeps the bar's own onClick from being handled twice
      expect(src).toContain("closest?.('.recharts-bar-rectangle')")
      expect(src).toContain('onClick={(_, index) => toggleDatum(index)}')
    }
  })
})

describe('Consistent dismissal semantics', () => {
  it('the popup ignores pointer downs inside its own chart container', () => {
    const popupImpl = utils.slice(utils.indexOf('export function ChartSelectionPopup'), utils.indexOf('export const CHART_STYLES'))
    // Outside-container → dismiss; inside → chart decides (replaces or toggles)
    expect(popupImpl).toContain('if (popup.parentElement?.contains(target)) return')
    expect(popupImpl).toContain("window.addEventListener('pointerdown'")
  })

  it('every selection path can clear via setSelectedDatum(null)', () => {
    for (const src of [revenue, activity, newCustomers, customersStatus, pipeline, funnel]) {
      expect(src).toContain('setSelectedDatum(null)')
    }
  })

  it('re-tapping the same datum toggles the popup off then back on', () => {
    // Same functional-toggle contract on every categorical chart
    for (const src of [newCustomers, customersStatus, pipeline, funnel]) {
      expect(src).toMatch(/prev[\s\S]{0,80}\?\s*null\s*:/)
    }
    expect(revenue).toMatch(/prev\?\.index === idx\s*\?\s*null/)
    expect(activity).toContain('? null\n        : { index: idx')
  })
})

describe('Analytics trend chart — whole column is the target', () => {
  const trend = read('app/analytics/AnalyticsContent.tsx')

  it('the column band owns the tap, not just the rendered bar', () => {
    expect(trend).toContain('data-trend-col')
    expect(trend).toMatch(/data-trend-col[\s\S]*?onClick=\{[\s\S]*?setSelectedDatum/)
    // Column stretches to full height so whitespace above a short bar selects
    expect(trend).toContain('self-stretch')
    // Whitespace between columns still clears
    expect(trend).toContain("closest?.('[data-trend-col]')")
  })
})

describe('Desktop interaction preserved', () => {
  it('Recharts hover Tooltip remains for non-touch devices on all Recharts graphs', () => {
    for (const src of [revenue, activity, newCustomers, customersStatus, pipeline]) {
      expect(src).toContain('{!isTouchDevice && (')
      expect(src).toContain('<Tooltip')
    }
  })

  it('per-datum hit dots keep generous invisible targets (18px radius)', () => {
    expect(utils).toContain('r={CHART_STYLES.tapHitTolerance}')
    expect(utils).toContain('tapHitTolerance: 18')
  })

  it('scroll passivity is unchanged — no preventDefault or pointer capture added', () => {
    for (const src of [revenue, activity, newCustomers, customersStatus, pipeline]) {
      expect(src).not.toContain('preventDefault')
      expect(src).not.toContain('setPointerCapture')
    }
  })
})
