import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Customers top four status cards', () => {
  const content = readFileSync('src/app/dashboard/leads/page.tsx', 'utf8')

  it('renders exactly four StatCard components in the lifecycle grid', () => {
    const matches = content.match(/<StatCard/g)
    expect(matches).toHaveLength(4)
  })

  it('uses a 4-column grid on desktop', () => {
    expect(content).toContain('grid-cols-2 sm:grid-cols-4')
  })

  it('first card is Needs Reply with blue icon', () => {
    expect(content).toContain('label="Needs Reply"')
    expect(content).toContain('iconColor="blue"')
  })

  it('second card is Active with green icon', () => {
    expect(content).toContain('label="Active"')
    expect(content).toContain('iconColor="green"')
  })

  it('third card is Completed with slate icon', () => {
    expect(content).toContain('label="Completed"')
    expect(content).toContain('iconColor="slate"')
  })

  it('fourth card is Ignored with orange icon', () => {
    expect(content).toContain('label="Ignored"')
    expect(content).toContain('iconColor="orange"')
  })

  it('uses canonical calculateLeadStatusCounts for counts', () => {
    expect(content).toContain('calculateLeadStatusCounts(leads)')
  })

  it('Needs Reply uses new count', () => {
    expect(content).toContain('value={leadStatusCounts.new}')
  })

  it('Active uses active count', () => {
    expect(content).toContain('value={leadStatusCounts.active}')
  })

  it('Completed uses completed count', () => {
    expect(content).toContain('value={leadStatusCounts.completed}')
  })

  it('Ignored uses ignored count', () => {
    expect(content).toContain('value={leadStatusCounts.ignored}')
  })
})
