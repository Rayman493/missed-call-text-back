/**
 * Regression tests for the appointment deletion stale-UI bug:
 * a successful delete removed the event from `events` but not from
 * `eventsCache`, so the Appointments tab union (and month navigation)
 * resurrected the deleted item; a second delete then hit Google for an
 * already-gone event and surfaced a misleading generic failure.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const routeContent = readFileSync('src/app/api/google/calendar/events/[eventId]/route.ts', 'utf8')
const confirmModalContent = readFileSync('src/components/ui/ConfirmModal.tsx', 'utf8')

// Replicates removeEventLocally: clear an id from the live list + all
// cached month buckets, then rebuild the Appointments union exactly the
// way the page does (eventsCache values ∪ events, deduped by id).
function removeEventLocally(
  events: { id: string }[],
  eventsCache: Map<string, { id: string }[]>,
  eventId: string
) {
  const nextEvents = events.filter(e => e.id !== eventId)
  const nextCache = new Map<string, { id: string }[]>()
  for (const [key, list] of eventsCache) {
    nextCache.set(key, list.filter(e => e.id !== eventId))
  }
  return { nextEvents, nextCache }
}

function allFetchedEvents(events: { id: string }[], eventsCache: Map<string, { id: string }[]>) {
  const map = new Map<string, { id: string }>()
  for (const list of eventsCache.values()) {
    for (const ev of list) map.set(ev.id, ev)
  }
  for (const ev of events) map.set(ev.id, ev)
  return [...map.values()]
}

describe('Appointment deletion — local reconciliation', () => {
  it('removeEventLocally clears the id from events AND every eventsCache bucket', () => {
    expect(pageContent).toContain('const removeEventLocally = useCallback')
    const helperBlock = pageContent.substring(
      pageContent.indexOf('const removeEventLocally'),
      pageContent.indexOf('// Card-level appointment delete')
    )
    expect(helperBlock).toContain('setEvents(')
    expect(helperBlock).toContain('setEventsCache(')
    expect(helperBlock).toContain('e.id !== eventId')
  })

  it('deleted appointment disappears from the Appointments union immediately', () => {
    const events = [{ id: 'a' }, { id: 'b' }]
    const cache = new Map([['2026-09', [{ id: 'a' }, { id: 'c' }]]])
    expect(allFetchedEvents(events, cache).map(e => e.id)).toEqual(['a', 'c', 'b'])

    const { nextEvents, nextCache } = removeEventLocally(events, cache, 'a')
    expect(allFetchedEvents(nextEvents, nextCache).map(e => e.id)).toEqual(['c', 'b'])
  })

  it('unrelated appointments in other cached months remain unchanged', () => {
    const events = [{ id: 'a' }]
    const cache = new Map([
      ['2026-09', [{ id: 'a' }, { id: 'c' }]],
      ['2026-10', [{ id: 'd' }, { id: 'a' }]],
    ])
    const { nextCache } = removeEventLocally(events, cache, 'a')
    expect(nextCache.get('2026-09')!.map(e => e.id)).toEqual(['c'])
    expect(nextCache.get('2026-10')!.map(e => e.id)).toEqual(['d'])
  })

  it('month navigation cannot resurrect the deleted event from cache', () => {
    const cache = new Map([['2026-09', [{ id: 'a' }, { id: 'c' }]]])
    const { nextCache } = removeEventLocally([], cache, 'a')
    // Simulates the page's cached-month restore: setEvents(cachedEvents)
    const restored = nextCache.get('2026-09')!
    expect(restored.map(e => e.id)).toEqual(['c'])
  })

  it('card-level delete uses removeEventLocally, not an events-only filter', () => {
    const handlerBlock = pageContent.substring(
      pageContent.indexOf('const handleConfirmDeleteAppointment'),
      pageContent.indexOf('const getJobsForDay')
    )
    expect(handlerBlock).toContain('removeEventLocally(appointmentToDelete.id)')
    expect(handlerBlock).not.toContain('setEvents(prev => prev.filter')
  })

  it('EventDetailsModal onDelete also reconciles every local copy', () => {
    const onDeleteBlock = pageContent.substring(
      pageContent.indexOf('onDelete={async'),
      pageContent.indexOf('showToast(\'Appointment removed from calendar\'')
    )
    expect(onDeleteBlock).toContain('removeEventLocally(selectedEvent.id)')
  })
})

describe('Appointment deletion — duplicate request prevention', () => {
  it('card-level handler guards against concurrent submissions', () => {
    expect(pageContent).toContain('appointmentDeleteInFlightRef')
    const handlerBlock = pageContent.substring(
      pageContent.indexOf('const handleConfirmDeleteAppointment'),
      pageContent.indexOf('const getJobsForDay')
    )
    expect(handlerBlock).toContain('appointmentDeleteInFlightRef.current = true')
    expect(handlerBlock).toContain('appointmentDeleteInFlightRef.current = false')
  })

  it('confirm dialog disables the Delete action while submitting', () => {
    expect(confirmModalContent).toContain('disabled={isLoading}')
    expect(pageContent).toContain('isLoading={isDeletingAppointment}')
  })

  it('EventDetailsModal keeps its existing in-flight guard', () => {
    const modalContent = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
    expect(modalContent).toContain('mutationInFlightRef.current = true')
  })
})

describe('Appointment deletion — failure handling', () => {
  it('a failed card-level delete retains the appointment (no local removal)', () => {
    const handlerBlock = pageContent.substring(
      pageContent.indexOf('const handleConfirmDeleteAppointment'),
      pageContent.indexOf('const getJobsForDay')
    )
    const failureIdx = handlerBlock.indexOf('if (!response.ok)')
    const removalIdx = handlerBlock.indexOf('removeEventLocally(appointmentToDelete.id)')
    // The failure branch returns before any local removal runs.
    expect(failureIdx).toBeGreaterThan(-1)
    expect(removalIdx).toBeGreaterThan(failureIdx)
    const failureBranch = handlerBlock.substring(failureIdx, removalIdx)
    expect(failureBranch).toContain('return')
    expect(failureBranch).toContain('showToast')
  })

  it('failure toast surfaces the server-provided user-safe message', () => {
    const handlerBlock = pageContent.substring(
      pageContent.indexOf('const handleConfirmDeleteAppointment'),
      pageContent.indexOf('const getJobsForDay')
    )
    expect(handlerBlock).toContain('errorData?.error')
  })
})

describe('DELETE route — already-deleted reconciliation', () => {
  it('treats Google 404/410 on the target event as success', () => {
    const deleteSection = routeContent.substring(routeContent.indexOf('export async function DELETE'))
    expect(deleteSection).toContain('deleteResponse.status === 404 || deleteResponse.status === 410')
    expect(deleteSection).toContain('alreadyDeleted: true')
  })

  it('treats an already-absent recurring master as success for scope=future', () => {
    const deleteSection = routeContent.substring(routeContent.indexOf('export async function DELETE'))
    expect(deleteSection).toContain('masterRes.status === 404 || masterRes.status === 410')
  })

  it('still returns an error for genuine Google failures', () => {
    const deleteSection = routeContent.substring(routeContent.indexOf('export async function DELETE'))
    expect(deleteSection).toContain("{ error: 'Failed to delete event from Google Calendar' }")
    expect(deleteSection).toContain('status: deleteResponse.status')
  })

  it('preserves auth, membership and integration checks before any Google call', () => {
    const deleteSection = routeContent.substring(routeContent.indexOf('export async function DELETE'))
    const authIdx = deleteSection.indexOf("return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })")
    const businessIdx = deleteSection.indexOf("return NextResponse.json({ error: 'Business not found' }, { status: 404 })")
    const integrationIdx = deleteSection.indexOf("return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 })")
    const googleCallIdx = deleteSection.indexOf('https://www.googleapis.com/calendar')
    expect(authIdx).toBeGreaterThan(-1)
    expect(businessIdx).toBeGreaterThan(authIdx)
    expect(integrationIdx).toBeGreaterThan(businessIdx)
    expect(googleCallIdx).toBeGreaterThan(integrationIdx)
  })
})
