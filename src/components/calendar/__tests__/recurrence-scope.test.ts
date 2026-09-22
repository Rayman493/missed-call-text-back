import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const eventModalSrc = readFileSync(
  join(__dirname, '../EventDetailsModal.tsx'),
  'utf-8',
)

const eventRouteSrc = readFileSync(
  join(__dirname, '../../../app/api/google/calendar/events/[eventId]/route.ts'),
  'utf-8',
)

// Appointment recurrence scope hardening:
// - EDIT exposes only scopes the backend supports (occurrence + series).
// - DELETE exposes occurrence + future + series (all implemented server-side).
// - No UI path may predictably produce an unsupported-operation 400.

describe('Appointment recurrence edit scopes', () => {
  it('edit scope picker exists for recurring events', () => {
    expect(eventModalSrc).toContain('isRecurringEvent')
    expect(eventModalSrc).toContain('editScope')
  })

  it('edit scope offers only occurrence and series — no future option', () => {
    // The dedicated edit form renders the scope choice via SelectPicker with
    // an options array (same control used by JobComposer's scope picker).
    const pickerMatch = eventModalSrc.match(/<SelectPicker[\s\S]*?label="Apply changes to"[\s\S]*?\/>/)
    expect(pickerMatch).not.toBeNull()
    const block = pickerMatch![0]
    expect(block).toContain("value: 'occurrence'")
    expect(block).toContain("value: 'series'")
    expect(block).not.toContain("value: 'future'")
  })

  it('edit PATCH sends scope only for recurring events', () => {
    expect(eventModalSrc).toContain("scope: isRecurringEvent ? editScope : 'occurrence'")
  })

  it('backend maps scope=series to the master event id', () => {
    expect(eventRouteSrc).toContain("body.scope === 'series' ? masterEventId(rawEventId) : rawEventId")
  })

  it('backend explicitly rejects scope=future on PATCH with a clear error', () => {
    expect(eventRouteSrc).toContain("body.scope === 'future'")
    expect(eventRouteSrc).toContain('not supported for calendar appointments')
  })
})

describe('Appointment recurrence delete scopes', () => {
  it('recurring delete modal offers occurrence, future, and series', () => {
    expect(eventModalSrc).toContain("handleDeleteConfirm('occurrence')")
    expect(eventModalSrc).toContain("handleDeleteConfirm('future')")
    expect(eventModalSrc).toContain("handleDeleteConfirm('series')")
  })

  it('delete sends scope and occurrence_date params', () => {
    expect(eventModalSrc).toContain("new URLSearchParams({ scope })")
    expect(eventModalSrc).toContain("params.set('occurrence_date'")
  })

  it('backend implements future-scope delete via RRULE UNTIL truncation', () => {
    expect(eventRouteSrc).toContain("scope === 'future' && occurrenceDate")
    expect(eventRouteSrc).toContain('UNTIL=')
  })

  it('backend maps series delete to the master event', () => {
    expect(eventRouteSrc).toContain("scope === 'series' ? masterEventId(eventId) : eventId")
  })
})
