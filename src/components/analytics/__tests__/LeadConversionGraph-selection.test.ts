import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('LeadConversionGraph selection', () => {
  const content = readFileSync('src/components/analytics/LeadConversionGraph.tsx', 'utf8')

  it('tracks a selected stage index', () => {
    expect(content).toContain('const [selectedIndex, setSelectedIndex]')
  })

  it('exposes a stage Filter dropdown beside the time-range dropdown', () => {
    expect(content).toContain('const [stageFilter, setStageFilter]')
    expect(content).toContain('STAGE_FILTER_OPTIONS')
    expect(content).toMatch(/value=\{stageFilter\}[\s\S]*?options=\{STAGE_FILTER_OPTIONS\}/)
  })

  it('makes each stage row independently selectable/tappable', () => {
    expect(content).toMatch(/displayData\.map\(\(stage, index\) => \(\s*<button/)
    expect(content).toContain('setSelectedIndex((prev) => (prev === index ? null : index))')
  })

  it('shows selected-stage context in a floating popup', () => {
    expect(content).toContain('<ChartDatumPopup')
    expect(content).toMatch(/displayData\[selectedIndex\]\.name/)
    expect(content).toMatch(/displayData\[selectedIndex\]\.count/)
    expect(content).toMatch(/displayData\[selectedIndex\]\.percentage/)
  })

  it('clears selection when filter or time range changes', () => {
    expect(content).toContain('setStageFilter(value)')
    expect(content).toContain('setTimeRange(value as AnalyticsTimeframe)')
    expect(content).toMatch(/setSelectedIndex\(null\)/)
  })
})
