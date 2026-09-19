import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8').replace(/\r\n/g, '\n')

describe('RC Batch 4 — Dashboard Chart Mobile Interaction + Loading Polish', () => {
  describe('1. Scroll interference — touch-action CSS', () => {
    it('globals.css sets touch-action: pan-y on recharts-surface', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-surface[\s\S]*?touch-action:\s*pan-y/)
    })

    it('globals.css sets touch-action: pan-y on recharts-wrapper', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-wrapper[\s\S]*?touch-action:\s*pan-y/)
    })

    it('globals.css sets touch-action: pan-y on recharts-rectangle-wrapper', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-rectangle-wrapper[\s\S]*?touch-action:\s*pan-y/)
    })

    it('ChartTouchWrapper has pan-y touch-action on outer div (vertical scroll preserved)', () => {
      const content = read('src/lib/chart-utils.tsx')
      expect(content).toContain("touchAction: 'pan-y'")
    })

    it('ChartTouchWrapper uses canonical 10px gesture threshold', () => {
      const content = read('src/lib/chart-utils.tsx')
      expect(content).toContain('GESTURE_MOVEMENT_THRESHOLD')
      expect(content).toContain("from '@/lib/gesture/tap-guard'")
    })

    it('ChartTouchWrapper does NOT use setTimeout', () => {
      const content = read('src/lib/chart-utils.tsx')
      const codeLines = content.split('\n').filter(line => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*')
      })
      const codeWithoutComments = codeLines.join('\n')
      expect(codeWithoutComments).not.toContain('setTimeout')
    })

    it('ChartTouchWrapper does NOT use requestAnimationFrame', () => {
      const content = read('src/lib/chart-utils.tsx')
      const codeLines = content.split('\n').filter(line => {
        const trimmed = line.trim()
        return !trimmed.startsWith('//') && !trimmed.startsWith('*')
      })
      const codeWithoutComments = codeLines.join('\n')
      expect(codeWithoutComments).not.toContain('requestAnimationFrame')
    })

    it('ChartTouchWrapper suppresses pointer events only during drag (not on pointerdown)', () => {
      const content = read('src/lib/chart-utils.tsx')
      const pointerDownBlock = content.match(/const handlePointerDown = \([\s\S]*?\n  \}/)
      if (pointerDownBlock) {
        expect(pointerDownBlock[0]).not.toContain('disableChartPointerEvents')
      }
      const touchStartBlock = content.match(/const handleTouchStart = \([\s\S]*?\n  \}/)
      if (touchStartBlock) {
        expect(touchStartBlock[0]).not.toContain('disableChartPointerEvents')
      }
    })

    it('ChartTouchWrapper resets drag state synchronously on touch end', () => {
      const content = read('src/lib/chart-utils.tsx')
      const funcStart = content.indexOf('const handleTouchEnd')
      const funcEnd = content.indexOf('\n  }', funcStart)
      if (funcStart !== -1 && funcEnd !== -1) {
        const handlerBody = content.substring(funcStart, funcEnd)
        const codeLines = handlerBody.split('\n').filter(line => {
          const trimmed = line.trim()
          return !trimmed.startsWith('//') && !trimmed.startsWith('*')
        })
        const codeBody = codeLines.join('\n')
        expect(codeBody).not.toContain('setTimeout')
        expect(codeBody).not.toContain('requestAnimationFrame')
      }
    })

    it('ChartTouchWrapper suppresses post-drag click via capture phase', () => {
      const content = read('src/lib/chart-utils.tsx')
      expect(content).toContain('handleClickCapture')
      expect(content).toContain('justDraggedRef')
    })
  })

  describe('2. Whole-chart white box — focus outline suppression', () => {
    it('globals.css suppresses :focus on recharts-surface', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-surface:focus/)
      expect(css).toMatch(/\.recharts-surface:focus[\s\S]*?outline:\s*none/)
    })

    it('globals.css suppresses :focus-visible on recharts-surface', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-surface:focus-visible/)
      expect(css).toMatch(/\.recharts-surface:focus-visible[\s\S]*?outline:\s*none/)
    })

    it('globals.css suppresses :focus on recharts-wrapper', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-wrapper:focus/)
      expect(css).toMatch(/\.recharts-wrapper:focus[\s\S]*?outline:\s*none/)
    })

    it('globals.css suppresses :focus-visible on recharts-wrapper', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-wrapper:focus-visible/)
      expect(css).toMatch(/\.recharts-wrapper:focus-visible[\s\S]*?outline:\s*none/)
    })

    it('globals.css suppresses :focus and :focus-visible on recharts-rectangle-wrapper', () => {
      const css = read('src/app/globals.css')
      expect(css).toMatch(/\.recharts-rectangle-wrapper:focus/)
      expect(css).toMatch(/\.recharts-rectangle-wrapper:focus-visible/)
    })

    it('globals.css does NOT globally disable all outlines (preserves data element focus)', () => {
      const css = read('src/app/globals.css')
      // Keyboard accessibility preserved on individual data elements
      expect(css).toContain('.recharts-bar-rectangle:focus-visible')
      expect(css).toContain('.recharts-pie-sector:focus-visible')
      expect(css).toContain('.recharts-line-dot:focus-visible')
      expect(css).toContain('outline: 2px solid')
    })

    it('no blanket "outline: none" on all elements (no global accessibility regression)', () => {
      const css = read('src/app/globals.css')
      // Should NOT have a global * { outline: none } rule
      expect(css).not.toMatch(/\*\s*\{[^}]*outline:\s*none/)
    })
  })

  describe('3. Point/bar-level selection — touch popups removed', () => {
    it('RevenueGraph gates Tooltip on non-touch devices', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('!isTouchDevice')
      expect(content).toMatch(/trigger\s*=\s*(['"])hover\1/)
    })

    it('RevenueGraph does not use ChartTouchWrapper', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).not.toContain('ChartTouchWrapper')
    })

    it('BusinessActivityGraph gates Tooltip on non-touch devices', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('!isTouchDevice')
      expect(content).toMatch(/trigger\s*=\s*(['"])hover\1/)
    })

    it('BusinessActivityGraph does not use ChartTouchWrapper', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).not.toContain('ChartTouchWrapper')
    })

    it('line graphs still preserve activeDot for desktop hover', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      expect(revenue).toContain('activeDot')
    })
  })

  describe('4. Loading state — immediate updating indicator', () => {
    it('RevenueGraph has updating state', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('const [updating, setUpdating] = useState(false)')
    })

    it('RevenueGraph sets updating=true on subsequent range changes', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('setUpdating(true)')
    })

    it('RevenueGraph sets updating=false in finally block', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('setUpdating(false)')
    })

    it('RevenueGraph shows Updating indicator text', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('Updating…')
    })

    it('RevenueGraph uses hasInitialLoadRef to distinguish initial vs subsequent', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('hasInitialLoadRef')
    })

    it('RevenueGraph does NOT set loading=true on subsequent range changes', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      // The only setLoading(true) should be in the initial state, not in the effect
      const effectMatch = content.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]*?\},\s*\[business,\s*timeRange\]\)/)
      if (effectMatch) {
        // Should not contain setLoading(true) in the effect body (only in finally as false)
        const effectBody = effectMatch[0]
        expect(effectBody).not.toContain('setLoading(true)')
      }
    })

    it('RevenueGraph chart container keeps stable h-[260px] height during update', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      // The chart container should always be h-[260px], and the updating
      // indicator should be absolute positioned (not replacing the chart)
      expect(content).toContain('h-[260px]')
      expect(content).toContain('relative')
      // New: single subtle indicator at top-right, NOT a full overlay
      expect(content).toContain('absolute top-1 right-1')
    })

    it('RevenueGraph updating indicator does not blank the chart (pointer-events-none)', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('pointer-events-none')
    })

    it('RevenueGraph does NOT use heavy blur overlay (no backdrop-blur)', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).not.toContain('backdrop-blur')
    })

    it('RevenueGraph has exactly one Updating indicator (no duplicate in header)', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      // Count occurrences of "Updating…" — should be exactly 1
      const matches = content.match(/Updating…/g)
      expect(matches).toBeTruthy()
      expect(matches!.length).toBe(1)
    })

    it('BusinessActivityGraph has updating state', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('const [updating, setUpdating] = useState(false)')
    })

    it('BusinessActivityGraph sets updating=true on subsequent range changes', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('setUpdating(true)')
    })

    it('BusinessActivityGraph sets updating=false in finally block', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('setUpdating(false)')
    })

    it('BusinessActivityGraph shows Updating indicator text', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('Updating…')
    })

    it('BusinessActivityGraph uses hasInitialLoadRef to distinguish initial vs subsequent', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('hasInitialLoadRef')
    })

    it('BusinessActivityGraph chart container keeps stable h-[260px] height during update', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('h-[260px]')
      expect(content).toContain('relative')
      // New: single subtle indicator at top-right, NOT a full overlay
      expect(content).toContain('absolute top-1 right-1')
    })

    it('BusinessActivityGraph updating indicator does not blank the chart (pointer-events-none)', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('pointer-events-none')
    })

    it('BusinessActivityGraph does NOT use heavy blur overlay (no backdrop-blur)', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).not.toContain('backdrop-blur')
    })

    it('BusinessActivityGraph has exactly one Updating indicator (no duplicate in header)', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      const matches = content.match(/Updating…/g)
      expect(matches).toBeTruthy()
      expect(matches!.length).toBe(1)
    })

    it('updating indicator uses aria-live for accessibility', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(revenue).toContain('aria-live="polite"')
      expect(activity).toContain('aria-live="polite"')
    })

    it('updating indicator uses a spinner (animate-spin)', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(revenue).toContain('animate-spin')
      expect(activity).toContain('animate-spin')
    })
  })

  describe('5. Stale/rapid range handling', () => {
    it('RevenueGraph uses isStale guard to prevent stale data commits', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      expect(content).toContain('let isStale = false')
      expect(content).toContain('if (!isStale)')
      expect(content).toContain('return () => { isStale = true }')
    })

    it('RevenueGraph only commits data when not stale', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      // setData should be guarded by !isStale
      const dataCommitMatch = content.match(/if\s*\(\s*!isStale\s*\)\s*\{[\s\S]*?setData/)
      expect(dataCommitMatch).toBeTruthy()
    })

    it('RevenueGraph only clears loading/updating when not stale', () => {
      const content = read('src/components/analytics/RevenueGraph.tsx')
      // setLoading(false) and setUpdating(false) should be guarded by !isStale
      const finallyMatch = content.match(/finally\s*\{[\s\S]*?if\s*\(\s*!isStale\s*\)[\s\S]*?setLoading\(false\)[\s\S]*?setUpdating\(false\)/)
      expect(finallyMatch).toBeTruthy()
    })

    it('BusinessActivityGraph uses isStale guard to prevent stale data commits', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('let isStale = false')
      expect(content).toContain('if (!isStale)')
      expect(content).toContain('return () => { isStale = true }')
    })

    it('BusinessActivityGraph only commits data when not stale', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      const dataCommitMatch = content.match(/if\s*\(\s*!isStale\s*\)\s*\{[\s\S]*?setData/)
      expect(dataCommitMatch).toBeTruthy()
    })

    it('BusinessActivityGraph only clears loading/updating when not stale', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      const finallyMatch = content.match(/finally\s*\{[\s\S]*?if\s*\(\s*!isStale\s*\)[\s\S]*?setLoading\(false\)[\s\S]*?setUpdating\(false\)/)
      expect(finallyMatch).toBeTruthy()
    })
  })

  describe('6. Shared components and preservation', () => {
    it('neither line graph uses ChartTouchWrapper; vertical scroll via CSS', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      const globals = read('src/app/globals.css')
      expect(revenue).not.toContain('ChartTouchWrapper')
      expect(activity).not.toContain('ChartTouchWrapper')
      expect(globals).toMatch(/\.recharts-surface[\s\S]*?touch-action:\s*pan-y/)
    })

    it('both graphs use the shared Filter control for range selection', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(revenue).toContain('ChartFilterButton')
      expect(activity).toContain('ChartFilterButton')
      expect(revenue).toContain('ANALYTICS_TIMEFRAME_OPTIONS')
      expect(activity).toContain('ANALYTICS_TIMEFRAME_OPTIONS')
    })

    it('both graphs use useTouchDevice for platform detection', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(revenue).toContain('useTouchDevice')
      expect(activity).toContain('useTouchDevice')
    })

    it('desktop hover tooltips preserved (constant hover trigger)', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(revenue).toMatch(/trigger\s*=\s*(['"])hover\1/)
      expect(activity).toMatch(/trigger\s*=\s*(['"])hover\1/)
    })

    it('BusinessActivityGraph legend is informational only (no interactive buttons)', () => {
      const content = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(content).toContain('aria-label="Series legend"')
      expect(content).not.toContain('onClick={() => toggleSeries(key)}')
      expect(content).not.toContain('aria-pressed={!hidden}')
    })

    it('analytics calculations unchanged (no new data sources)', () => {
      const revenue = read('src/components/analytics/RevenueGraph.tsx')
      expect(revenue).toContain("from('payment_requests')")
      expect(revenue).toContain("eq('status', 'paid')")

      const activity = read('src/components/analytics/BusinessActivityGraph.tsx')
      expect(activity).toContain("from('leads')")
      expect(activity).toContain("from('meeting_records')")
      expect(activity).toContain("from('payment_requests')")
      expect(activity).toContain("from('jobs')")
    })
  })
})
