import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('NewAppointmentModal Start/End labels', () => {
  const content = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')

  it('passes Start label to the start TimePicker', () => {
    expect(content).toContain('label="Start"')
  })

  it('passes End (optional) label to the end TimePicker', () => {
    expect(content).toContain('label="End (optional)"')
  })

  it('does not render old bottom Start/End annotations', () => {
    expect(content).not.toContain('text-[10px] text-muted-foreground mt-1')
  })

  it('removes the combined Time group label above the fields', () => {
    expect(content).not.toContain('>Time *<')
  })

  it('uses section gap between Start and End fields', () => {
    expect(content).toContain('gap-4')
  })
})
