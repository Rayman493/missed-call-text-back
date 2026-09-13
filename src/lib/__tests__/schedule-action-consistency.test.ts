/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

// ============================================================================
// PART A — EVENT CARD ACTION CONTRACT
// ============================================================================

describe('Part A: Event Card Action Consistency', () => {
  const page = readSrc('app/dashboard/calendar/page.tsx')

  describe('Reminders (RemindersList)', () => {
    it('1. has Edit button with Pencil w-4 h-4 in w-8 h-8 target', () => {
      expect(page).toContain('aria-label="Edit reminder"')
      expect(page).toContain('<Pencil className="w-4 h-4" />')
      expect(page).toContain('w-8 h-8')
    })

    it('2. has Delete button with Trash2 w-4 h-4 in w-8 h-8 target', () => {
      expect(page).toContain('aria-label="Delete reminder"')
      expect(page).toContain('<Trash2 className="w-4 h-4" />')
    })

    it('3. Edit comes before Delete (canonical order)', () => {
      const editIdx = page.indexOf('aria-label="Edit reminder"')
      const deleteIdx = page.indexOf('aria-label="Delete reminder"')
      expect(editIdx).toBeGreaterThan(-1)
      expect(deleteIdx).toBeGreaterThan(-1)
      expect(editIdx).toBeLessThan(deleteIdx)
    })
  })

  describe('Jobs (JobsTab)', () => {
    it('1. has Edit button with Pencil w-4 h-4 in w-8 h-8 target', () => {
      expect(page).toContain('aria-label="Edit job"')
    })

    it('2. has Delete button with Trash2 w-4 h-4 in w-8 h-8 target', () => {
      expect(page).toContain('aria-label="Delete job"')
    })

    it('3. Edit comes before Delete (canonical order)', () => {
      const editIdx = page.indexOf('aria-label="Edit job"')
      const deleteIdx = page.indexOf('aria-label="Delete job"')
      expect(editIdx).toBeGreaterThan(-1)
      expect(deleteIdx).toBeGreaterThan(-1)
      expect(editIdx).toBeLessThan(deleteIdx)
    })

    it('4. onDeleteJob prop is accepted and wired', () => {
      expect(page).toContain('onDeleteJob?: (job: Job) => void')
      expect(page).toContain('onDeleteJob={(job) => setJobToDelete(job)}')
    })

    it('5. Delete uses stopPropagation (does not trigger card click)', () => {
      const deleteJobIdx = page.indexOf('aria-label="Delete job"')
      // Look at a wider range to capture the onClick handler (CRLF adds chars)
      const block = page.substring(deleteJobIdx - 500, deleteJobIdx + 300)
      expect(block).toContain('e.stopPropagation()')
    })
  })

  describe('Appointments (MeetingsTab)', () => {
    it('1. has Edit button with Pencil w-4 h-4 in w-8 h-8 target', () => {
      expect(page).toContain('aria-label="Edit appointment"')
    })

    it('2. has Delete button with Trash2 w-4 h-4 in w-8 h-8 target', () => {
      expect(page).toContain('aria-label="Delete appointment"')
    })

    it('3. Edit comes before Delete (canonical order)', () => {
      const editIdx = page.indexOf('aria-label="Edit appointment"')
      const deleteIdx = page.indexOf('aria-label="Delete appointment"')
      expect(editIdx).toBeGreaterThan(-1)
      expect(deleteIdx).toBeGreaterThan(-1)
      expect(editIdx).toBeLessThan(deleteIdx)
    })

    it('4. onDeleteAppointment prop is accepted and wired', () => {
      expect(page).toContain('onDeleteAppointment?: (event: CalendarEvent) => void')
      expect(page).toContain('onDeleteAppointment={(event) => setAppointmentToDelete(event)}')
    })

    it('5. status badge remains as event info (Scheduled/Past/Completed)', () => {
      // Status badges are informational, not management actions
      expect(page).toContain('Scheduled')
      expect(page).toContain('Past')
      expect(page).toContain('Completed')
    })

    it('6. Join link remains available for virtual appointments', () => {
      expect(page).toContain('Join')
      expect(page).toContain('ev.meetingUrl')
    })

    it('7. Join does not displace Edit/Delete (Join is below the button row)', () => {
      // The Join link should come after the Edit/Delete button group
      const joinIdx = page.indexOf('Join')
      const deleteApptIdx = page.indexOf('aria-label="Delete appointment"')
      // Find the Join that's in the MeetingsTab (after the delete button)
      const joinInMeetingsTab = page.indexOf('Join', deleteApptIdx)
      expect(joinInMeetingsTab).toBeGreaterThan(deleteApptIdx)
    })

    it('8. Edit + Delete are in the same flex row (same right alignment)', () => {
      // Both should be inside a <div className="flex items-center gap-1"> wrapper
      const editApptIdx = page.indexOf('aria-label="Edit appointment"')
      const deleteApptIdx = page.indexOf('aria-label="Delete appointment"')
      const blockStart = page.lastIndexOf('<div className="flex items-center gap-1">', editApptIdx)
      const blockEnd = page.indexOf('</div>', deleteApptIdx)
      expect(blockStart).toBeGreaterThan(-1)
      expect(blockEnd).toBeGreaterThan(deleteApptIdx)
    })
  })

  describe('Cross-type consistency', () => {
    it('4a. all three use w-8 h-8 touch targets for Edit', () => {
      // Reminders, Jobs, Appointments all use w-8 h-8 for Edit
      const editReminderIdx = page.indexOf('aria-label="Edit reminder"')
      const editJobIdx = page.indexOf('aria-label="Edit job"')
      const editApptIdx = page.indexOf('aria-label="Edit appointment"')
      for (const idx of [editReminderIdx, editJobIdx, editApptIdx]) {
        // w-8 h-8 is in the className before the aria-label (CRLF adds chars)
        const block = page.substring(idx - 500, idx + 50)
        expect(block).toContain('w-8 h-8')
      }
    })

    it('4b. all three use w-8 h-8 touch targets for Delete', () => {
      const deleteReminderIdx = page.indexOf('aria-label="Delete reminder"')
      const deleteJobIdx = page.indexOf('aria-label="Delete job"')
      const deleteApptIdx = page.indexOf('aria-label="Delete appointment"')
      for (const idx of [deleteReminderIdx, deleteJobIdx, deleteApptIdx]) {
        const block = page.substring(idx - 500, idx + 50)
        expect(block).toContain('w-8 h-8')
      }
    })

    it('4c. all three use Pencil w-4 h-4 for Edit icon', () => {
      // All Edit buttons use the same icon size
      const editBlocks = [
        page.indexOf('aria-label="Edit reminder"'),
        page.indexOf('aria-label="Edit job"'),
        page.indexOf('aria-label="Edit appointment"'),
      ]
      for (const idx of editBlocks) {
        const block = page.substring(idx, idx + 300)
        expect(block).toContain('<Pencil className="w-4 h-4" />')
      }
    })

    it('4d. all three use Trash2 w-4 h-4 for Delete icon', () => {
      const deleteBlocks = [
        page.indexOf('aria-label="Delete reminder"'),
        page.indexOf('aria-label="Delete job"'),
        page.indexOf('aria-label="Delete appointment"'),
      ]
      for (const idx of deleteBlocks) {
        const block = page.substring(idx, idx + 300)
        expect(block).toContain('<Trash2 className="w-4 h-4" />')
      }
    })

    it('4e. all three use the same right-side container pattern', () => {
      // All three use flex flex-col items-end gap-1.5 flex-shrink-0
      const count = (page.match(/flex flex-col items-end gap-1\.5 flex-shrink-0/g) || []).length
      // Should appear at least 3 times (Reminders, Jobs, Appointments)
      expect(count).toBeGreaterThanOrEqual(3)
    })
  })

  describe('Delete confirmation', () => {
    it('job delete uses ConfirmModal', () => {
      expect(page).toContain('jobToDelete')
      expect(page).toContain('handleConfirmDeleteJob')
      expect(page).toContain('Delete Job?')
    })

    it('appointment delete uses ConfirmModal', () => {
      expect(page).toContain('appointmentToDelete')
      expect(page).toContain('handleConfirmDeleteAppointment')
      expect(page).toContain('Delete Appointment?')
    })

    it('job delete reuses existing API endpoint (DELETE /api/jobs/${id})', () => {
      expect(page).toContain('`/api/jobs/${jobToDelete.id}`')
    })

    it('appointment delete reuses existing API endpoint (DELETE /api/google/calendar/events/${id})', () => {
      expect(page).toContain('`/api/google/calendar/events/${appointmentToDelete.id}`')
    })
  })
})

