import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/calendar/CalendarDayCell.tsx', 'utf8')

describe('CalendarDayCell date-number anchor consistency', () => {
  it('uses the same top-left anchor for all day numbers', () => {
    expect(content).toContain('items-start')
    expect(content).toContain('justify-start')
  })

  it('does not center the day number wrapper itself', () => {
    const wrapperStart = content.indexOf('relative z-10 flex')
    const wrapperEnd = content.indexOf('>', wrapperStart)
    const wrapper = content.slice(wrapperStart, wrapperEnd)
    expect(wrapper).not.toContain('justify-center')
    expect(wrapper).not.toContain('items-center')
  })

  it('decorates Today with a circle behind the digit (does not move the digit)', () => {
    // Circle is absolutely positioned behind the same anchored text, so the
    // number keeps the identical top-left anchor/baseline as other days.
    expect(content).toContain('aria-hidden="true"')
    expect(content).toContain('-z-10 rounded-full bg-blue-500')
    expect(content).not.toContain('inline-flex items-center justify-center w-5 h-5')
  })

  it('keeps event count summary unchanged', () => {
    expect(content).toContain('eventCountLabel')
    expect(content).toContain('flex items-center gap-1')
  })
})

describe('CalendarDayCell border contrast', () => {
  it('strengthens the light-mode day-cell border one restrained step', () => {
    expect(content).toContain('border-slate-300/50')
    expect(content).toContain('border-slate-300/60')
    expect(content).not.toContain('border-slate-200/40')
  })

  it('strengthens dark-mode day-cell borders one restrained step', () => {
    expect(content).toContain('dark:border-slate-600/35')
    expect(content).toContain('dark:border-slate-600/40')
    expect(content).toContain('dark:border-slate-700/30')
  })

  it('elevates the selected day cell above adjacent cells so its outline is fully visible', () => {
    expect(content).toContain("'relative z-10 ring-2")
  })
})
