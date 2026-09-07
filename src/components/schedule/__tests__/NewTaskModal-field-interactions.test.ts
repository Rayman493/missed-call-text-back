import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('New Reminder field interaction polish', () => {
  const content = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')

  it('uses shared DatePicker and TimePicker components', () => {
    expect(content).toContain('import DatePicker')
    expect(content).toContain('import TimePicker')
    expect(content).toContain('<DatePicker')
    expect(content).toContain('<TimePicker')
  })

  it('does not use a permanently red field background for required fields', () => {
    // Reject standalone bg-red-* classes on form fields, but allow hover/error states
    expect(content).not.toMatch(/className=.*[^-:]bg-red-/)
  })

  it('keeps CTA reachable in the modal footer', () => {
    expect(content).toContain('Create Reminder')
    // Footer CTA should not be fixed/sticky over the scrollable body
    expect(content).not.toMatch(/className=.*fixed.*bottom/)
    expect(content).not.toMatch(/className=.*sticky.*bottom/)
  })

  it('preserves canonical reminder offset options', () => {
    expect(content).toContain('5 minutes before')
    expect(content).toContain('15 minutes before')
    expect(content).toContain('1 hour before')
    expect(content).toContain('1 day before')
    expect(content).toContain('1 week before')
  })
})

describe('Modal shell scroll safety', () => {
  const content = readFileSync('src/components/ui/Modal.tsx', 'utf8')

  it('does not use fixed/sticky footer that covers fields', () => {
    expect(content).not.toMatch(/className=.*fixed.*bottom/)
    expect(content).not.toMatch(/className=.*sticky.*bottom/)
  })

  it('restores body overflow when closed', () => {
    expect(content).toContain('overflow')
    expect(content).toMatch(/overflow.*auto/)
  })
})
