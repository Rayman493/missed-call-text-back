import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('BusinessActivityGraph', () => {
  const content = readFileSync('src/components/analytics/BusinessActivityGraph.tsx', 'utf8')

  it('tracks hidden series state and toggles series visibility', () => {
    expect(content).toContain('const [hiddenSeries, setHiddenSeries]')
    expect(content).toContain('const toggleSeries =')
    expect(content).toContain('setHiddenSeries((prev) =>')
  })

  it('renders metric controls as buttons with aria-pressed', () => {
    expect(content).toContain('aria-pressed={!hidden}')
    expect(content).toContain('type="button"')
    expect(content).toContain('onClick={() => toggleSeries(key)}')
  })

  it('shows a discoverability hint near the metrics', () => {
    expect(content).toContain('Tap metrics to show or hide')
  })

  it('visually distinguishes hidden metrics beyond color alone', () => {
    expect(content).toContain('opacity-40 line-through')
    expect(content).toContain('opacity-100')
  })

  it('reserves extra vertical space for the wrapped legend', () => {
    expect(content).toContain('height={64}')
  })

  it('keeps a clear gap between x-axis labels and the legend', () => {
    expect(content).toContain('bottom: 12')
  })

  it('uses touch-friendly metric control sizing', () => {
    expect(content).toContain('min-h-[28px]')
  })

  it('includes accessible labels for showing or hiding each metric', () => {
    expect(content).toContain('aria-label={`${hidden ? \'Show\' : \'Hide\'} ${label}`}')
  })

  it('does not merge date-range and metric-filter concepts', () => {
    expect(content).toContain('ANALYTICS_TIMEFRAME_OPTIONS')
    expect(content).toContain('setTimeRange')
    expect(content).toContain('setHiddenSeries')
  })

  it('keeps the Last 30 Days / time-range selector independent of metric toggles', () => {
    expect(content).toContain('value={timeRange}')
    expect(content).toContain('onChange={setTimeRange}')
  })

  it('defines canonical series labels for Appointments, Completed Jobs, Conversations, Payment Requests', () => {
    expect(content).toContain("conversations: 'Conversations'")
    expect(content).toContain("appointments: 'Appointments'")
    expect(content).toContain("paymentRequests: 'Payment Requests'")
    expect(content).toContain("completedJobs: 'Completed Jobs'")
  })
})
