import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const chartUtils = readSrc('src/lib/chart-utils.tsx')
const revenueGraph = readSrc('src/components/analytics/RevenueGraph.tsx')
const businessActivityGraph = readSrc('src/components/analytics/BusinessActivityGraph.tsx')

describe('Batch 4B — Dashboard graph interaction cleanup', () => {
  describe('A. Shared architecture', () => {
    it('1. RevenueGraph and BusinessActivityGraph both use ChartTouchWrapper', () => {
      expect(revenueGraph).toContain('ChartTouchWrapper')
      expect(businessActivityGraph).toContain('ChartTouchWrapper')
    })

    it('2. both line charts use hover trigger (not click) for synthetic touch activation', () => {
      expect(revenueGraph).toMatch(/trigger\s*=\s*(['"])hover\1/)
      expect(businessActivityGraph).toMatch(/trigger\s*=\s*(['"])hover\1/)
    })

    it('3. ChartTouchWrapper installs NO document-level gesture listener', () => {
      // The old hasSelection + document-pointerdown dismissal mechanism was
      // removed: any document-level pointer/touch listener on the chart path
      // can contest page scrolling. Outside dismissal now happens through the
      // capture-phase click handler, which cannot trap gestures.
      expect(chartUtils).not.toContain("document.addEventListener('pointerdown'")
      expect(chartUtils).not.toContain("document.addEventListener('touchstart'")
      expect(chartUtils).not.toContain('hasSelection')
    })

    it('4. ChartTouchWrapper dismissal lives in the capture-phase click handler', () => {
      // A tap outside the plottable area clears the tooltip — no document
      // listener lifecycle to leak or to hold the gesture.
      const clickBlock = chartUtils.match(/const handleClickCapture = \([\s\S]*?\n  \}/)
      expect(clickBlock).toBeTruthy()
      expect(clickBlock![0]).toContain('clearRechartsState()')
      expect(clickBlock![0]).toContain('onActiveIndexChange?.(null)')
    })
  })

  describe('B. Outside dismissal and tap behavior', () => {
    it('5. ChartTouchWrapper dismissal is a whitespace click, not a containment check', () => {
      // No document listener means no containment test is needed: a tap that
      // misses the plottable area resolves to idx === null inside
      // handleClickCapture and clears the tooltip there.
      const clickBlock = chartUtils.match(/const handleClickCapture = \([\s\S]*?\n  \}/)
      expect(clickBlock).toBeTruthy()
      expect(clickBlock![0]).toContain('idx === null')
    })

    it('6. outside pointerdown clears selection and notifies consumer', () => {
      expect(chartUtils).toContain('clearRechartsState()')
      expect(chartUtils).toContain('onActiveIndexChange?.(null)')
    })

    it('7. touch tap is handled in capture-phase click handler', () => {
      expect(chartUtils).toContain('lastPointerTypeRef.current !== \'touch\'')
      expect(chartUtils).toContain('const handleClickCapture')
    })

    it('8. desktop click handler only suppresses post-drag clicks', () => {
      expect(chartUtils).toContain('if (justDraggedRef.current)')
    })
  })

  describe('C. Whitespace / empty payload guards', () => {
    it('9. getNearestIndex can return null for taps outside plottable area', () => {
      expect(chartUtils).toContain('clamp = true')
      expect(chartUtils).toContain('if (relativeX < 0 || relativeX > plotWidth) return null')
    })

    it('10. whitespace taps clear state instead of leaving empty selection', () => {
      expect(chartUtils).toContain('// Whitespace or outside the plottable area')
      expect(chartUtils).toContain('if (idx === null)')
    })

    it('11. PremiumTooltip returns null when payload is empty', () => {
      expect(chartUtils).toContain('if (!active || !payload || payload.length === 0)')
      expect(chartUtils).toContain('return null')
    })

    it('12. BusinessActivityGraph custom tooltip also returns null for empty payload', () => {
      expect(businessActivityGraph).toContain('if (!active || !payload || payload.length === 0) return null')
    })
  })
})
