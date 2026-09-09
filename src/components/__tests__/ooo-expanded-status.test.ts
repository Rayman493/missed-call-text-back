import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Out of Office expanded status consistency', () => {
  const content = readFileSync('src/components/SettingsContent.tsx', 'utf8')

  it('expanded view uses getOutOfOfficeStatus for canonical state', () => {
    // The expanded view should call getOutOfOfficeStatus, not just check out_of_office_enabled
    expect(content).toContain('getOutOfOfficeStatus(formBusiness)')
  })

  it('expanded view shows Scheduled when status is scheduled', () => {
    expect(content).toContain("oooStatus.status === 'scheduled'")
    expect(content).toContain('Scheduled')
  })

  it('expanded view shows Active when status is active', () => {
    expect(content).toContain("oooStatus.status === 'active'")
    expect(content).toContain('Active')
  })

  it('expanded view shows Ended when status is expired', () => {
    expect(content).toContain("oooStatus.status === 'expired' ? 'Ended' : 'Inactive'")
  })

  it('expanded view shows Needs dates when enabled but dates missing', () => {
    expect(content).toContain('Needs dates')
  })

  it('expanded view shows Disabled when not enabled', () => {
    expect(content).toContain('Disabled')
  })
})
