import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')

describe('Meeting Notes always editable', () => {
  it('shows an editable textarea for Meeting Notes', () => {
    expect(content).toContain('<textarea')
    expect(content).toContain('value={notes}')
    expect(content).toContain('onChange={(e) => setNotes(e.target.value)}')
  })

  it('uses the canonical placeholder text', () => {
    expect(content).toContain('placeholder="Private notes for your team. Not sent to customer."')
  })

  it('shows a Save Notes button', () => {
    expect(content).toContain('Save Notes')
    expect(content).toContain('onClick={saveNotes}')
  })

  it('does not gate Meeting Notes textarea behind isReplyFlowOwned or isExternalGoogleEvent', () => {
    // The old code had an isExternalGoogleEvent branch that rendered read-only notes.
    // That branch should be removed entirely.
    expect(content).not.toContain('isExternalGoogleEvent')
  })

  it('does not collapse Meeting Notes behind a toggle', () => {
    // The old code used isNotesOpen to toggle. The textarea should always be visible.
    expect(content).not.toContain('isNotesOpen')
  })

  it('shows Meeting Notes even for external Google events (no read-only fallback)', () => {
    // The textarea should not be conditional on isReplyFlowOwned
    // Find the Meeting Notes label (not Google Calendar Notes) and check the section after it
    const meetingNotesIdx = content.indexOf('>Meeting Notes<')
    expect(meetingNotesIdx).toBeGreaterThan(-1)
    const afterMeetingNotes = content.substring(meetingNotesIdx, meetingNotesIdx + 800)
    expect(afterMeetingNotes).not.toContain('isReplyFlowOwned')
    expect(afterMeetingNotes).toContain('<textarea')
  })

  it('shows Meeting Notes even when event is completed', () => {
    // The Meeting Notes section should not be gated on meetingStatus
    const meetingNotesIdx = content.indexOf('>Meeting Notes<')
    const notesSection = content.substring(meetingNotesIdx, meetingNotesIdx + 800)
    expect(notesSection).not.toContain("meetingStatus === 'completed'")
  })

  it('shows Meeting Notes even when there are no existing notes', () => {
    // The textarea should always render, not be conditional on notes being non-empty
    const meetingNotesIdx = content.indexOf('>Meeting Notes<')
    const notesSection = content.substring(meetingNotesIdx, meetingNotesIdx + 800)
    expect(notesSection).not.toMatch(/notes\.trim\(\)\s*\?/)
  })

  it('persists Meeting Notes only to ReplyFlow via /api/meetings/{eventId}', () => {
    expect(content).toContain("fetch(`/api/meetings/${encodeURIComponent(event.id)}`")
    expect(content).toContain('method: \'PATCH\'')
    expect(content).toContain('body: JSON.stringify({ notes')
  })

  it('Save Notes never PATCHes Google Calendar', () => {
    // The saveNotes function should only call /api/meetings, not /api/google/calendar
    const saveNotesSection = content.split('const saveNotes')[1]?.split('const markComplete')[0] || ''
    expect(saveNotesSection).not.toContain('/api/google/calendar')
    expect(saveNotesSection).not.toContain('googleapis.com')
  })

  it('does not write Meeting Notes back to Google Calendar description', () => {
    // The saveNotes function should not send notes to Google Calendar
    const saveNotesSection = content.split('const saveNotes')[1]?.split('const markComplete')[0] || ''
    expect(saveNotesSection).not.toContain('description')
  })
})

describe('Google Calendar Notes separate read-only section', () => {
  it('renders Google Calendar Notes as a separate section', () => {
    expect(content).toContain('Google Calendar Notes')
  })

  it('uses normalizeDisplayText for Google Calendar Notes', () => {
    expect(content).toContain('normalizeDisplayText(event.description)')
  })

  it('renders Google Calendar Notes through the safe renderDescription utility', () => {
    expect(content).toContain('renderDescription(normalizeDisplayText(event.description))')
  })

  it('only shows Google Calendar Notes when description has meaningful content', () => {
    expect(content).toContain('normalizeDisplayText(event.description) && (')
  })

  it('does not merge Google description into private Meeting Notes', () => {
    // The notes state should not be initialized from event.description
    const notesInit = content.match(/setNotes\([^)]+\)/g) || []
    notesInit.forEach(init => {
      expect(init).not.toContain('event.description')
    })
  })

  it('does not overwrite saved ReplyFlow notes when Google description changes', () => {
    // Notes are loaded from /api/meetings record, not from event.description
    const loadSection = content.split('const load')[1]?.split('if (!isOpen || !event?.id)')[0] || ''
    expect(content).toContain('setNotes(rec.notes || \'\')')
  })

  it('empty Google description does not remove editable Meeting Notes', () => {
    // The Meeting Notes section is gated on !event.isHoliday and !isEditing, not on description
    const meetingNotesIdx = content.indexOf('>Meeting Notes<')
    const notesSection = content.substring(meetingNotesIdx, meetingNotesIdx + 800)
    expect(notesSection).toContain('<textarea')
    expect(notesSection).not.toContain('normalizeDisplayText(event.description)')
  })

  it('Google Calendar Notes is read-only (no textarea, no Save Notes)', () => {
    const googleSection = content.split('Google Calendar Notes')[1]?.split('Meeting Notes')[0] || ''
    expect(googleSection).not.toContain('<textarea')
    expect(googleSection).not.toContain('Save Notes')
  })
})

