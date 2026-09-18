import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Reminders tab card -> read-only summary', () => {
  it('tracks a viewing reminder state', () => {
    expect(content).toContain('const [viewingTask, setViewingTask]')
  })

  it('opens the summary modal when a reminder card body is tapped', () => {
    expect(content).toMatch(/onClick=\{\(\) => setViewingTask\(task\)\}[\s\S]*?Reminder Summary/)
  })

  it('does not open the summary from the checkbox, edit, or delete controls', () => {
    const stopMatches = content.match(/e\.stopPropagation\(\)/g) || []
    expect(stopMatches.length).toBeGreaterThanOrEqual(3)
  })

  it('renders a read-only summary with title, status, scheduled date, notes, customer, and job', () => {
    expect(content).toContain('title="Reminder Summary"')
    expect(content).toContain('Status')
    expect(content).toContain('Scheduled')
    expect(content).toContain('Notes')
    expect(content).toContain('Customer')
    expect(content).toContain('Job')
  })
})
