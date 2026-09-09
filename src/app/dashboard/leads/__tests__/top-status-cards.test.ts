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

  it('third card is Scheduled with purple icon', () => {
    expect(content).toContain('label="Scheduled"')
    expect(content).toContain('iconColor="purple"')
  })

  it('fourth card is Payment Requested with amber icon', () => {
    expect(content).toContain('label="Payment Requested"')
    expect(content).toContain('iconColor="amber"')
  })

  it('Completed is NOT one of the four top cards', () => {
    expect(content).not.toContain('label="Completed"')
  })

  it('Ignored is NOT one of the four top cards', () => {
    expect(content).not.toContain('label="Ignored"')
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

  it('Scheduled uses scheduled count', () => {
    expect(content).toContain('value={leadStatusCounts.scheduled}')
  })

  it('Payment Requested uses payment_requested count', () => {
    expect(content).toContain('value={leadStatusCounts.payment_requested}')
  })

  it('does not use completed count in the four cards', () => {
    expect(content).not.toContain('value={leadStatusCounts.completed}')
  })

  it('does not use ignored count in the four cards', () => {
    expect(content).not.toContain('value={leadStatusCounts.ignored}')
  })

  it('Needs Reply uses suggested description', () => {
    expect(content).toContain('description="Needs your response"')
  })

  it('Active uses suggested description', () => {
    expect(content).toContain('description="Conversations in progress"')
  })

  it('Scheduled uses suggested description', () => {
    expect(content).toContain('description="Upcoming customers"')
  })

  it('Payment Requested uses suggested description', () => {
    expect(content).toContain('description="Waiting for payment"')
  })
})