describe('AI Summary empty-state clarity', () => {
  it('removes the old misleading "Summary will be available after the meeting." text', () => {
    expect(content).not.toContain('Summary will be available after the meeting.')
  })

  it('shows the accurate eligibility helper when no AI summary exists', () => {
    expect(content).toContain('Available when meeting transcription is enabled on a supported Google Meet account.')
  })

  it('uses muted text styling for the helper (no warning/error styling)', () => {
    // The helper should use text-muted-foreground, not text-amber, text-red, etc.
    const helperIdx = content.indexOf('Available when meeting transcription is enabled')
    expect(helperIdx).toBeGreaterThan(-1)
    const helperLine = content.substring(helperIdx - 80, helperIdx + 80)
    expect(helperLine).toContain('text-muted-foreground')
    expect(helperLine).not.toContain('text-amber')
    expect(helperLine).not.toContain('text-red')
    expect(helperLine).not.toContain('bg-amber')
    expect(helperLine).not.toContain('bg-red')
  })

  it('hides the helper when an AI summary exists (structured or plain)', () => {
    // The helper is in the else branch - it only shows when aiSummaryStructured and aiSummary are both falsy
    const summarySection = content.split('aiSummaryStructured ?')[1]?.split('Transcript')[0] || ''
    expect(summarySection).toContain('aiSummary ?')
    expect(summarySection).toContain('Available when meeting transcription is enabled')
  })

  it('does not show an upgrade CTA in the empty-state helper', () => {
    const helperIdx = content.indexOf('Available when meeting transcription is enabled')
    const helperSection = content.substring(helperIdx - 200, helperIdx + 200)
    expect(helperSection).not.toContain('Upgrade')
    expect(helperSection).not.toContain('upgrade')
    expect(helperSection).not.toContain('pricing')
    expect(helperSection).not.toContain('subscribe')
  })
})

describe('Preserved behaviors', () => {
  it('preserves Join button only for valid Meet URLs', () => {
    expect(content).toMatch(/event\.meetingUrl\s*&&/)
    expect(content).toContain('Join')
  })

  it('preserves Edit button for ReplyFlow-owned non-job events', () => {
    expect(content).toMatch(/isReplyFlowOwned\s*&&\s*!isJobEvent/)
    expect(content).toContain('handleEditClick')
    expect(content).toContain('Pencil')
  })

  it('preserves Delete button for ReplyFlow-owned non-job events', () => {
    expect(content).toContain('handleDeleteClick')
    expect(content).toContain('Trash2')
    expect(content).toContain('Delete')
  })

  it('preserves external event ownership semantics (Edit/Delete gated to ReplyFlow-owned)', () => {
    // External events should NOT show Edit/Delete
    expect(content).toContain('isReplyFlowOwned')
    expect(content).toContain('isReplyFlowOwnedEvent')
  })

  it('preserves Google Meet sublabel and Join button', () => {
    expect(content).toContain('meetingUrl')
    expect(content).toContain('openMeetingLink')
  })

  it('preserves event completion status', () => {
    expect(content).toContain('meetingStatus')
    expect(content).toContain('completed')
    expect(content).toContain('Mark Complete')
  })

  it('preserves customer selector behavior', () => {
    expect(content).toContain('SearchableCustomerSelect')
    expect(content).toContain('handleCustomerSelect')
  })

  it('preserves safe Google description rendering with no raw HTML', () => {
    expect(content).toContain('renderDescription')
    expect(content).toContain('normalizeDisplayText')
    // Should not use dangerouslySetInnerHTML
    expect(content).not.toContain('dangerouslySetInnerHTML')
  })
})
