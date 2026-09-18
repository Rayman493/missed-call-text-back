import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')

describe('Appointment detail action footer', () => {
  it('moves Mark Complete into the footer action region', () => {
    expect(content).toContain('Mark Complete')
    expect(content).toContain('Completed')
  })

  it('does not leave Mark Complete floating in the scrollable body', () => {
    const bodyIndex = content.indexOf('{/* Footer */}')
    const markCompleteIndex = content.indexOf('Mark Complete')
    const footerIndex = content.indexOf('px-5 py-3 border-t', bodyIndex)
    expect(markCompleteIndex).toBeGreaterThan(footerIndex)
  })

  it('uses a strong primary style for Mark Complete', () => {
    expect(content).toMatch(/Mark Complete[\s\S]{0,1200}bg-emerald-600/)
  })

  it('shows a completed state instead of a dead CTA for completed appointments', () => {
    expect(content).toContain('meetingStatus === \'completed\'')
    expect(content).toContain('Completed')
    expect(content).toContain('bg-emerald-500/10')
  })

  it('keeps destructive Delete visually distinct', () => {
    expect(content).toContain('text-red-600')
    expect(content).toContain('aria-label="Delete appointment"')
  })

  it('keeps Edit, Calendar, and Text Details in the footer region', () => {
    expect(content).toContain('Text Details')
    expect(content).toContain('Calendar')
    expect(content).toContain('Edit')
  })
})
