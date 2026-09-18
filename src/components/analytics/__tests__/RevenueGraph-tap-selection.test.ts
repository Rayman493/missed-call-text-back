import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/analytics/RevenueGraph.tsx', 'utf8').replace(/\r\n/g, '\n')

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

  it('falls back to nearest-x datum selection on chart-area tap', () => {
    // Taps between 18px hit circles resolve to the closest datum index.
    expect(content).toContain('handleChartAreaClick')
    expect(content).toContain('onClick={handleChartAreaClick}')
    expect(content).toContain('.recharts-surface')
    expect(content).toContain('Math.round((relativeX / plotWidth) * (data.length - 1))')
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
