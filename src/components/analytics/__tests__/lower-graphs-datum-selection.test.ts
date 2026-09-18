/**
 * Lower dashboard graphs — tap-to-select contract
 *
 * Verifies that every dashboard bar chart supports physical Android tap
 * selection via Bar onClick, shows a ChartSelectionPopup, and dismisses
 * on outside tap — while pie charts preserve their existing slice behavior.
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

  it('tracks a selected datum and attaches onClick to Bar', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
    expect(content).toContain('onClick={(_, index) => toggleDatum(index)}')
  })

  it('renders a ChartSelectionPopup for the selected datum', () => {
    expect(content).toContain('<ChartSelectionPopup')
    expect(content).toContain('selectedDatum.status')
    expect(content).toContain('selectedDatum.count')
  })

  it('dismisses the popup on a tap outside the bar area', () => {
    expect(content).toMatch(/closest\?\.\('\.recharts-bar-rectangle'\)[\s\S]*?setSelectedDatum\(null\)/)
  })

  it('does not use point hit circles for bar selection', () => {
    expect(content).not.toContain('ChartHitDot')
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

  it('tracks a selected datum and attaches onClick to Bar', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
    expect(content).toContain('onClick={(_, index) => toggleDatum(index)}')
  })

  it('renders a ChartSelectionPopup for the selected datum', () => {
    expect(content).toContain('<ChartSelectionPopup')
    expect(content).toContain('selectedDatum.status')
    expect(content).toContain('selectedDatum.count')
  })

  it('dismisses the popup on a tap outside the bar area', () => {
    expect(content).toMatch(/closest\?\.\('\.recharts-bar-rectangle'\)[\s\S]*?setSelectedDatum\(null\)/)
  })
})

describe('NewCustomersGraph', () => {
  const content = read('src/components/analytics/NewCustomersGraph.tsx')

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('tracks a selected datum and attaches onClick to Bar', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
    expect(content).toContain('onClick={(_, index) => toggleDatum(index)}')
  })

  it('renders a ChartSelectionPopup for the selected datum', () => {
    expect(content).toContain('<ChartSelectionPopup')
    expect(content).toContain('selectedDatum.date')
    expect(content).toContain('selectedDatum.customers')
  })

  it('dismisses the popup on a tap outside the bar area', () => {
    expect(content).toMatch(/closest\?\.\('\.recharts-bar-rectangle'\)[\s\S]*?setSelectedDatum\(null\)/)
  })
})

describe('LeadConversionGraph', () => {
  const content = read('src/components/analytics/LeadConversionGraph.tsx')

  it('tracks a selected datum and attaches onClick to each stage row', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
    expect(content).toContain('data-conversion-stage')
    expect(content).toMatch(/onClick=\{[\s\S]*?setSelectedDatum/)
  })

  it('renders a ChartSelectionPopup for the selected stage', () => {
    expect(content).toContain('<ChartSelectionPopup')
    expect(content).toContain('selectedDatum.name')
    expect(content).toContain('selectedDatum.count')
    expect(content).toContain('selectedDatum.percentage')
  })

  it('dismisses the popup on a tap outside a stage row', () => {
    expect(content).toMatch(/closest\?\.\('\[data-conversion-stage\]'\)[\s\S]*?setSelectedDatum\(null\)/)
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
