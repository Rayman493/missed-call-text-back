/**
 * Lower dashboard graphs — per-datum selection polish
 *
 * Verifies that the remaining (non-first-two) Recharts graphs select exactly
 * one datum at a time, never render a broad active-bar rectangle, and surface
 * useful context for the selected datum.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8')

describe('CustomerPipelineGraph', () => {
  const content = read('src/components/analytics/CustomerPipelineGraph.tsx')

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('selects a single bar via Bar onClick and toggles selection', () => {
    expect(content).toMatch(/setSelectedIndex\(\(prev\) => \(prev === index \? null : index\)\)/)
  })

  it('shows selected datum context in a floating popup', () => {
    expect(content).toMatch(/selectedIndex !== null && (?:data|displayData)\[selectedIndex\]/)
    expect(content).toMatch(/(?:data|displayData)\[selectedIndex\]\.status/)
    expect(content).toMatch(/(?:data|displayData)\[selectedIndex\]\.count/)
  })

  it('clears selection when tapping chart background/surface', () => {
    expect(content).toContain("e.target === e.currentTarget")
    expect(content).toContain("closest?")
    expect(content).toContain('setSelectedIndex(null)')
  })
})

describe('CustomersStatusGraph', () => {
  const content = read('src/components/analytics/CustomersStatusGraph.tsx')

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('selects a single bar via Bar onClick and toggles selection', () => {
    expect(content).toMatch(/setSelectedIndex\(\(prev\) => \(prev === index \? null : index\)\)/)
  })

  it('shows selected datum context in a floating popup', () => {
    expect(content).toMatch(/selectedIndex !== null && (?:data|displayData)\[selectedIndex\]/)
    expect(content).toMatch(/(?:data|displayData)\[selectedIndex\]\.status/)
    expect(content).toMatch(/(?:data|displayData)\[selectedIndex\]\.count/)
  })
})

describe('NewCustomersGraph', () => {
  const content = read('src/components/analytics/NewCustomersGraph.tsx')

  it('disables Recharts activeBar to avoid the broad selection rectangle', () => {
    expect(content).toContain('activeBar={false}')
  })

  it('selects a single bar via Bar onClick and toggles selection', () => {
    expect(content).toMatch(/setSelectedIndex\(\(prev\) => \(prev === index \? null : index\)\)/)
  })

  it('shows selected datum context in the summary area', () => {
    expect(content).toMatch(/selectedIndex !== null && data\[selectedIndex\]/)
    expect(content).toMatch(/data\[selectedIndex\]\.date/)
    expect(content).toMatch(/data\[selectedIndex\]\.customers/)
  })
})

describe('PaymentCollectionGraph', () => {
  const content = read('src/components/analytics/PaymentCollectionGraph.tsx')

  it('uses ChartTouchWrapper chartType="pie" so taps reach the Pie onClick', () => {
    expect(content).toContain('<ChartTouchWrapper chartType="pie">')
  })

  it('selects a single pie slice via Pie onClick and toggles selection', () => {
    expect(content).toMatch(/setSelectedIndex\(selectedIndex === index \? null : index\)/)
  })

  it('shows selected slice context in the center label', () => {
    expect(content).toMatch(/if \(selectedIndex !== null && data\[selectedIndex\]\)/)
    expect(content).toMatch(/selected\.value/)
    expect(content).toMatch(/selected\.name/)
  })

  it('clears selection when tapping outside the pie', () => {
    expect(content).toContain('<div onClick={() => setSelectedIndex(null)}')
  })
})

describe('LeadsSourceGraph', () => {
  const content = read('src/components/analytics/LeadsSourceGraph.tsx')

  it('uses ChartTouchWrapper chartType="pie" so taps reach the Pie onClick', () => {
    expect(content).toContain('<ChartTouchWrapper chartType="pie">')
  })

  it('selects a single pie slice via Pie onClick and toggles selection', () => {
    expect(content).toMatch(/setSelectedIndex\(selectedIndex === index \? null : index\)/)
  })

  it('shows selected slice context in the center label', () => {
    expect(content).toMatch(/if \(selectedIndex !== null && data\[selectedIndex\]\)/)
    expect(content).toMatch(/selected\.value/)
    expect(content).toMatch(/selected\.name/)
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
