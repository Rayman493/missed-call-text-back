import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const chartUtils = readSrc('src/lib/chart-utils.tsx')
const revenueGraph = readSrc('src/components/analytics/RevenueGraph.tsx')
const businessActivityGraph = readSrc('src/components/analytics/BusinessActivityGraph.tsx')
const globalsCss = readSrc('src/app/globals.css')

describe('Batch 4B — Dashboard graph interaction cleanup', () => {
  describe('A. Shared architecture', () => {
    it('1. RevenueGraph and BusinessActivityGraph no longer use ChartTouchWrapper', () => {
      expect(revenueGraph).not.toContain('ChartTouchWrapper')
      expect(businessActivityGraph).not.toContain('ChartTouchWrapper')
    })

    it('1b. Vertical scroll is preserved via globals.css touch-action pan-y', () => {
      expect(globalsCss).toMatch(/\.recharts-surface[\s\S]*?touch-action:\s*pan-y/)
      expect(globalsCss).toMatch(/\.recharts-wrapper[\s\S]*?touch-action:\s*pan-y/)
    })

    it('2. line charts gate tooltips on non-touch devices and keep hover trigger', () => {
      expect(revenueGraph).toContain('!isTouchDevice')
      expect(revenueGraph).toMatch(/trigger\s*=\s*(['"])hover\1/)
      expect(businessActivityGraph).toContain('!isTouchDevice')
      expect(businessActivityGraph).toMatch(/trigger\s*=\s*(['"])hover\1/)
    })

    it('3. ChartTouchWrapper installs NO document-level gesture listener', () => {
      expect(chartUtils).not.toContain("document.addEventListener('pointerdown'")
      expect(chartUtils).not.toContain("document.addEventListener('touchstart'")
      expect(chartUtils).not.toContain('hasSelection')
    })
  })

  describe('B. ChartTouchWrapper internals remain available but unused', () => {
    it('4. wrapper still exposes touch handlers in chart-utils', () => {
      expect(chartUtils).toContain('handleTouchStart')
      expect(chartUtils).toContain('handleTouchMove')
      expect(chartUtils).toContain('handleClickCapture')
    })

    it('5. wrapper still maps pointer position to nearest datum', () => {
      expect(chartUtils).toContain('getNearestIndex')
      expect(chartUtils).toContain('activateDatum')
    })
  })

  describe('C. Display-only line charts', () => {
    it('6. RevenueGraph has no activeIndex state', () => {
      expect(revenueGraph).not.toContain('activeIndex')
      expect(revenueGraph).not.toContain('onActiveIndexChange')
    })

    it('7. BusinessActivityGraph has no activeIndex state', () => {
      expect(businessActivityGraph).not.toContain('activeIndex')
      expect(businessActivityGraph).not.toContain('onActiveIndexChange')
    })

    it('8. BusinessActivityGraph legend remains informational only', () => {
      expect(businessActivityGraph).toContain('aria-label="Series legend"')
      expect(businessActivityGraph).not.toContain('onClick={() => toggleSeries(key)}')
      expect(businessActivityGraph).not.toContain('aria-pressed={!hidden}')
    })

    it('9. line charts preserve activeDot for desktop hover accessibility', () => {
      expect(revenueGraph).toContain('activeDot')
      expect(businessActivityGraph).toContain('activeDot')
    })

    it('10. empty tooltip payloads still guard against empty state', () => {
      expect(businessActivityGraph).toContain('if (!active || !payload || payload.length === 0) return null')
    })
  })
})
