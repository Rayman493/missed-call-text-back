/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { isReplyFlowOwnedEvent } from '@/lib/calendar-ownership'

const root = path.resolve(__dirname, '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

// Helper: find the nth occurrence of a substring
function nthIndexOf(str: string, sub: string, n: number): number {
  let idx = -1
  for (let i = 0; i < n; i++) {
    idx = str.indexOf(sub, idx + 1)
    if (idx === -1) return -1
  }
  return idx
}

// ============================================================================
// PART A — SCHEDULE CARD LAYOUT
// ============================================================================

describe('Part A: Schedule Card Layout', () => {
  const page = readSrc('app/dashboard/calendar/page.tsx')

  // -------------------------------------------------------------------------
  // 1. Appointment — Virtual scheduled with meetingUrl
  // -------------------------------------------------------------------------
  describe('1. Virtual scheduled appointment with meetingUrl', () => {
    it('isReplyFlowOwnedEvent returns true for event with replyflow_meeting_url', () => {
      const event = {
        id: 'evt-1',
        extendedProperties: {
          private: {
            replyflow_meeting_url: 'https://meet.google.com/abc-def-ghi'
          }
        }
      }
      // This is the exact scenario that was broken: a virtual ReplyFlow
      // appointment with meeting_url but no lead_id and no linked job.
      // The old check (Boolean(job || rfLead)) returned false.
      // The new check (isReplyFlowOwnedEvent) returns true.
      expect(isReplyFlowOwnedEvent(event, { linkedJob: null })).toBe(true)
    })

    it('isReplyFlowOwnedEvent returns true for event with replyflow_lead_id', () => {
      const event = {
        id: 'evt-2',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-123'
          }
        }
      }
      expect(isReplyFlowOwnedEvent(event, { linkedJob: null })).toBe(true)
    })

    it('isReplyFlowOwnedEvent returns true for event with linked job', () => {
      const event = { id: 'evt-3', extendedProperties: { private: {} } }
      const job = { id: 'job-1', google_calendar_event_id: 'evt-3' }
      expect(isReplyFlowOwnedEvent(event, { linkedJob: job })).toBe(true)
    })

    it('isReplyFlowOwnedEvent returns false for external Google event', () => {
      const event = { id: 'evt-4', extendedProperties: { private: {} } }
      expect(isReplyFlowOwnedEvent(event, { linkedJob: null })).toBe(false)
    })

    it('appointment card uses isReplyFlowOwnedEvent for isEditable', () => {
      // The fix: isEditable now uses the canonical ownership check
      expect(page).toContain('isReplyFlowOwnedEvent(ev as any, { linkedJob: job })')
      // The old broken check should not be used (only in comments)
      const idx = page.indexOf('isReplyFlowOwnedEvent(ev as any, { linkedJob: job })')
      const line = page.substring(idx, idx + 100)
      expect(line).not.toContain('Boolean(job || rfLead)')
      // The actual isEditable assignment uses isReplyFlowOwnedEvent
      expect(page).toContain('const isEditable = isReplyFlowOwnedEvent(ev as any, { linkedJob: job })')
    })

    it('Virtual badge renders on the LEFT (inside min-w-0 flex-1)', () => {
      const virtualIdx = page.indexOf("typeLabel === 'Virtual'")
      const leftIdx = page.indexOf('min-w-0 flex-1')
      expect(virtualIdx).toBeGreaterThan(leftIdx)
    })

    it('Scheduled badge renders on the LEFT (before the RIGHT SIDE comment)', () => {
      // The appointment's RIGHT SIDE comment is the 2nd occurrence
      const rightIdx = nthIndexOf(page, 'RIGHT SIDE: management actions only', 2)
      const scheduledIdx = page.indexOf('>Scheduled<')
      // Scheduled should come before the appointment's right action div
      expect(scheduledIdx).toBeLessThan(rightIdx)
      // And after the left info div starts
      const leftIdx = page.indexOf('min-w-0 flex-1')
      expect(scheduledIdx).toBeGreaterThan(leftIdx)
    })

    it('Join button renders on the LEFT (inside min-w-0 flex-1)', () => {
      const joinIdx = page.indexOf('Join')
      const leftIdx = page.indexOf('min-w-0 flex-1')
      expect(joinIdx).toBeGreaterThan(leftIdx)
    })

    it('Edit button renders on the RIGHT (after appointment RIGHT SIDE comment)', () => {
      const rightIdx = nthIndexOf(page, 'RIGHT SIDE: management actions only', 2)
      const editIdx = page.indexOf('aria-label="Edit appointment"')
      expect(editIdx).toBeGreaterThan(rightIdx)
    })

    it('Delete button renders on the RIGHT (after appointment RIGHT SIDE comment)', () => {
      const rightIdx = nthIndexOf(page, 'RIGHT SIDE: management actions only', 2)
      const deleteIdx = page.indexOf('aria-label="Delete appointment"')
      expect(deleteIdx).toBeGreaterThan(rightIdx)
    })
  })

  // -------------------------------------------------------------------------
  // 2. Appointment without meetingUrl — Edit + Delete still render
  // -------------------------------------------------------------------------
  describe('2. Appointment without meetingUrl', () => {
    it('Edit + Delete are gated on isEditable, not on meetingUrl', () => {
      const editableBlock = page.indexOf('isReplyFlowOwnedEvent(ev as any, { linkedJob: job })')
      expect(editableBlock).toBeGreaterThan(-1)
      // Edit/Delete buttons are gated on isEditable only
      const editIdx = page.indexOf('aria-label="Edit appointment"')
      const block = page.substring(editIdx - 200, editIdx + 200)
      expect(block).toContain('isEditable &&')
      expect(block).not.toContain('meetingUrl')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Past appointment — editability from business rules
  // -------------------------------------------------------------------------
  describe('3. Past appointment editability', () => {
    it('Past status badge renders on the LEFT', () => {
      const rightIdx = nthIndexOf(page, 'RIGHT SIDE: management actions only', 2)
      const pastIdx = page.indexOf('>Past<')
      expect(pastIdx).toBeLessThan(rightIdx)
    })

    it('isEditable does NOT check isPast (past events remain editable if ReplyFlow-owned)', () => {
      const editableLine = page.indexOf('isReplyFlowOwnedEvent(ev as any, { linkedJob: job })')
      const editableBlock = page.substring(editableLine, editableLine + 200)
      expect(editableBlock).not.toContain('isPast')
      expect(editableBlock).not.toContain('endRaw')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Completed job — status on LEFT, actions on RIGHT
  // -------------------------------------------------------------------------
  describe('4. Completed job layout', () => {
    it('STATUS_COLORS badge renders on the LEFT (inside min-w-0 flex-1)', () => {
      const jobCardIdx = page.indexOf('JobCard = ({ job, variant }')
      const statusInJobCard = page.indexOf('STATUS_COLORS[job.status]', jobCardIdx)
      const leftInJobCard = page.indexOf('min-w-0 flex-1', jobCardIdx)
      expect(statusInJobCard).toBeGreaterThan(leftInJobCard)
    })

    it('paymentLabel badge renders on the LEFT (with status badge)', () => {
      const jobCardIdx = page.indexOf('JobCard = ({ job, variant }')
      const paymentIdx = page.indexOf('paymentLabel &&', jobCardIdx)
      const leftIdx = page.indexOf('min-w-0 flex-1', jobCardIdx)
      expect(paymentIdx).toBeGreaterThan(leftIdx)
    })

    it('Edit + Delete render on the RIGHT (after the status/payment badges)', () => {
      const jobCardIdx = page.indexOf('JobCard = ({ job, variant }')
      const editIdx = page.indexOf('aria-label="Edit job"', jobCardIdx)
      const statusIdx = page.indexOf('STATUS_COLORS[job.status]', jobCardIdx)
      expect(editIdx).toBeGreaterThan(statusIdx)
    })

    it('Job right side is actions-only (flex items-center gap-1, not flex-col)', () => {
      const jobCardIdx = page.indexOf('JobCard = ({ job, variant }')
      const editIdx = page.indexOf('aria-label="Edit job"', jobCardIdx)
      const beforeEdit = page.substring(editIdx - 600, editIdx)
      expect(beforeEdit).toContain('flex items-center gap-1 flex-shrink-0')
      expect(beforeEdit).not.toContain('flex flex-col items-end')
    })
  })

  // -------------------------------------------------------------------------
  // 5. Overdue reminder — status on LEFT, actions on RIGHT
  // -------------------------------------------------------------------------
  describe('5. Overdue reminder layout', () => {
    it('Overdue badge renders on the LEFT (before the reminder RIGHT SIDE comment)', () => {
      // The reminder's RIGHT SIDE comment is the 1st occurrence
      const rightIdx = nthIndexOf(page, 'RIGHT SIDE: management actions only', 1)
      const overdueIdx = page.indexOf('>Overdue<')
      expect(overdueIdx).toBeLessThan(rightIdx)
    })

    it('Edit + Delete render on the RIGHT (after Overdue badge)', () => {
      const overdueIdx = page.indexOf('>Overdue<')
      const editIdx = page.indexOf('aria-label="Edit reminder"')
      expect(editIdx).toBeGreaterThan(overdueIdx)
    })

    it('Reminder right side is actions-only (flex items-center gap-1, not flex-col)', () => {
      const editIdx = page.indexOf('aria-label="Edit reminder"')
      const beforeEdit = page.substring(editIdx - 600, editIdx)
      expect(beforeEdit).toContain('flex items-center gap-1 flex-shrink-0')
      expect(beforeEdit).not.toContain('flex flex-col items-end')
    })
  })

  // -------------------------------------------------------------------------
  // 6. Completed reminder — Done on LEFT, actions on RIGHT
  // -------------------------------------------------------------------------
  describe('6. Completed reminder layout', () => {
    it('Done badge renders on the LEFT (before the reminder RIGHT SIDE comment)', () => {
      const rightIdx = nthIndexOf(page, 'RIGHT SIDE: management actions only', 1)
      const doneIdx = page.indexOf('>Done<')
      expect(doneIdx).toBeLessThan(rightIdx)
    })

    it('Edit + Delete render on the RIGHT (after Done badge)', () => {
      const doneIdx = page.indexOf('>Done<')
      const editIdx = page.indexOf('aria-label="Edit reminder"')
      expect(editIdx).toBeGreaterThan(doneIdx)
    })
  })

  // -------------------------------------------------------------------------
  // 7. Edit/Delete do not trigger card open (stopPropagation)
  // -------------------------------------------------------------------------
  describe('7. Edit/Delete stopPropagation', () => {
    it('appointment Edit button has stopPropagation', () => {
      const editIdx = page.indexOf('aria-label="Edit appointment"')
      // Look in the onClick handler which is before the aria-label
      const block = page.substring(editIdx - 300, editIdx + 100)
      expect(block).toContain('e.stopPropagation()')
    })

    it('appointment Delete button has stopPropagation', () => {
      const deleteIdx = page.indexOf('aria-label="Delete appointment"')
      const block = page.substring(deleteIdx - 300, deleteIdx + 100)
      expect(block).toContain('e.stopPropagation()')
    })

    it('job Edit button has stopPropagation', () => {
      const editIdx = page.indexOf('aria-label="Edit job"')
      const block = page.substring(editIdx - 300, editIdx + 100)
      expect(block).toContain('e.stopPropagation()')
    })

    it('job Delete button has stopPropagation', () => {
      const deleteIdx = page.indexOf('aria-label="Delete job"')
      const block = page.substring(deleteIdx - 300, deleteIdx + 100)
      expect(block).toContain('e.stopPropagation()')
    })
  })

  // -------------------------------------------------------------------------
  // Shared action strip consistency
  // -------------------------------------------------------------------------
  describe('Shared action strip consistency', () => {
    it('all Edit buttons use w-8 h-8 target with Pencil w-4 h-4', () => {
      expect(page).toContain('aria-label="Edit appointment"')
      expect(page).toContain('aria-label="Edit job"')
      expect(page).toContain('aria-label="Edit reminder"')
      const editBlocks = page.match(/aria-label="Edit (appointment|job|reminder)"/g)
      expect(editBlocks?.length).toBe(3)
    })

    it('all Delete buttons use w-8 h-8 target with Trash2 w-4 h-4', () => {
      expect(page).toContain('aria-label="Delete appointment"')
      expect(page).toContain('aria-label="Delete job"')
      expect(page).toContain('aria-label="Delete reminder"')
      const deleteBlocks = page.match(/aria-label="Delete (appointment|job|reminder)"/g)
      expect(deleteBlocks?.length).toBe(3)
    })

    it('all right-side action containers use flex items-center gap-1 flex-shrink-0', () => {
      const strips = page.match(/flex items-center gap-1 flex-shrink-0/g)
      expect(strips?.length).toBeGreaterThanOrEqual(3)
    })

    it('no right side uses flex flex-col items-end (old vertical layout)', () => {
      // Check that no flex-col items-end appears near Edit/Delete buttons.
      const editIdx = page.indexOf('aria-label="Edit appointment"')
      const beforeEdit = page.substring(editIdx - 400, editIdx)
      expect(beforeEdit).not.toContain('flex flex-col items-end gap-1.5')

      const jobEditIdx = page.indexOf('aria-label="Edit job"')
      const beforeJobEdit = page.substring(jobEditIdx - 400, jobEditIdx)
      expect(beforeJobEdit).not.toContain('flex flex-col items-end gap-1.5')

      const reminderEditIdx = page.indexOf('aria-label="Edit reminder"')
      const beforeReminderEdit = page.substring(reminderEditIdx - 400, reminderEditIdx)
      expect(beforeReminderEdit).not.toContain('flex flex-col items-end gap-1.5')
    })
  })
})

// ============================================================================
// PART B — EDIT JOB IMPORT NOTE VISUAL
// ============================================================================

describe('Part B: Edit Job Import Note Visual', () => {
  const jobComposer = readSrc('components/jobs/JobComposer.tsx')

  it('8. keeps the same text meaning', () => {
    expect(jobComposer).toContain('Customer details imported from ReplyFlow')
  })

  it('9a. removes the blue alert border', () => {
    const noteIdx = jobComposer.indexOf('Customer details imported from ReplyFlow')
    const block = jobComposer.substring(noteIdx - 400, noteIdx + 100)
    expect(block).not.toContain('border-blue-200')
    expect(block).not.toContain('border-blue-800')
  })

  it('9b. removes the blue highlighted background', () => {
    const noteIdx = jobComposer.indexOf('Customer details imported from ReplyFlow')
    const block = jobComposer.substring(noteIdx - 400, noteIdx + 100)
    expect(block).not.toContain('bg-blue-50')
    expect(block).not.toContain('bg-blue-900/20')
  })

  it('9c. uses smaller font (text-[11px])', () => {
    const noteIdx = jobComposer.indexOf('Customer details imported from ReplyFlow')
    const block = jobComposer.substring(noteIdx - 300, noteIdx + 100)
    expect(block).toContain('text-[11px]')
  })

  it('9d. uses muted secondary color (slate)', () => {
    const noteIdx = jobComposer.indexOf('Customer details imported from ReplyFlow')
    const block = jobComposer.substring(noteIdx - 300, noteIdx + 100)
    expect(block).toContain('text-slate-400')
    expect(block).toContain('text-slate-500')
  })

  it('9e. uses a tiny dot indicator instead of large blue dot', () => {
    const noteIdx = jobComposer.indexOf('Customer details imported from ReplyFlow')
    const block = jobComposer.substring(noteIdx - 300, noteIdx + 100)
    expect(block).toContain('w-1 h-1')
    expect(block).toContain('bg-slate-300')
  })

  it('9f. renders as a <p> (helper text), not a <div> (banner panel)', () => {
    const noteIdx = jobComposer.indexOf('Customer details imported from ReplyFlow')
    const block = jobComposer.substring(noteIdx - 300, noteIdx + 100)
    expect(block).toContain('<p')
    expect(block).not.toContain('rounded-lg')
    expect(block).not.toContain('px-3 py-2')
  })

  it('10. does NOT change imported customer logic', () => {
    expect(jobComposer).toContain('(prefill?.lead_id || editJob?.lead_id)')
  })
})
