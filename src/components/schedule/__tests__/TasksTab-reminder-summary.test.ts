import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/schedule/TasksTab.tsx', 'utf8')

describe('TasksTab reminder summary', () => {
  it('opens a read-only Reminder Summary modal when the card body is tapped', () => {
    expect(content).toContain('const [viewingTask, setViewingTask]')
    expect(content).toContain('setViewingTask(task)')
    expect(content).toMatch(/title="Reminder Summary"/)
  })

  it('does not open the summary from the checkbox, edit, or customer link actions', () => {
    expect(content).toMatch(/onClick=\{\(e\) => \{\s*e\.stopPropagation\(\)/)
    const stopMatches = content.match(/e\.stopPropagation\(\)/g)
    expect((stopMatches || []).length).toBeGreaterThanOrEqual(3)
  })

  it('shows title, status, scheduled date/time, notes, and related customer/job', () => {
    expect(content).toContain('Title')
    expect(content).toContain('Status')
    expect(content).toContain('Scheduled')
    expect(content).toContain('Notes')
    expect(content).toContain('Customer')
    expect(content).toContain('Job')
  })
})
