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

  it('wraps Today with a circle on the same anchor', () => {
    expect(content).toContain('bg-blue-500 text-white rounded-full')
  })

  it('keeps event count summary unchanged', () => {
    expect(content).toContain('eventCountLabel')
    expect(content).toContain('flex items-center gap-1')
  })
})
