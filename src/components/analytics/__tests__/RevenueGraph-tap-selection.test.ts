import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/analytics/RevenueGraph.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('RevenueGraph tap-to-inspect', () => {
  it('tracks a selected datum', () => {
    expect(content).toContain('const [selectedDatum, setSelectedDatum]')
  })

  it('attaches a tap handler to the line chart using activeTooltipIndex', () => {
    expect(content).toMatch(/onClick=\{\(e: any\) => \{[\s\S]*?activeTooltipIndex/)
  })

  it('renders a small data popup for the selected datum', () => {
    expect(content).toContain('selectedDatum.label')
    expect(content).toContain('formatCurrency(selectedDatum.revenue)')
  })

  it('dismisses the popup on a tap outside the chart wrapper', () => {
    expect(content).toContain('chartWrapperRef')
    expect(content).toContain("document.addEventListener('pointerdown'")
    expect(content).toMatch(/!chartWrapperRef\.current\.contains\(target\)[\s\S]*?setSelectedDatum\(null\)/)
  })
})
