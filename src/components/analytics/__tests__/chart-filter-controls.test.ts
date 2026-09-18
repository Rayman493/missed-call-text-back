import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8')

describe('CustomersStatusGraph filter control', () => {
  const content = read('src/components/analytics/CustomersStatusGraph.tsx')

  it('has a status filter funnel button', () => {
    expect(content).toContain('const [statusFilter, setStatusFilter]')
    expect(content).toContain('STATUS_FILTER_OPTIONS')
    expect(content).toContain('ChartFilterButton')
  })

  it('filter options include All and the canonical customer statuses', () => {
    expect(content).toContain("{ value: 'all', label: 'All' }")
    expect(content).toMatch(/const STATUS_ORDER[\s\S]*?'new'/)
    expect(content).toMatch(/const STATUS_ORDER[\s\S]*?'needs_reply'/)
    expect(content).toMatch(/const STATUS_ORDER[\s\S]*?'payment_requested'/)
    expect(content).toMatch(/const STATUS_ORDER[\s\S]*?'ignored'/)
    expect(content).toMatch(/const STATUS_ORDER[\s\S]*?'completed'/)
  })

  it('derives displayData from the filter', () => {
    expect(content).toContain('const displayData = useMemo')
    expect(content).toContain('setStatusFilter(value)')
  })

  it('renders the chart from displayData, not raw data', () => {
    expect(content).toContain('<BarChart data={displayData}')
  })
})

describe('CustomerPipelineGraph filter control', () => {
  const content = read('src/components/analytics/CustomerPipelineGraph.tsx')

  it('has a status filter funnel button', () => {
    expect(content).toContain('const [statusFilter, setStatusFilter]')
    expect(content).toContain('PIPELINE_STATUS_OPTIONS')
    expect(content).toContain('ChartFilterButton')
  })

  it('filter options include All and known workflow statuses plus Unknown', () => {
    expect(content).toContain("{ value: 'all', label: 'All' }")
    expect(content).toContain('getAllCustomerStatuses()')
    expect(content).toContain("{ value: 'unknown', label: 'Unknown' }")
  })

  it('renders the chart from displayData', () => {
    expect(content).toContain('<BarChart data={displayData}')
  })
})

describe('LeadConversionGraph filter control', () => {
  const content = read('src/components/analytics/LeadConversionGraph.tsx')

  it('has a stage filter funnel button beside the time-range dropdown', () => {
    expect(content).toContain('const [stageFilter, setStageFilter]')
    expect(content).toContain('STAGE_FILTER_OPTIONS')
    expect(content).toContain('ChartFilterButton')
  })

  it('filter options include All and every conversion stage', () => {
    expect(content).toContain("{ value: 'all', label: 'All' }")
    expect(content).toContain("{ value: 'leads', label: 'Leads' }")
    expect(content).toContain("{ value: 'engaged', label: 'Engaged' }")
    expect(content).toContain("{ value: 'jobs', label: 'Jobs' }")
    expect(content).toContain("{ value: 'paid', label: 'Paid' }")
  })

  it('renders rows from displayData', () => {
    expect(content).toContain('displayData.map((stage')
  })
})

describe('NewCustomersGraph has no status/type filter', () => {
  const content = read('src/components/analytics/NewCustomersGraph.tsx')

  it('does not add a filter dropdown because it is a single time-series', () => {
    expect(content).not.toContain('FILTER_OPTIONS')
    expect(content).not.toContain('const [statusFilter')
    expect(content).not.toContain('const [seriesFilter')
  })
})

describe('Shared filter behavior contract', () => {
  it('no graph uses tap-selected datum state any more', () => {
    const statusGraph = read('src/components/analytics/CustomersStatusGraph.tsx')
    const pipelineGraph = read('src/components/analytics/CustomerPipelineGraph.tsx')
    const leadGraph = read('src/components/analytics/LeadConversionGraph.tsx')
    const activityGraph = read('src/components/analytics/BusinessActivityGraph.tsx')

    expect(statusGraph).not.toContain('selectedIndex')
    expect(pipelineGraph).not.toContain('selectedIndex')
    expect(leadGraph).not.toContain('selectedIndex')
    expect(activityGraph).not.toContain('activeIndex')
  })
})
