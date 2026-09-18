import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const premiumSelect = readFileSync('src/components/ui/PremiumSelect.tsx', 'utf8').replace(/\r\n/g, '\n')
const chartHeader = readFileSync('src/components/analytics/ChartHeaderControls.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Chart controls compact mobile layout', () => {
  it('PremiumSelect shrinks padding and min-width on mobile while preserving desktop', () => {
    expect(premiumSelect).toContain('px-2 sm:px-3')
    expect(premiumSelect).toContain('min-w-[84px] sm:min-w-[120px]')
    expect(premiumSelect).toContain('text-[11px] sm:text-xs')
  })

  it('ChartHeaderControls uses a tighter gap on mobile', () => {
    expect(chartHeader).toContain('gap-1 sm:gap-1.5')
  })
})
