/**
 * FINAL UI/UX BURN-DOWN — BATCH 2
 * Schedule + Calendar + Appointment Polish
 *
 * Covers the six audited issues:
 *   A. Edit Appointment dedicated-form UX parity with Edit Job / Edit Reminder
 *   B. Calendar day-details visible by default (today selected)
 *   C. "All Day Event" checkbox hit target confined to compact control
 *   D. Desktop map double-click refocus on already-selected stop
 *   E. Map day-change marker flash / reinitialization
 *   F. Recurring Jobs capability audit (audit-only — no implementation)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const eventDetailsSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')
const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')
const newAppointmentSrc = readSrc('src/components/calendar/NewAppointmentModal.tsx')
const scheduleMapSrc = readSrc('src/components/schedule/ScheduleMap.tsx')
const jobComposerSrc = readSrc('src/components/jobs/JobComposer.tsx')
const jobsApiSrc = readSrc('src/app/api/jobs/route.ts')
const jobByIdApiSrc = readSrc('src/app/api/jobs/[id]/route.ts')
const newTaskModalSrc = readSrc('src/components/schedule/NewTaskModal.tsx')

// Slice out the scrollable modal body so we can reason about the three
// mutually-exclusive render branches: edit form / add-location / view.
function getEventDetailsBody(): string {
  const start = eventDetailsSrc.indexOf('{/* Event Details */}')
  const end = eventDetailsSrc.indexOf('{/* Footer */}')
  return eventDetailsSrc.substring(start, end)
}

