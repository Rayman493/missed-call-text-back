/**
 * Batch 11 — visual consistency contract tests.
 *
 * These are structural source contracts, not pixel tests. They assert the
 * shared primitives that make the observed defects impossible:
 *  - AI status pill uses flex centering (no py+leading drift)
 *  - Donut selection is visually expressed on the slices, not just the chip
 *  - Low-value bars keep a visual minimum height (minPointSize)
 *  - Exiting banners are not pointer-active
 *  - Sheet close controls use the shared centered-icon contract
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

describe('AI intake status pill', () => {
  const src = read('src/components/AICallSummaryCard.tsx')

  it('single shared pill element renders all outcomes', () => {
    const pillMatches = src.match(/rounded-full text-xs font-medium/g) || []
    expect(pillMatches.length).toBe(1)
    expect(src).toContain('getOutcomeStatus(aiCallRecord.outcome)')
  })

  it('pill uses structural flex centering, not padding-only centering', () => {
    expect(src).toMatch(/inline-flex items-center justify-center[^\n]*rounded-full text-xs font-medium/)
    expect(src).toContain('leading-none')
    expect(src).toContain('whitespace-nowrap')
  })

  it('labels preserved', () => {
    for (const label of ['Partial Intake', 'AI Intake Complete', 'AI Failed']) {
      expect(src).toContain(`'${label}'`)
    }
  })
})

describe('New Customers bars', () => {
  const src = read('src/components/analytics/NewCustomersGraph.tsx')

  it('low-value bars get a visual minimum height without changing data', () => {
    expect(src).toContain('minPointSize={3}')
    // real value still drives tooltip/selection
    expect(src).toContain('dataKey="customers"')
  })
})

describe('Donut selected state', () => {
  for (const file of [
    'src/components/analytics/LeadsSourceGraph.tsx',
    'src/components/analytics/PaymentCollectionGraph.tsx',
  ]) {
    it(`${file} visually distinguishes the selected slice`, () => {
      const src = read(file)
      expect(src).toMatch(/fillOpacity=\{activeSlice \? \(activeSlice\.name === entry\.name \? 1 : 0\.55\) : 1\}/)
      expect(src).toContain('setActiveSlice(null)')
    })
  }
})

describe('Invisible-but-tappable controls', () => {
  it('exiting banners are pointer-events-none', () => {
    for (const file of ['src/components/InfoBanner.tsx', 'src/components/SuccessBanner.tsx']) {
      const src = read(file)
      expect(src).toMatch(/isExiting[\s\S]{0,200}opacity-0 pointer-events-none/)
    }
  })

  it('navigation logged-out placeholder contains no interactive elements', () => {
    const src = read('src/components/Navigation.tsx')
    const start = src.indexOf('if (!user)')
    const placeholder = src.slice(start, src.indexOf('return (', start) + 400)
    expect(placeholder).not.toMatch(/<(button|a|Link)\b/)
  })
})

describe('Close/X controls', () => {
  it('attachment sheet exposes a labeled close control with shared sizing', () => {
    const src = read('src/components/conversation/AttachmentActionSheet.tsx')
    expect(src).toContain('aria-label="Close attachment options"')
    expect(src).toMatch(/flex h-8 w-8[^\n]*items-center justify-center/)
  })

  it('ReplyFlow Assistant close uses shared centered-icon contract', () => {
    const src = read('src/components/ReplyFlowAssistant.tsx')
    expect(src).toMatch(/aria-label="Close ReplyFlow Assistant"[\s\S]{0,200}/)
    expect(src).toMatch(/absolute right-0 top-0 flex h-8 w-8 items-center justify-center/)
  })

  it('Manage Billing label is inside a flex-centered button', () => {
    const src = read('src/components/SettingsContent.tsx')
    expect(src).toMatch(/flex items-center gap-2 bg-slate-100[\s\S]{0,1200}Manage Billing/)
  })
})

describe('Chart header / filter contract', () => {
  it('chart header truncates title and keeps controls in a non-wrapping rail', () => {
    const src = read('src/components/analytics/ChartHeaderControls.tsx')
    expect(src).toContain('truncate')
    expect(src).toContain('flex-shrink-0')
  })
})
