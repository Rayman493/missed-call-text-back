/**
 * Lower dashboard graphs — display-only contract
 *
 * Verifies that Recharts graphs no longer use tap-to-select, selected datum
 * popups, or chart touch wrappers, while still supporting explicit filters.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8')

describe('CustomerPipelineGraph', () => {
  const content = read('src/components/analytics/CustomerPipelineGraph.tsx')

  it('uses a compact funnel filter trigger', () => {
    expect(content).toContain('ChartFilterButton')
    expect(content).toMatch(/value=\{statusFilter\}[\s\S]*?options=\{PIPELINE_STATUS_OPTIONS\}/)
  })

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('does not select bars or render a selected-datum popup', () => {
    expect(content).not.toContain('const [selectedIndex')
    expect(content).not.toContain('setSelectedIndex')
    expect(content).not.toContain('<ChartDatumPopup')
  })

  it('does not attach tap selection handlers to chart data', () => {
    expect(content).not.toMatch(/onClick=\{[^}]*index/)
  })
})

describe('CustomersStatusGraph', () => {
  const content = read('src/components/analytics/CustomersStatusGraph.tsx')

  it('uses a compact funnel filter trigger', () => {
    expect(content).toContain('ChartFilterButton')
    expect(content).toMatch(/value=\{statusFilter\}[\s\S]*?options=\{STATUS_FILTER_OPTIONS\}/)
  })

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('does not select bars or render a selected-datum popup', () => {
    expect(content).not.toContain('const [selectedIndex')
    expect(content).not.toContain('setSelectedIndex')
    expect(content).not.toContain('<ChartDatumPopup')
  })
})

describe('NewCustomersGraph', () => {
  const content = read('src/components/analytics/NewCustomersGraph.tsx')

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('does not select bars or render a selected-datum popup', () => {
    expect(content).not.toContain('const [selectedIndex')
    expect(content).not.toContain('setSelectedIndex')
    expect(content).not.toContain('<ChartDatumPopup')
  })
})

describe('PaymentCollectionGraph', () => {
  const content = read('src/components/analytics/PaymentCollectionGraph.tsx')

  it('does not wrap chart in ChartTouchWrapper', () => {
    expect(content).not.toContain('<ChartTouchWrapper')
  })

  it('does not select slices or change the center label on tap', () => {
    expect(content).not.toContain('const [selectedIndex')
    expect(content).not.toContain('setSelectedIndex')
    expect(content).not.toContain('selectedIndex !== null')
    expect(content).not.toContain('selected.value')
    expect(content).not.toContain('selected.name')
  })
})

describe('LeadsSourceGraph', () => {
  const content = read('src/components/analytics/LeadsSourceGraph.tsx')

  it('does not wrap chart in ChartTouchWrapper', () => {
    expect(content).not.toContain('<ChartTouchWrapper')
  })

  it('does not select slices or change the center label on tap', () => {
    expect(content).not.toContain('const [selectedIndex')
    expect(content).not.toContain('setSelectedIndex')
    expect(content).not.toContain('selectedIndex !== null')
    expect(content).not.toContain('selected.value')
    expect(content).not.toContain('selected.name')
  })
})

describe('First-two graphs are unchanged', () => {
  it('RevenueGraph does NOT disable activeBar (line chart, no bar selection issue)', () => {
    const content = read('src/components/analytics/RevenueGraph.tsx')
    expect(content).not.toContain('activeBar={false}')
  })

  it('BusinessActivityGraph does NOT disable activeBar (line chart)', () => {
    const content = read('src/components/analytics/BusinessActivityGraph.tsx')
    expect(content).not.toContain('activeBar={false}')
  })
})
