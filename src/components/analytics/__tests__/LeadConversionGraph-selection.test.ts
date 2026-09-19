import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('LeadConversionGraph', () => {
  const content = readFileSync('src/components/analytics/LeadConversionGraph.tsx', 'utf8')

  it('exposes a stage filter funnel button beside the time-range dropdown', () => {
    expect(content).toContain('const [stageFilter, setStageFilter]')
    expect(content).toContain('STAGE_FILTER_OPTIONS')
    expect(content).toContain('ChartFilterButton')
    expect(content).toContain('groups={[')
    expect(content).toMatch(/value: stageFilter[\s\S]*?options: STAGE_FILTER_OPTIONS/)
    expect(content).toMatch(/value: timeRange[\s\S]*?options: ANALYTICS_TIMEFRAME_OPTIONS/)
  })

  it('does not track a selected stage index', () => {
    expect(content).not.toContain('const [selectedIndex, setSelectedIndex]')
    expect(content).not.toContain('setSelectedIndex')
  })

  it('renders stage rows as display-only divs, not buttons', () => {
    expect(content).not.toMatch(/displayData\.map\(\(stage, index\) => \(\s*<button/)
    expect(content).toMatch(/displayData\.map\(\(stage\) => \(\s*<div/)
  })

  it('does not render a selected-stage popup', () => {
    expect(content).not.toContain('<ChartDatumPopup')
    expect(content).not.toContain('displayData[selectedIndex]')
  })

  it('still filters stages through the explicit filter control', () => {
    expect(content).toContain('onChange: setStageFilter')
    expect(content).toContain('if (stageFilter === \'all\') return data')
  })
})