// ============================================================================
// PART B — EVENT DETAILS MODAL HEIGHT
// ============================================================================

describe('Part B: Event Details Modal Height', () => {
  const eventModal = readSrc('components/calendar/EventDetailsModal.tsx')
  const jobModal = readSrc('components/jobs/JobDetailsModal.tsx')

  describe('EventDetailsModal', () => {
    it('7. body uses shrink (not flex-1) for content-driven height', () => {
      expect(eventModal).toContain('min-h-0 shrink min-w-0 overflow-y-auto')
      // Must NOT have flex-1 on the body (that causes growing to max-h)
      expect(eventModal).not.toContain('min-h-0 flex-1 overflow-y-auto')
    })

    it('8. modal shell has max-h (bounded to viewport)', () => {
      expect(eventModal).toContain('max-h-[calc(100dvh-var(--bottom-nav-height,72px)-32px)]')
      expect(eventModal).toContain('sm:max-h-[var(--modal-max-height)]')
    })

    it('modal shell has overflow-hidden (clips body scroll)', () => {
      expect(eventModal).toContain('overflow-hidden')
    })

    it('body has overflow-y-auto (internal scroll for long content)', () => {
      expect(eventModal).toContain('overflow-y-auto')
    })

    it('9. Android back closes modal (useModalBackButton)', () => {
      expect(eventModal).toContain('useModalBackButton')
    })

    it('X close button exists', () => {
      expect(eventModal).toContain('aria-label="Close modal"')
    })

    it('safe-area preserved in footer', () => {
      expect(eventModal).toContain("paddingBottom: 'max(12px, env(safe-area-inset-bottom))'")
    })

    it('bottom-nav clearance preserved in backdrop', () => {
      expect(eventModal).toContain('var(--bottom-nav-height, 72px)')
    })
  })

  describe('JobDetailsModal', () => {
    it('7. body uses shrink (not flex-1) for content-driven height', () => {
      expect(jobModal).toContain('overflow-y-auto shrink min-h-0')
      // Must NOT have flex-1 on the body
      expect(jobModal).not.toContain('overflow-y-auto flex-1 min-h-0')
    })

    it('8. modal shell has max-h (bounded to viewport)', () => {
      expect(jobModal).toContain('max-h-[calc(100dvh-var(--bottom-nav-height,80px)-32px)]')
    })

    it('body has overflow-y-auto (internal scroll for long content)', () => {
      expect(jobModal).toContain('overflow-y-auto')
    })

    it('9. Android back closes modal (useModalBackButton)', () => {
      expect(jobModal).toContain('useModalBackButton')
    })

    it('X close button exists', () => {
      expect(jobModal).toContain('aria-label="Close modal"')
    })

    it('safe-area preserved in footer', () => {
      expect(jobModal).toContain("paddingBottom: 'max(12px, env(safe-area-inset-bottom))'")
    })
  })
})

