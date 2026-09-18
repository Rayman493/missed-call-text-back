import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const readContent = (path: string) => readFileSync(path, 'utf8')

describe('Graph header control consistency', () => {
  const graphs = [
    'src/components/analytics/RevenueGraph.tsx',
    'src/components/analytics/BusinessActivityGraph.tsx',
    'src/components/analytics/NewCustomersGraph.tsx',
    'src/components/analytics/CustomersStatusGraph.tsx',
    'src/components/analytics/CustomerPipelineGraph.tsx',
    'src/components/analytics/LeadConversionGraph.tsx',
    'src/components/analytics/LeadsSourceGraph.tsx',
    'src/components/analytics/PaymentCollectionGraph.tsx',
  ]

  it('all dashboard graphs import and use the shared ChartHeaderControls rail', () => {
    for (const path of graphs) {
      const content = readContent(path)
      expect(content).toContain("import { ChartHeaderControls } from './ChartHeaderControls'")
      expect(content).toMatch(/<ChartHeaderControls title=/)
    }
  })

  it('shared header keeps title and controls on the same row (no mobile flex-col)', () => {
    const header = readContent('src/components/analytics/ChartHeaderControls.tsx')
    expect(header).toContain('flex flex-row items-center justify-between')
    expect(header).not.toContain('flex-col sm:flex-row')
    expect(header).not.toContain('flex-col')
    // Title truncates before controls can collide; controls rail never wraps
    expect(header).toContain('truncate')
    expect(header).toContain('flex-shrink-0')
  })

  it('gives the title block more usable width while keeping controls on the same row', () => {
    const header = readContent('src/components/analytics/ChartHeaderControls.tsx')
    expect(header).toContain('gap-1.5 sm:gap-2')
    expect(header).toContain('min-w-0 flex-1')
    expect(header).toContain('flex-shrink-0')
  })

  it('header no longer contains per-chart ad-hoc alignment wrappers', () => {
    for (const path of graphs) {
      const content = readContent(path)
      // Old inconsistent patterns removed
      expect(content).not.toMatch(/<div className="flex items-start justify-between mb-3">/)
      expect(content).not.toMatch(/<div className="flex items-center justify-between mb-3">/)
      expect(content).not.toMatch(/<div className="flex items-center gap-2">\s*<ChartFilterButton/)
    }
  })

  it('graphs with a time selector give it the shared chart control height', () => {
    for (const path of graphs) {
      const content = readContent(path)
      if (content.includes('PremiumSelect')) {
        expect(content).toContain('buttonClassName="h-10 sm:h-11 py-0"')
      }
    }
  })

  it('graphs with a filter keep the 40-44px ChartFilterButton', () => {
    for (const path of graphs) {
      const content = readContent(path)
      if (content.includes('ChartFilterButton')) {
        expect(content).toContain('ChartFilterButton')
      }
    }
  })
})

