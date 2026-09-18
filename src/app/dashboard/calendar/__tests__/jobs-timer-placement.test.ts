import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

describe('Jobs tab — timer action placement', () => {
  it('does not render a floating top-right Start Timer toggle', () => {
    // Header row should only contain the title and the running badge.
    const headerStart = content.indexOf('Time Tracked')
    const headerEnd = content.indexOf('</div>', headerStart)
    const headerBlock = content.slice(headerStart, content.indexOf('grid grid-cols-2', headerStart))
    expect(headerBlock).not.toContain('Start Timer')
    expect(headerBlock).not.toContain('setShowTimerJobPicker(value => !value)')
  })

  it('renders Start Timer as a primary action in the bottom card region', () => {
    // The standalone Start Timer button lives inside the border-t bottom
    // region of the summary card (not the header).
    const startBlock = content.match(/mt-3 pt-3 border-t border-border\/40">\s*<button[\s\S]*?setShowTimerJobPicker\(true\)[\s\S]*?Start Timer/)?.[0] || ''
    expect(startBlock).toBeTruthy()
    expect(startBlock).toContain('bg-blue-600')
    expect(startBlock).toContain('min-h-10')
  })

  it('keeps the active timer + Stop button in the same bottom region', () => {
    expect(content).toContain('stopSummaryTimer')
    expect(content).toMatch(/activeTimerJob \? \([\s\S]*?border-t[\s\S]*?Stop/)
  })

  it('preserves the job picker flow inside the bottom region', () => {
    expect(content).toContain('SelectPicker')
    expect(content).toContain('startSummaryTimer')
    expect(content).toContain('setShowTimerJobPicker(false)')
  })
})
