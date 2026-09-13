/**
 * Final RC UI Batch — Regression Tests
 *
 * FIX 1: Customer Details mobile-layout Add buttons must reach the true
 *        right edge. The empty w-6 spacer that reserved room for the
 *        "Show all/Show fewer" chevron must only render when the chevron
 *        actually renders (i.e., when there are >3 items).
 *
 * FIX 2: Appointments must retain Google meeting events and give manageable
 *        events Edit/Delete. Eligibility includes appointment-like events
 *        (meetingUrl, location, or ReplyFlow-owned). Manageability is
 *        determined by primary-calendar membership, not ReplyFlow ownership.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')
const ownershipSrc = readSrc('src/lib/calendar-ownership.ts')
const createEventSrc = readSrc('src/app/api/google/calendar/create-event/route.ts')
const eventRouteSrc = readSrc('src/app/api/google/calendar/events/[eventId]/route.ts')

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
// FIX 1 — Customer Details empty w-6 spacer
// ============================================================================
describe('FIX 1: Customer Details empty w-6 spacer', () => {
  // The three w-6 spacers are in the mobile layout (isMobileView block).
  // Each should be wrapped in a conditional that only renders when >3 items.

  describe('spacer is conditionally rendered (not always present)', () => {
    it('Jobs w-6 spacer is preceded by leadJobs.length > 3 conditional', () => {
      const spacerIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center')
      expect(spacerIdx).toBeGreaterThan(-1)
      const before = pageClientSrc.substring(spacerIdx - 200, spacerIdx)
      expect(before).toContain('{leadJobs.length > 3 && (')
    })

    it('Reminders w-6 spacer is preceded by leadTasks.length > 3 conditional', () => {
      const firstIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center')
      const spacerIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center', firstIdx + 1)
      expect(spacerIdx).toBeGreaterThan(-1)
      const before = pageClientSrc.substring(spacerIdx - 200, spacerIdx)
      expect(before).toContain('{leadTasks.length > 3 && (')
    })

    it('Appointments w-6 spacer is preceded by appointments.length > 3 conditional', () => {
      const firstIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center')
      const secondIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center', firstIdx + 1)
      const spacerIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center', secondIdx + 1)
      expect(spacerIdx).toBeGreaterThan(-1)
      const before = pageClientSrc.substring(spacerIdx - 200, spacerIdx)
      expect(before).toContain('{appointments.length > 3 && (')
    })
  })

  describe('conditional wraps the entire w-6 div (not just its children)', () => {
    it('Jobs: conditional starts before the w-6 div, not inside it', () => {
      const spacerIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center')
      const before = pageClientSrc.substring(spacerIdx - 200, spacerIdx)
      // The conditional should wrap the div, so the opening { should be
      // before the <div className="w-6..."
      expect(before).toContain('{leadJobs.length > 3 && (')
      expect(before).toContain('<div')
    })

    it('Reminders: conditional starts before the w-6 div, not inside it', () => {
      const firstIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center')
      const spacerIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center', firstIdx + 1)
      const before = pageClientSrc.substring(spacerIdx - 200, spacerIdx)
      expect(before).toContain('{leadTasks.length > 3 && (')
      expect(before).toContain('<div')
    })

    it('Appointments: conditional starts before the w-6 div, not inside it', () => {
      const firstIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center')
      const secondIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center', firstIdx + 1)
      const spacerIdx = pageClientSrc.indexOf('w-6 flex-shrink-0 flex items-center justify-center', secondIdx + 1)
      const before = pageClientSrc.substring(spacerIdx - 200, spacerIdx)
      expect(before).toContain('{appointments.length > 3 && (')
      expect(before).toContain('<div')
    })
  })

  describe('no always-rendered empty w-6 spacer (the old pattern is gone)', () => {
    it('does NOT contain the old pattern: <div className="w-6...">{condition && <button>', () => {
      // The old pattern was: the w-6 div always renders, and the button
      // inside it is conditional. The new pattern wraps the entire div
      // in the conditional.
      // Check that no w-6 div has a conditional button as its first child
      const pattern = /className="w-6 flex-shrink-0 flex items-center justify-center">\s*\n\s*\{/
      // The old pattern would have { after the div opening, the new pattern
      // has the { before the div opening
      const oldPattern = /className="w-6 flex-shrink-0 flex items-center justify-center">\s*\{leadJobs/
      expect(oldPattern.test(pageClientSrc)).toBe(false)
      const oldPattern2 = /className="w-6 flex-shrink-0 flex items-center justify-center">\s*\{leadTasks/
      expect(oldPattern2.test(pageClientSrc)).toBe(false)
      const oldPattern3 = /className="w-6 flex-shrink-0 flex items-center justify-center">\s*\{appointments/
      expect(oldPattern3.test(pageClientSrc)).toBe(false)
    })
  })

  describe('Payments and Internal Notes have no trailing spacer', () => {
    it('only 3 w-6 spacers exist (Jobs, Reminders, Appointments — not Payments/Notes)', () => {
      const matches = pageClientSrc.match(/w-6 flex-shrink-0 flex items-center justify-center/g)
      expect(matches?.length).toBe(3)
    })
  })
})

// ============================================================================
// FIX 2 — Appointments eligibility and manageability
// ============================================================================
describe('FIX 2: Appointments eligibility and manageability', () => {
  describe('eligibility rule includes appointment-like events', () => {
    it('isEligible includes ReplyFlow-owned events', () => {
      const idx = calendarPageSrc.indexOf('Determine eligibility')
      const block = calendarPageSrc.substring(idx, idx + 1200)
      expect(block).toContain('isReplyFlowOwnedEvent(ev as any, { linkedJob: job })')
    })

    it('isEligible includes events with meetingUrl (Google Meet / virtual)', () => {
      const idx = calendarPageSrc.indexOf('Determine eligibility')
      const block = calendarPageSrc.substring(idx, idx + 1200)
      const returnIdx = block.indexOf('return ')
      const returnLine = block.substring(returnIdx, returnIdx + 200)
      expect(returnLine).toContain('ev.meetingUrl')
    })

    it('isEligible includes events with location (in-person appointments)', () => {
      const idx = calendarPageSrc.indexOf('Determine eligibility')
      const block = calendarPageSrc.substring(idx, idx + 1200)
      const returnIdx = block.indexOf('return ')
      const returnLine = block.substring(returnIdx, returnIdx + 200)
      expect(returnLine).toContain('ev.location')
    })

    it('isEligible excludes holidays', () => {
      const idx = calendarPageSrc.indexOf('Determine eligibility')
      const block = calendarPageSrc.substring(idx, idx + 1200)
      expect(block).toContain('isHoliday')
      expect(block).toContain("source === 'holiday'")
    })

    it('isEligible does NOT require ReplyFlow ownership for visibility', () => {
      const idx = calendarPageSrc.indexOf('Determine eligibility')
      const block = calendarPageSrc.substring(idx, idx + 1200)
      const returnIdx = block.indexOf('return ')
      const returnLine = block.substring(returnIdx, returnIdx + 200)
      expect(returnLine).toContain('||')
      expect(returnLine).toContain('ev.meetingUrl')
      expect(returnLine).toContain('ev.location')
    })
  })

  describe('manageability rule (Edit/Delete)', () => {
    it('isEditable uses primary-calendar membership, not ReplyFlow ownership', () => {
      const idx = calendarPageSrc.indexOf('Manageability: any event')
      expect(idx).toBeGreaterThan(-1)
      const block = calendarPageSrc.substring(idx, idx + 600)
      expect(block).toContain('!ev.isHoliday && ev.source !== \'holiday\'')
      const editableIdx = block.indexOf('const isEditable = ')
      const editableLine = block.substring(editableIdx, editableIdx + 100)
      expect(editableLine).not.toContain('isReplyFlowOwnedEvent')
    })

    it('isEditable does NOT check isPast (past events remain editable)', () => {
      const idx = calendarPageSrc.indexOf('const isEditable = !ev.isHoliday')
      const block = calendarPageSrc.substring(idx, idx + 200)
      expect(block).not.toContain('isPast')
      expect(block).not.toContain('endRaw')
    })

    it('Edit button is gated on isEditable', () => {
      const editIdx = calendarPageSrc.indexOf('aria-label="Edit appointment"')
      expect(editIdx).toBeGreaterThan(-1)
      const beforeEdit = calendarPageSrc.substring(editIdx - 600, editIdx)
      expect(beforeEdit).toContain('isEditable')
    })

    it('Delete button is gated on isEditable', () => {
      const deleteIdx = calendarPageSrc.indexOf('aria-label="Delete appointment"')
      expect(deleteIdx).toBeGreaterThan(-1)
      const beforeDelete = calendarPageSrc.substring(deleteIdx - 600, deleteIdx)
      expect(beforeDelete).toContain('isEditable')
    })

    it('day/map view uses isEditable for Edit vs Open-in-Google conditional', () => {
      // The conditional should be {isEditable ? (<button>Edit...) : (<a>Open...)}
      const idx = calendarPageSrc.indexOf('{isEditable ? (')
      expect(idx).toBeGreaterThan(-1)
      const block = calendarPageSrc.substring(idx, idx + 2000)
      expect(block).toContain('Pencil')
      expect(block).toContain('ExternalLink')
    })
  })

  describe('Google Calendar PATCH/DELETE routes support external events', () => {
    it('PATCH route operates on calendars/primary/events/{eventId} (no ownership check)', () => {
      expect(eventRouteSrc).toContain('calendars/primary/events/')
      expect(eventRouteSrc).toContain('method: \'PATCH\'')
      expect(eventRouteSrc).not.toContain('isReplyFlowOwnedEvent')
      expect(eventRouteSrc).not.toContain('replyflow_created')
    })

    it('DELETE route operates on calendars/primary/events/{eventId} (no ownership check)', () => {
      expect(eventRouteSrc).toContain('calendars/primary/events/')
      expect(eventRouteSrc).toContain('method: \'DELETE\'')
      expect(eventRouteSrc).not.toContain('isReplyFlowOwnedEvent')
    })

    it('PATCH route requires calendar integration (connected calendar)', () => {
      expect(eventRouteSrc).toContain('Calendar not connected')
    })

    it('DELETE route requires calendar integration (connected calendar)', () => {
      expect(eventRouteSrc).toContain('Calendar not connected')
    })
  })

  describe('ReplyFlow ownership preserved for provenance', () => {
    it('isReplyFlowOwnedEvent still exists and is exported', () => {
      expect(ownershipSrc).toContain('export function isReplyFlowOwnedEvent')
    })

    it('isReplyFlowOwnedEvent checks replyflow_created flag', () => {
      expect(ownershipSrc).toContain('replyflow_created')
    })

    it('create-event route still sets replyflow_created: true', () => {
      expect(createEventSrc).toContain("replyflow_created: 'true'")
    })

    it('calendar page still imports isReplyFlowOwnedEvent', () => {
      expect(calendarPageSrc).toContain('import { isReplyFlowOwnedEvent }')
    })

    it('day/map view still uses isReplyFlow for provenance badge label', () => {
      // The badge shows "ReplyFlow" or "Google" based on isReplyFlow
      const idx = calendarPageSrc.indexOf("isReplyFlow ? 'ReplyFlow' : 'Google'")
      expect(idx).toBeGreaterThan(-1)
    })
  })

  describe('lifecycle safety preserved', () => {
    it('Edit button has stopPropagation', () => {
      const editIdx = calendarPageSrc.indexOf('aria-label="Edit appointment"')
      const block = calendarPageSrc.substring(editIdx - 300, editIdx + 100)
      expect(block).toContain('e.stopPropagation()')
    })

    it('Delete button has stopPropagation', () => {
      const deleteIdx = calendarPageSrc.indexOf('aria-label="Delete appointment"')
      const block = calendarPageSrc.substring(deleteIdx - 300, deleteIdx + 100)
      expect(block).toContain('e.stopPropagation()')
    })

    it('Join button still renders on the LEFT for events with meetingUrl', () => {
      const joinIdx = calendarPageSrc.indexOf('Join')
      const leftIdx = calendarPageSrc.indexOf('min-w-0 flex-1')
      expect(joinIdx).toBeGreaterThan(leftIdx)
    })

    it('appointment card still uses flex items-center justify-between gap-3', () => {
      expect(calendarPageSrc).toContain('flex items-center justify-between gap-3')
    })

    it('management actions container is flex items-center gap-1 flex-shrink-0', () => {
      expect(calendarPageSrc).toContain('flex items-center gap-1 flex-shrink-0')
    })
  })
})
