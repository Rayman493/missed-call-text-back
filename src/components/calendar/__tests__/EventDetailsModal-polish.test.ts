import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('EventDetailsModal presentation polish', () => {
  const content = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')

  it('does not duplicate the event title in the body', () => {
    // The title lives in the modal header; the body should not repeat an <h3> event summary.
    expect(content).not.toMatch(/<h3[^>]*>\s*\{event\.summary\}\s*<\/h3>/)
  })

  it('uses a responsive two-column summary grid', () => {
    expect(content).toMatch(/grid-cols-1\s+md:grid-cols-2/)
    expect(content).toContain('Date & Time')
    expect(content).toContain('Duration')
    expect(content).toContain('Location')
    expect(content).toContain('Status')
  })

  it('wraps long location values safely', () => {
    expect(content).toContain('block break-words')
    expect(content).toContain('MapPin')
  })

  it('renders description with safe URL handling', () => {
    expect(content).toContain('renderDescription')
    expect(content).toContain('break-all')
    expect(content).toContain('[word-break:break-word]')
  })

  it('shows an intentional empty meeting notes state', () => {
    expect(content).toContain('No meeting notes')
  })

  it('wraps footer actions on narrow widths', () => {
    expect(content).toMatch(/flex\s+flex-wrap\s+gap-2/)
  })

  it('only renders Join when a meeting URL is present', () => {
    expect(content).toMatch(/event\.meetingUrl\s*&&/)
    expect(content).toContain('Join')
  })

  it('keeps the customer picker functional', () => {
    expect(content).toContain('SearchableCustomerSelect')
    expect(content).toContain('handleCustomerSelect')
    expect(content).toContain('No customer')
  })

  it('keeps Delete as a destructive action', () => {
    expect(content).toContain('text-red-600')
    expect(content).toContain('Trash2')
  })

  it('preserves Mark Complete behavior', () => {
    expect(content).toContain('Mark Complete')
    expect(content).toContain('markComplete')
    expect(content).toContain('CheckSquare')
  })

  it('derives ReplyFlow ownership from extendedProperties metadata', () => {
    expect(content).toContain('isReplyFlowOwned')
    expect(content).toContain('replyflow_lead_id')
  })

  it('gates Edit/Delete to ReplyFlow-owned events that are not job-linked', () => {
    expect(content).toMatch(/isReplyFlowOwned\s*&&\s*!isJobEvent/)
  })
})
