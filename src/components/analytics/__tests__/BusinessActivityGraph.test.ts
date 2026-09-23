import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('BusinessActivityGraph', () => {
  const content = readFileSync('src/components/analytics/BusinessActivityGraph.tsx', 'utf8')

  it('uses a dedicated series filter state instead of legend toggling', () => {
    expect(content).toContain('const [seriesFilter, setSeriesFilter]')
    expect(content).toContain('setSeriesFilter')
    expect(content).not.toContain('const toggleSeries')
    expect(content).not.toContain('setHiddenSeries')
  })

  it('uses a compact funnel filter trigger', () => {
    expect(content).toContain('ChartFilterButton')
    expect(content).toContain('groups={[')
    expect(content).toMatch(/value: seriesFilter[\s\S]*?options: SERIES_FILTER_OPTIONS/)
    expect(content).toMatch(/value: timeRange[\s\S]*?options: ANALYTICS_TIMEFRAME_OPTIONS/)
  })

  it('renders an informational legend, not clickable metric buttons', () => {
    expect(content).not.toContain('aria-pressed={!hidden}')
    expect(content).not.toContain('onClick={() => toggleSeries(key)}')
    expect(content).not.toContain('Tap metrics to show or hide')
    expect(content).toContain('role="group" aria-label="Series legend"')
  })

  it('hides lines according to the explicit series filter', () => {
    expect(content).toContain("hide={seriesFilter !== 'all' && seriesFilter !== 'conversations'}")
    expect(content).toContain("hide={seriesFilter !== 'all' && seriesFilter !== 'appointments'}")
    expect(content).toContain("hide={seriesFilter !== 'all' && seriesFilter !== 'paymentRequests'}")
    expect(content).toContain("hide={seriesFilter !== 'all' && seriesFilter !== 'completedJobs'}")
  })

  it('defines canonical series labels for Appointments, Completed Jobs, Conversations, Payment Requests', () => {
    expect(content).toContain("conversations: 'Conversations'")
    expect(content).toContain("appointments: 'Appointments'")
    expect(content).toContain("paymentRequests: 'Payment Requests'")
    expect(content).toContain("completedJobs: 'Completed Jobs'")
  })

  it('renders per-datum touch targets on every series and tracks the selected datum', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
    expect(content).toContain('ChartHitDot')
    expect(content).toMatch(/dot=\{renderHitDot\('#3b82f6', 'conversations'\)\}/)
    expect(content).toMatch(/dot=\{renderHitDot\('#8b5cf6', 'completedJobs'\)\}/)
  })

  it('resolves every in-plot tap to the nearest datum via the shared helpers', () => {
    expect(content).toContain('handleChartAreaClick')
    expect(content).toContain('onClick={handleChartAreaClick}')
    expect(content).toContain('getChartPlotRect')
    expect(content).toContain('nearestPointIndex(e.clientX, e.clientY, plot, data.length)')
    expect(content).not.toContain('tapHitTolerance')
  })

  it('renders the shared tap-inspect popup anchored to the selected date', () => {
    expect(content).toContain('<ChartSelectionPopup')
    expect(content).toContain('selectedDatum.label')
    expect(content).toContain('anchorX')
  })

  it('dismisses the popup via the shared popup dismissal path', () => {
    expect(content).toContain('onDismiss={() => setSelectedDatum(null)}')
  })
})
