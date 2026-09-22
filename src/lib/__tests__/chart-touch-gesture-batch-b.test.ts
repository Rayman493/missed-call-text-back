/**
 * Batch B — dashboard chart interaction hardening
 *
 * Verifies the shared gesture classification, tap hit tolerance,
 * exact-series selection, whitespace dismissal, and white-box suppression
 * implemented for launch QA.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8')

describe('Shared gesture threshold and tap tolerance', () => {
  it('uses a single 10px movement threshold from tap-guard', () => {
    const tapGuard = read('src/lib/gesture/tap-guard.ts')
    expect(tapGuard).toContain('export const GESTURE_MOVEMENT_THRESHOLD = 10')
  })

  it('defines an 18px tap hit tolerance in CHART_STYLES', () => {
    const utils = read('src/lib/chart-utils.tsx')
    expect(utils).toContain('tapHitTolerance: 18')
  })
})

describe('ChartPassiveTouchSurface gesture state machine', () => {
  const util = read('src/lib/chart-utils.tsx')
  const surfaceImpl = util.match(/export function ChartPassiveTouchSurface[\s\S]*?\r?\n}\r?\n\r?\ntype GestureMode/)?.[0] || ''

  it('tracks touch start coordinates and identifier', () => {
    expect(surfaceImpl).toMatch(/startRef\s*=\s*useRef<\{[^}]*x:\s*number[^}]*y:\s*number[^}]*id:\s*number[^}]*\}/)
  })

  it('classifies movement against the canonical 10px threshold', () => {
    expect(surfaceImpl).toMatch(/dx\s*>\s*GESTURE_MOVEMENT_THRESHOLD\s*\|\|\s*dy\s*>\s*GESTURE_MOVEMENT_THRESHOLD/)
  })

  it('flags a drag and suppresses the trailing click only for touch drags', () => {
    expect(surfaceImpl).toContain('isDraggingRef.current = true')
    expect(surfaceImpl).toContain('justDraggedRef.current = true')
    expect(surfaceImpl).toContain('lastPointerTypeRef.current = \'touch\'')
    expect(surfaceImpl).toMatch(/lastPointerTypeRef\.current\s*===\s*'touch'\s*&&\s*justDraggedRef\.current/)
    expect(surfaceImpl).toContain('onClickCapture={handleClickCapture}')
  })

  it('keeps vertical page scroll passive and never calls preventDefault', () => {
    expect(surfaceImpl).toContain('touchAction: \'pan-y\'')
    expect(surfaceImpl).not.toMatch(/e\.preventDefault\s*\(/)
  })
})

describe('ChartPieTouchSurface trailing-click suppression', () => {
  const pieSurface = read('src/components/analytics/ChartPieTouchSurface.tsx')

  it('uses 12px vertical threshold and tracks drag completion', () => {
    expect(pieSurface).toMatch(/dy\s*>\s*12\s*&&\s*dy\s*>\s*dx/)
    expect(pieSurface).toContain('justDraggedRef.current = true')
    expect(pieSurface).toContain('onClickCapture={handleClickCapture}')
  })

  it('does not call e.preventDefault', () => {
    expect(pieSurface).not.toMatch(/e\.preventDefault\s*\(/)
  })
})

describe('ChartSelectionPopup white-box suppression', () => {
  const utils = read('src/lib/chart-utils.tsx')
  const popupImpl = utils.match(/export function ChartSelectionPopup[\s\S]*?\r?\n}\r?\n\r?\ntype/)?.[0] || ''

  it('returns null when there is no label or no meaningful value', () => {
    expect(popupImpl).toContain('!label || !values.some((v) => v.label && v.value != null)')
    expect(popupImpl).toContain('return null')
  })
})

describe('RevenueGraph nearest-x fallback respects tap tolerance', () => {
  const content = read('src/components/analytics/RevenueGraph.tsx')

  it('clears selection when the tap is outside the plot bounds', () => {
    expect(content).toContain('e.clientX < rect.left || e.clientX > rect.right')
    expect(content).toContain('setSelectedDatum(null)')
  })

  it('only selects when the tap is within the hit tolerance of a real datum', () => {
    expect(content).toContain('Math.abs(relativeX - nearestX) > tolerance')
    expect(content).toContain('CHART_STYLES.tapHitTolerance')
  })
})

describe('BusinessActivityGraph exact series selection', () => {
  const content = read('src/components/analytics/BusinessActivityGraph.tsx')

  it('toggleDatum accepts a seriesKey and compares it for toggle/clear', () => {
    expect(content).toContain('const toggleDatum = (idx: number, seriesKey?: string) =>')
    expect(content).toContain('prev?.index === idx && prev?.seriesKey === seriesKey')
  })

  it('payload is reduced to the exact series when seriesKey is provided', () => {
    expect(content).toContain('dataKey: seriesKey')
    expect(content).toContain('data[idx][seriesKey as keyof ActivityData]')
  })

  it('per-series hit dots dispatch the exact series to toggleDatum', () => {
    expect(content).toContain('onSelect={(idx) => toggleDatum(idx, seriesKey)}')
    expect(content).toContain('dot={renderHitDot(\'#3b82f6\', \'conversations\')}')
    expect(content).toContain('dot={renderHitDot(\'#22c55e\', \'appointments\')}')
    expect(content).toContain('dot={renderHitDot(\'#f59e0b\', \'paymentRequests\')}')
    expect(content).toContain('dot={renderHitDot(\'#8b5cf6\', \'completedJobs\')}')
  })

  it('nearest-x fallback uses the shared tap hit tolerance and whitespace clears', () => {
    expect(content).toContain('Math.abs(relativeX - nearestX) > tolerance')
    expect(content).toContain('CHART_STYLES.tapHitTolerance')
  })
})

describe('NewCustomersGraph bar-specific tap handling', () => {
  const content = read('src/components/analytics/NewCustomersGraph.tsx')

  it('attaches onClick to Bar instead of BarChart activeTooltipIndex', () => {
    expect(content).toContain('onClick={(_, index) => toggleDatum(index)}')
    expect(content).not.toMatch(/activeTooltipIndex/)
  })

  it('dismisses on clicks outside a bar rectangle', () => {
    expect(content).toMatch(/closest\?\.\('\.recharts-bar-rectangle'\)/)
    expect(content).toContain('setSelectedDatum(null)')
  })
})

describe('LeadConversionGraph and analytics trend scroll protection', () => {
  it('wraps conversion stage rows in ChartPassiveTouchSurface', () => {
    const content = read('src/components/analytics/LeadConversionGraph.tsx')
    expect(content).toContain('import { ChartSelectionPopup, formatInteger, ChartPassiveTouchSurface } from \'@/lib/chart-utils\'')
    expect(content).toContain('<ChartPassiveTouchSurface className="space-y-4 pt-1">')
  })

  it('wraps analytics trend bars in ChartPassiveTouchSurface', () => {
    const content = read('src/app/analytics/AnalyticsContent.tsx')
    expect(content).toContain('import { ChartSelectionPopup, ChartPassiveTouchSurface } from \'@/lib/chart-utils\'')
    expect(content).toContain('<ChartPassiveTouchSurface className="h-32 sm:h-40">')
    expect(content).toContain('[data-trend-bar]')
  })
})

describe('Consumer charts remain passive and dismiss outside taps', () => {
  const graphs = [
    'src/components/analytics/CustomersStatusGraph.tsx',
    'src/components/analytics/CustomerPipelineGraph.tsx',
  ]

  it('bar charts attach onClick to Bar and dismiss outside the bar rectangle', () => {
    for (const path of graphs) {
      const content = read(path)
      expect(content).toContain('onClick={(_, index) => toggleDatum(index)}')
      expect(content).toMatch(/closest\?\.\('\.recharts-bar-rectangle'\)/)
      expect(content).not.toContain('preventDefault')
    }
  })
})