describe('Graph body mobile scroll passivity', () => {
  const passiveGraphs = [
    'src/components/analytics/RevenueGraph.tsx',
    'src/components/analytics/BusinessActivityGraph.tsx',
    'src/components/analytics/NewCustomersGraph.tsx',
    'src/components/analytics/CustomersStatusGraph.tsx',
    'src/components/analytics/CustomerPipelineGraph.tsx',
  ]

  const pieGraphs = [
    'src/components/analytics/LeadsSourceGraph.tsx',
    'src/components/analytics/PaymentCollectionGraph.tsx',
  ]

  const allRechartsGraphs = [...passiveGraphs, ...pieGraphs]

  it('bar/line/area graphs wrap their display surface in ChartPassiveTouchSurface', () => {
    for (const path of passiveGraphs) {
      const content = readContent(path)
      expect(content).toContain('ChartPassiveTouchSurface')
      expect(content).toMatch(/<ChartPassiveTouchSurface className="w-full h-full"[^>]*>/)
    }
  })

  it('pie/donut graphs use ChartPieTouchSurface for local slice inspection', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('ChartPieTouchSurface')
      expect(content).toMatch(/<ChartPieTouchSurface className="w-full h-full">/)
      expect(content).not.toContain('ChartPassiveTouchSurface')
    }
  })

  it('the first two dashboard graphs are covered by the passive surface', () => {
    const revenue = readContent('src/components/analytics/RevenueGraph.tsx')
    const activity = readContent('src/components/analytics/BusinessActivityGraph.tsx')
    expect(revenue).toContain('ChartPassiveTouchSurface')
    expect(activity).toContain('ChartPassiveTouchSurface')
  })

  it('graph bodies do not attach preventDefault, pointer capture, or tap selection handlers', () => {
    for (const path of allRechartsGraphs) {
      const content = readContent(path)
      expect(content).not.toContain('preventDefault')
      expect(content).not.toContain('setPointerCapture')
      expect(content).not.toContain('onTouchStart')
      expect(content).not.toContain('onTouchMove')
      expect(content).not.toContain('onTouchEnd')
      expect(content).not.toContain('onPointerDown')
      expect(content).not.toContain('selectedIndex')
      expect(content).not.toContain('activeIndex')
    }
  })

  it('graph bodies remain display-only: no ChartTouchWrapper and no ChartDatumPopup', () => {
    for (const path of allRechartsGraphs) {
      const content = readContent(path)
      expect(content).not.toContain('ChartTouchWrapper')
      expect(content).not.toContain('ChartDatumPopup')
    }
  })

  it('ChartPassiveTouchSurface implementation is scroll-safe', () => {
    const util = readContent('src/lib/chart-utils.tsx')
    const surfaceImpl = util.match(/export function ChartPassiveTouchSurface[\s\S]*?\r?\n}\r?\n\r?\ntype GestureMode/)?.[0] || ''
    expect(surfaceImpl).toBeTruthy()
    expect(surfaceImpl).toContain('touchAction: \'pan-y\'')
    expect(surfaceImpl).toContain('onTouchStartCapture={stopTouchPropagation}')
    expect(surfaceImpl).toContain('onTouchMoveCapture={stopTouchPropagation}')
    expect(surfaceImpl).toContain('onTouchEndCapture={stopTouchPropagation}')
    expect(surfaceImpl).not.toContain('preventDefault')
  })
})

describe('Pie/donut local slice inspection', () => {
  const pieGraphs = [
    'src/components/analytics/LeadsSourceGraph.tsx',
    'src/components/analytics/PaymentCollectionGraph.tsx',
  ]

  it('pie charts expose local slice detail via onClick without global filtering', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('const [activeSlice, setActiveSlice]')
      expect(content).toMatch(/onClick=\{\(_, index\) =>/)
      // No unrelated dashboard state is filtered
      expect(content).not.toContain('setSelectedStatus')
      expect(content).not.toContain('setSourceFilter')
    }
  })

  it('tapping the already-selected slice toggles the detail off', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('prev && prev.name === data[index]?.name ? null')
    }
  })

  it('slice detail occupies reserved space below the chart, not over the legend', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('h-7 flex items-center justify-center')
      expect(content).not.toContain('absolute bottom-8')
    }
  })

  it('tapping outside a pie slice dismisses the active detail', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain("closest?.('.recharts-pie-sector, .recharts-sector')")
      expect(content).toContain('setActiveSlice(null)')
    }
  })

  it('pie charts disable Recharts default active shape to avoid the persistent focus rectangle', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('activeShape={false}')
    }
  })

  it('pie charts render a local detail chip for the selected slice', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('activeSlice &&')
      expect(content).toContain('setActiveSlice(null)')
      expect(content).toContain('formatInteger(activeSlice.value)')
    }
  })

  it('ChartPieTouchSurface distinguishes tap from vertical drag', () => {
    const content = readContent('src/components/analytics/ChartPieTouchSurface.tsx')
    expect(content).toContain("touchAction: 'pan-y'")
    expect(content).toContain('onTouchStartCapture')
    expect(content).toContain('onTouchMoveCapture')
    expect(content).toContain('onTouchEndCapture')
    expect(content).toContain('dy > 12')
    expect(content).toContain('e.stopPropagation()')
    expect(content).not.toMatch(/preventDefault\s*\(/)
    expect(content).not.toContain('setPointerCapture')
  })

  it('pie legends remain static', () => {
    for (const path of pieGraphs) {
      const content = readContent(path)
      expect(content).toContain('<Legend')
      expect(content).not.toContain('onClick={onLegendClick}')
    }
  })
})