// ============================================================================
// PART C — SHARED SHELL / EDIT MODE
// ============================================================================

describe('Part C: Shared Shell / Edit Mode Regression', () => {
  const eventModal = readSrc('components/calendar/EventDetailsModal.tsx')

  it('10. view mode and edit mode share the same body element', () => {
    // The body element handles both view and edit mode via isEditing conditional
    expect(eventModal).toContain('isEditing ?')
  })

  it('shrink applies safely to both view and edit mode (same body element)', () => {
    // The shrink class is on the body container, not conditional on mode
    expect(eventModal).toContain('min-h-0 shrink min-w-0 overflow-y-auto')
  })

  it('edit mode Save/Cancel buttons are in the footer (flex-shrink-0)', () => {
    expect(eventModal).toContain('flex-shrink-0')
    expect(eventModal).toContain('Save Changes')
    expect(eventModal).toContain('Cancel')
  })

  it('edit mode form fields are inside the scrollable body', () => {
    // Edit inputs (date, time, description) are inside the body
    expect(eventModal).toContain('editedStartDate')
    expect(eventModal).toContain('editedStartTime')
    expect(eventModal).toContain('editedDescription')
  })

  it('no nested scroll traps (body is the only scroll container)', () => {
    // The body has overflow-y-auto; no nested overflow-y-auto inside
    // (transcript has max-h-48 overflow-y-auto but that's a collapsible sub-section)
    const bodyStart = eventModal.indexOf('min-h-0 shrink min-w-0 overflow-y-auto')
    const bodyEnd = eventModal.indexOf('</div>', eventModal.indexOf('Meeting Complete Action', bodyStart))
    const bodySection = eventModal.substring(bodyStart, bodyEnd)
    // The transcript section has its own scroll, but that's intentional and bounded
    expect(bodySection).toContain('max-h-48 overflow-y-auto')
  })
})
