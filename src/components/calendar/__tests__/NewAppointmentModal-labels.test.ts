import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('NewAppointmentModal Start/End labels', () => {
  const content = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')

  it('passes Start Time label to the start TimePicker', () => {
    expect(content).toContain('label="Start Time"')
  })

  it('passes End Time label to the end TimePicker', () => {
    expect(content).toContain('label="End Time"')
  })

  it('does not render old bottom Start/End annotations', () => {
    expect(content).not.toContain('text-[10px] text-muted-foreground mt-1')
  })

  it('removes the combined Time group label above the fields', () => {
    expect(content).not.toContain('>Time *<')
  })

  it('uses grid gap between Start and End fields', () => {
    expect(content).toContain('grid grid-cols-2 gap-3')
  })
})
