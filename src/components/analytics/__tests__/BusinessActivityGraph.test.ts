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
    expect(content).toMatch(/value=\{seriesFilter\}[\s\S]*?options=\{SERIES_FILTER_OPTIONS\}/)
    expect(content).toMatch(/value=\{timeRange\}[\s\S]*?options=\{ANALYTICS_TIMEFRAME_OPTIONS\}/)
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

  it('does not render tap-selected datum popups or chart touch wrappers', () => {
    expect(content).not.toContain('activeIndex')
    expect(content).not.toContain('ChartDatumPopup')
    expect(content).not.toContain('ChartTouchWrapper')
    expect(content).not.toContain('onActiveIndexChange')
  })

  it('does not attach tap selection handlers to chart data', () => {
    expect(content).not.toMatch(/onClick=\{[^}]*index/)
    expect(content).not.toContain('setSelectedIndex')
  })
})
