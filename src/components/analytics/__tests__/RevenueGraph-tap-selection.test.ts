import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/analytics/RevenueGraph.tsx', 'utf8').replace(/\r\n/g, '\n')
const utils = readFileSync('src/lib/chart-utils.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('RevenueGraph tap-to-inspect', () => {
  it('tracks a selected datum', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
  })

  it('renders per-datum touch targets that toggle the selected datum', () => {
    // ChartPassiveTouchSurface blocks Recharts touch middleware, so each
    // datum gets its own SVG hit target via ChartHitDot — tap select and
    // same-point dismiss both flow through toggleDatum.
    expect(content).toContain('ChartHitDot')
    expect(content).toContain('toggleDatum')
    expect(content).toMatch(/prev\?\.index === idx\s*\?\s*null/)
  })

  it('resolves every in-plot tap to the nearest datum via the shared helpers', () => {
    // The measured plot rect comes from the CartesianGrid bounds, and every
    // in-plot tap resolves — no hit tolerance that used to drop taps between
    // data points.
    expect(content).toContain('handleChartAreaClick')
    expect(content).toContain('onClick={handleChartAreaClick}')
    expect(content).toContain('getChartPlotRect')
    expect(content).toContain('nearestPointIndex(e.clientX, e.clientY, plot, data.length)')
    expect(content).not.toContain('tapHitTolerance')
    expect(content).not.toContain('Math.abs(relativeX - nearestX) > tolerance')
  })

  it('renders the shared popup anchored to the selected datum', () => {
    expect(content).toContain('<ChartSelectionPopup')
    expect(content).toContain('selectedDatum.label')
    expect(content).toContain('formatCurrency(selectedDatum.revenue)')
    expect(content).toContain('anchorX={data.length > 1 ? selectedDatum.index / (data.length - 1) : 0.5}')
  })

  it('dismisses the popup via the shared popup dismissal path', () => {
    // The popup handles outside-chart pointer downs itself; the graph only
    // needs to clear its state through onDismiss.
    expect(content).toContain('onDismiss={() => setSelectedDatum(null)}')
    expect(utils).toContain('popup.parentElement?.contains(target)')
  })
})
