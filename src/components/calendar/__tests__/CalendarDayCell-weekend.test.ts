import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('CalendarDayCell weekend light-mode styling', () => {
  const content = readFileSync('src/components/calendar/CalendarDayCell.tsx', 'utf8')

  it('applies a darker neutral background to current-month weekend cells', () => {
    expect(content).toContain('bg-slate-100/70')
  })

  it('keeps current-month weekday background unchanged', () => {
    expect(content).toContain('bg-white dark:bg-slate-900/20')
  })

  it('keeps out-of-month cells faded', () => {
    expect(content).toContain('bg-slate-50/40')
    expect(content).toContain('opacity-50')
  })

  it('preserves selected cell styling', () => {
    expect(content).toContain('ring-2 ring-blue-500/60')
    expect(content).toContain('bg-blue-50/60')
  })

  it('preserves today indicator on the day number', () => {
    expect(content).toContain('bg-blue-500 rounded-md')
    expect(content).toContain('text-white')
  })
})
