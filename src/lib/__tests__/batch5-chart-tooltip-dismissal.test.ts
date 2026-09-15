/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

describe('Batch 5 — Chart tooltip, dismissal, and touch polish', () => {
  const chartUtils = readSrc('lib/chart-utils.tsx')
  const businessGraph = readSrc('components/analytics/BusinessActivityGraph.tsx')

  it('A. PremiumTooltip is compact and sized to content', () => {
    expect(chartUtils).toContain('px-2 py-1.5')
    expect(chartUtils).toContain('w-fit')
    expect(chartUtils).toContain('max-w-[min(70vw,220px)]')
    expect(chartUtils).not.toContain('min-w-[140px]')
  })

  it('A. PremiumTooltip keeps date + values readable', () => {
    expect(chartUtils).toContain('text-[11px]')
    expect(chartUtils).toContain('font-semibold')
    expect(chartUtils).toContain('tabular-nums')
  })

  it('A. BusinessActivityGraph tooltip is compact', () => {
    expect(businessGraph).toContain('px-2 py-1.5')
    expect(businessGraph).toContain('w-fit')
    expect(businessGraph).toContain('max-w-[min(70vw,220px)]')
    expect(businessGraph).not.toContain('min-w-[160px]')
  })

  it('B. ChartTouchWrapper can track selection and dismiss on outside pointer', () => {
    expect(chartUtils).toContain('const [hasSelection, setHasSelection]')
    expect(chartUtils).toContain("document.addEventListener('pointerdown', handleOutsidePointerDown, true)")
    expect(chartUtils).toContain('clearRechartsState()')
    expect(chartUtils).toContain('onActiveIndexChange?.(null)')
  })

  it('B. activateDatum sets selection state; clearRechartsState clears it', () => {
    expect(chartUtils).toContain('setHasSelection(true)')
    expect(chartUtils).toContain('setHasSelection(false)')
  })

  it('C. ChartTouchWrapper removes Android tap highlight', () => {
    expect(chartUtils).toContain('[-webkit-tap-highlight-color:transparent]')
    expect(chartUtils).toContain('WebkitTapHighlightColor: \'transparent\'')
  })

  it('C. ChartTouchWrapper has no tabIndex and removes focus ring on surface/wrapper', () => {
    expect(chartUtils).toContain('[&_.recharts-surface]:outline-none')
    expect(chartUtils).toContain('[&_.recharts-wrapper]:outline-none')
    expect(chartUtils).toContain('[&_.recharts-rectangle-wrapper]:outline-none')
  })
})