// ============================================================================
// A. EDIT APPOINTMENT UX PARITY
// ============================================================================
describe('A. Edit Appointment dedicated form', () => {
  const body = getEventDetailsBody()

  it('view modal remains a view-only surface', () => {
    // The details view branch must contain NO isEditing-driven input swap —
    // all editable controls live exclusively in the dedicated form branch.
    const viewBranchIdx = body.indexOf('// View-only appointment details')
    expect(viewBranchIdx).toBeGreaterThan(-1)
    const viewBlock = body.substring(viewBranchIdx)
    expect(viewBlock).not.toContain('isEditing ?')
    expect(viewBlock).not.toContain('value={editedSummary}')
    expect(viewBlock).not.toContain('value={editedLocation}')
  })

  it('Edit opens a dedicated Edit Appointment form (title + sections)', () => {
    // Dedicated header title
    expect(eventDetailsSrc).toContain('Edit Appointment')
    // Edit button still enters edit mode
    expect(eventDetailsSrc).toContain('handleEditClick')
    expect(eventDetailsSrc).toContain('setIsEditing(true)')
    // Dedicated form branch renders sectioned fields like New Appointment /
    // Edit Job: Basics / Timing / Details section headers
    expect(body).toContain('>Basics<')
    expect(body).toContain('>Timing<')
    expect(body).toContain('>Details<')
    // Title input exists (was missing entirely in the old mixed mode)
    expect(body).toContain('value={editedSummary}')
    // Customer select present in the form
    expect(body).toContain('SearchableCustomerSelect')
    // Shared picker components for date/time parity with Edit Job
    expect(eventDetailsSrc).toContain("import DatePicker from '@/components/ui/DatePicker'")
    expect(eventDetailsSrc).toContain("import TimePicker from '@/components/ui/TimePicker'")
    expect(eventDetailsSrc).toContain("import SelectPicker from '@/components/ui/SelectPicker'")
    expect(body).toContain('value={editedStartDate}')
    expect(body).toContain('value={editedStartTime}')
    expect(body).toContain('value={editedEndTime}')
  })

  it('form uses the canonical existing update path', () => {
    // Same PATCH endpoint as before — no new API surface.
    expect(eventDetailsSrc).toContain("fetch(`/api/google/calendar/events/${event.id}`")
    expect(eventDetailsSrc).toContain("method: 'PATCH'")
  })

  it('Save persists the same appointment fields (summary/desc/location/start/end/scope)', () => {
    const saveIdx = eventDetailsSrc.indexOf('const handleSaveChanges')
    const saveBlock = eventDetailsSrc.substring(saveIdx, saveIdx + 3000)
    expect(saveBlock).toContain('summary: editedSummary')
    expect(saveBlock).toContain('description: editedDescription || null')
    expect(saveBlock).toContain('location: editedLocation || null')
    expect(saveBlock).toContain('scope: isRecurringEvent ? editScope :')
  })

  it('Cancel returns cleanly to the view surface and resets draft state', () => {
    const cancelIdx = eventDetailsSrc.indexOf('const handleCancelEdit')
    const cancelBlock = eventDetailsSrc.substring(cancelIdx, cancelIdx + 1200)
    expect(cancelBlock).toContain('setIsEditing(false)')
    expect(cancelBlock).toContain('setEditedSummary(event.summary)')
    expect(cancelBlock).toContain('setEditedNotes(notes)')
  })

  it('no duplicate modal/backdrop layers — single overlay in the file', () => {
    // Exactly one fixed-position overlay and one portal render call.
    const overlays = eventDetailsSrc.match(/fixed inset-0/g) || []
    expect(overlays.length).toBe(1)
    const portalCalls = eventDetailsSrc.match(/createPortal\(/g) || []
    expect(portalCalls.length).toBe(1)
  })

  it('no automatic SMS introduced in the save path', () => {
    const saveIdx = eventDetailsSrc.indexOf('const handleSaveChanges')
    const saveEnd = eventDetailsSrc.indexOf('const handleSaveLocation')
    const saveBlock = eventDetailsSrc.substring(saveIdx, saveEnd)
    expect(saveBlock).not.toMatch(/sms|text-message|sendSms/i)
    // SMS remains an explicit user action only
    expect(eventDetailsSrc).toContain('AppointmentSmsModal')
  })

  it('recurring scope preserved — occurrence/series SelectPicker in the form', () => {
    expect(eventDetailsSrc).toContain('isRecurringEvent')
    const scopeIdx = body.indexOf('Apply changes to')
    expect(scopeIdx).toBeGreaterThan(-1)
    expect(body).toContain("{ value: 'occurrence', label: 'This occurrence only' }")
    expect(body).toContain("{ value: 'series', label: 'Entire series' }")
  })
})

// ============================================================================
// B. CALENDAR DEFAULT DAY DETAILS
// ============================================================================
describe('B. Calendar day-details default visibility', () => {
  it('current month initializes selectedDay to today', () => {
    const initIdx = calendarPageSrc.indexOf('const [selectedDay, setSelectedDay]')
    const initBlock = calendarPageSrc.substring(initIdx, initIdx + 400)
    expect(initBlock).toContain('useState<Date>')
    expect(initBlock).toContain('new Date(now.getFullYear(), now.getMonth(), now.getDate())')
    expect(initBlock).not.toContain('useState<Date | null>(null)')
  })

  it('day-details panel renders unconditionally (no selectedDay gate)', () => {
    // The old `{selectedDay && (` conditional wrapper must be gone.
    expect(calendarPageSrc).not.toMatch(/\{selectedDay && \(/)
    // Panel container still present
    expect(calendarPageSrc).toContain('Selected Day Events - always visible below calendar')
  })

  it("selected day's events/jobs/reminders are aggregated for the panel", () => {
    const panelIdx = calendarPageSrc.indexOf('always visible below calendar')
    const panelBlock = calendarPageSrc.substring(panelIdx, panelIdx + 4000)
    expect(panelBlock).toContain('getEventsForDay(selectedDay)')
    expect(panelBlock).toContain('getJobsForDay(selectedDay)')
    expect(panelBlock).toContain('getTasksForDay(selectedDay)')
  })

  it('empty-state still shown when the day has no items', () => {
    const panelIdx = calendarPageSrc.indexOf('always visible below calendar')
    const panelBlock = calendarPageSrc.substring(panelIdx, panelIdx + 4000)
    expect(panelBlock).toContain('variant="calendar"')
    expect(panelBlock).toContain('Nothing scheduled')
  })

  it('selecting another day updates the panel via handleDayClick', () => {
    const idx = calendarPageSrc.indexOf('const handleDayClick')
    const block = calendarPageSrc.substring(idx, idx + 400)
    expect(block).toContain('setSelectedDay(clickedDate)')
  })

  it('month navigation never leaves a stale prior-month day selected', () => {
    const prevIdx = calendarPageSrc.indexOf('const goToPreviousMonth')
    const prevBlock = calendarPageSrc.substring(prevIdx, prevIdx + 1200)
    expect(prevBlock).toContain('setSelectedDay(resolveDayForMonth(newMonth))')
    const nextIdx = calendarPageSrc.indexOf('const goToNextMonth')
    const nextBlock = calendarPageSrc.substring(nextIdx, nextIdx + 1200)
    expect(nextBlock).toContain('setSelectedDay(resolveDayForMonth(newMonth))')
    // resolveDayForMonth returns business-local today for the current month,
    // otherwise the 1st of the newly shown month
    const resolveIdx = calendarPageSrc.indexOf('const resolveDayForMonth')
    const resolveBlock = calendarPageSrc.substring(resolveIdx, resolveIdx + 900)
    expect(resolveBlock).toContain('businessNow.getFullYear()')
    expect(resolveBlock).toContain('new Date(businessNow.getFullYear(), businessNow.getMonth(), businessNow.getDate())')
    expect(resolveBlock).toContain('new Date(month.getFullYear(), month.getMonth(), 1)')
  })

  it('Today button selects today and updates the panel', () => {
    const idx = calendarPageSrc.indexOf('const goToToday')
    const block = calendarPageSrc.substring(idx, idx + 1200)
    expect(block).toContain('setSelectedDay(businessToday)')
  })

  it('business-load sync aligns selectedDay to business-local today', () => {
    const idx = calendarPageSrc.indexOf('Initialize calendar to business-local month')
    const block = calendarPageSrc.substring(idx, idx + 1200)
    expect(block).toContain('setSelectedDay(new Date(businessNow.getFullYear(), businessNow.getMonth(), businessNow.getDate()))')
  })
})

// ============================================================================
// C. ALL DAY EVENT CHECKBOX HIT TARGET
// ============================================================================
describe('C. All Day Event compact hit target', () => {
  it('New Appointment label is inline-flex (content-width only)', () => {
    const labelIdx = newAppointmentSrc.indexOf('All day event')
    const labelBlock = newAppointmentSrc.substring(labelIdx - 600, labelIdx)
    expect(labelBlock).toContain('inline-flex items-center gap-2 cursor-pointer')
    expect(labelBlock).not.toMatch(/className="flex items-center gap-2 cursor-pointer"/)
  })

  it('Edit Appointment form label is inline-flex (content-width only)', () => {
    const labelIdx = eventDetailsSrc.indexOf('All day event')
    const labelBlock = eventDetailsSrc.substring(labelIdx - 700, labelIdx)
    expect(labelBlock).toContain('inline-flex items-center gap-2 cursor-pointer')
  })

  it('native checkbox + wrapping label preserved (keyboard + tap intact)', () => {
    const labelIdx = newAppointmentSrc.indexOf('All day event')
    const block = newAppointmentSrc.substring(labelIdx - 700, labelIdx + 200)
    expect(block).toContain('type="checkbox"')
    // Checkbox still wrapped by its label — click on text or box toggles
    expect(block).toMatch(/<label[^>]*>\s*<input[^>]*type="checkbox"/s)
  })

  it('blank surrounding row space is outside the label', () => {
    // The label must be a child of a block div — the div spans the row but is
    // NOT the activatable element.
    const labelIdx = newAppointmentSrc.indexOf('All day event')
    const before = newAppointmentSrc.substring(labelIdx - 900, labelIdx)
    expect(before).toMatch(/<div>\s*<label className="inline-flex/)
  })
})

// ============================================================================
// D. MAP DOUBLE-CLICK REFOCUS
// ============================================================================
describe('D. Double-tap always refocuses (all detectors)', () => {
  const detectorSources = ['marker_dblclick', 'marker_click_pair', 'touch_double_tap', 'card_double_tap']

  it('every detector logs marker_focus_requested with alreadyFocused flag', () => {
    for (const source of detectorSources) {
      const pattern = new RegExp(`marker_focus_requested', \\{ source: '${source}'[^}]*alreadyFocused`)
      expect(scheduleMapSrc).toMatch(pattern)
    }
  })

  it('no detector retains the unfocus-toggle branch', () => {
    expect(scheduleMapSrc).not.toContain('marker_unfocus')
    expect(scheduleMapSrc).not.toContain('unfocusMarker()')
  })

  it('double-tap calls the camera focus action directly (focusStopOnMap)', () => {
    // focusStopOnMap is invoked inside each detector's non-business branch —
    // count its call sites across the file (detectors + card single-tap focus).
    const calls = scheduleMapSrc.match(/focusStopOnMap\(item\.id, item\.latitude, item\.longitude\)/g) || []
    expect(calls.length).toBeGreaterThanOrEqual(4)
  })

  it('single-tap selection semantics unchanged (toggleMapItemDetails still used)', () => {
    expect(scheduleMapSrc).toContain('toggleMapItemDetails')
    expect(scheduleMapSrc).toContain('singleTapTimerRef.current.set(item.id, timer)')
    // The pending-single-tap cancellation for double-tap is preserved
    expect(scheduleMapSrc).toContain('clearTimeout(pendingTimer)')
  })
})

// ============================================================================
// E. MAP DAY-CHANGE FLASH / REINITIALIZATION
// ============================================================================
describe('E. Marker lifecycle across day changes', () => {
  it('map instance persists — created once, nulled only on unmount', () => {
    expect(scheduleMapSrc).toContain('isUnmountingRef.current')
    // googleMapRef cleared only inside the unmount guard
    const clearIdx = scheduleMapSrc.indexOf('googleMapRef.current = null')
    const context = scheduleMapSrc.substring(clearIdx - 300, clearIdx)
    expect(context).toContain('isUnmountingRef.current')
  })

  it('marker-update effect does NOT clear all markers on re-run', () => {
    // The old effect returned a cleanup that wiped markersRef on every re-run.
    // Locate the marker-update effect (bounded by its dependency array) and
    // confirm no `return () =>` cleanup that mass-clears markers remains.
    const effectIdx = scheduleMapSrc.indexOf('const currentMarkerIds = new Set<string>()')
    const effectEnd = scheduleMapSrc.indexOf('}, [mapItems, groupItemsByLocation')
    const effectBlock = scheduleMapSrc.substring(effectIdx, effectEnd)
    expect(effectBlock).not.toContain('markersRef.current.clear()')
    expect(effectBlock).not.toMatch(/return \(\) => \{[\s\S]*?marker\.setMap\(null\)/)
  })

  it('unmount-only cleanup still removes all markers', () => {
    const unmountIdx = scheduleMapSrc.indexOf('ONLY on component unmount')
    expect(unmountIdx).toBeGreaterThan(-1)
    const block = scheduleMapSrc.substring(unmountIdx, unmountIdx + 900)
    expect(block).toContain('markersRef.current.clear()')
    expect(block).toContain('markerItemsRef.current.clear()')
    expect(block).toContain('markerInfosRef.current.clear()')
    expect(block).toContain('}, [])')
  })

  it('existing markers update in place (icon/zIndex/position) — business marker stays stable', () => {
    const updateIdx = scheduleMapSrc.indexOf('if (existingMarker) {')
    const updateBlock = scheduleMapSrc.substring(updateIdx, updateIdx + 700)
    expect(updateBlock).toContain('existingMarker.setIcon(')
    expect(updateBlock).toContain('existingMarker.setZIndex(')
    expect(updateBlock).toContain('existingMarker.setPosition(markerInfo.position)')
    expect(updateBlock).not.toContain('existingMarker.setMap(null)')
  })

  it('visible markers are not cleared while the next day prepares', () => {
    // mapItems only replaced when prepareMapItems returned a completed set —
    // never reset to [] on date change.
    const prepIdx = scheduleMapSrc.indexOf('const prepare = async () =>')
    const prepBlock = scheduleMapSrc.substring(prepIdx, prepIdx + 1200)
    expect(prepBlock).toContain('if (items !== null)')
    expect(prepBlock).not.toContain('setMapItems([])')
    // No setMapItems([]) anywhere in the component
    expect(scheduleMapSrc).not.toContain('setMapItems([])')
  })

  it('marker listeners resolve fresh markerInfo at event time (no stale closures)', () => {
    expect(scheduleMapSrc).toContain('markerInfosRef.current.get(markerKey) ?? markerInfo')
    // Registry refreshed for BOTH create and update paths, outside the else
    const setIdx = scheduleMapSrc.indexOf('markerInfosRef.current.set(markerKey, markerInfo)')
    const elseIdx = scheduleMapSrc.indexOf('} else {', setIdx)
    expect(setIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeLessThan(elseIdx)
  })

  it('stale async preparation results are discarded', () => {
    expect(scheduleMapSrc).toContain('preparationId !== mapPreparationIdRef.current')
    expect(scheduleMapSrc).toContain('isCancelled')
    expect(scheduleMapSrc).toContain('preparedDateKeyRef.current !== currentSelectedDateKey')
  })

  it('exactly one deliberate camera fit after the complete marker set', () => {
    // Single auto-frame site inside the marker effect guarded by shouldAutoFit
    const fits = scheduleMapSrc.match(/fitBoundsWithMaxZoom\(bounds, MULTI_MARKER_MAX_ZOOM, padding, 'auto_frame'\)/g) || []
    expect(fits.length).toBe(1)
    expect(scheduleMapSrc).toContain('const shouldAutoFit = markersRef.current.size > 0')
    expect(scheduleMapSrc).toContain('!userInteractedForContextRef.current')
    expect(scheduleMapSrc).toContain('!activeGestureRef.current')
  })

  it('rapid day switching leaves only the current date marker set', () => {
    // The preparedDateKey guard prevents rendering mapItems for a stale date.
    expect(scheduleMapSrc).toContain('preparedDateKeyRef.current = dateKey')
    expect(scheduleMapSrc).toContain('if (dateKey !== currentDateKey || isCancelled)')
  })
})

// ============================================================================
// F. RECURRING JOBS — AUDIT ONLY
// ============================================================================
describe('F. Recurring Jobs capability audit (read-only)', () => {
  it('capability matrix: UI control exists in JobComposer (gated on scheduledDate)', () => {
    expect(jobComposerSrc).toContain("import RepeatControls")
    expect(jobComposerSrc).toContain('<RepeatControls value={repeat} onChange={setRepeat} />')
    // The visibility gate QA observed: control only shows once a date is set
    expect(jobComposerSrc).toContain('{!editJob && scheduledDate && (')
  })

  it('capability matrix: create path sends recurrence payload', () => {
    expect(jobComposerSrc).toContain('recurrence: repeatPayload(repeat)')
  })

  it('capability matrix: jobs API creates series + expands virtual occurrences', () => {
    expect(jobsApiSrc).toContain('createSeries')
    expect(jobsApiSrc).toContain('recurrence && recurrence.frequency && scheduled_date')
    expect(jobsApiSrc).toContain('virtualJobs')
    expect(jobsApiSrc).toContain('recurrenceMetaForRow')
    expect(jobsApiSrc).toContain('toGoogleRRules')
  })

  it('capability matrix: PATCH handles virtual occurrence materialization + scope', () => {
    expect(jobByIdApiSrc).toContain('parseVirtualId')
    expect(jobByIdApiSrc).toContain('getSeriesById')
    expect(jobByIdApiSrc).toContain('scope')
  })

  it('capability matrix: shared recurrence engine + series migration exist', () => {
    expect(existsSync(join(repoRoot, 'src/lib/recurrence/service.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'src/lib/recurrence/rule.ts'))).toBe(true)
    expect(existsSync(join(repoRoot, 'supabase/migrations/20261001000000_recurrence_series.sql'))).toBe(true)
  })

  it('capability matrix: edit-mode scope picker already wired for recurring jobs', () => {
    expect(jobComposerSrc).toContain('isRecurring')
    expect(jobComposerSrc).toContain("{ value: 'occurrence', label: 'This occurrence only' }")
    expect(jobComposerSrc).toContain("{ value: 'series', label: 'Entire series' }")
    expect(jobComposerSrc).toContain('scope: editScope')
  })

  it('same gated-control pattern exists in New Reminder and New Appointment', () => {
    expect(newTaskModalSrc).toContain('<RepeatControls')
    expect(newAppointmentSrc).toContain('<RepeatControls')
  })
})
