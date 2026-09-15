/**
 * Schedule Interactions & Mobile Layout Polish — Regression Tests
 *
 * MAP:
 * 1. single tap does not change camera
 * 2. double tap focuses
 * 3. double tap focused marker fit-alls
 * 4. rapid A→B ends on B
 * 5. drag does not cause snap-back
 * 6. date change fit-all occurs once
 * 7. business location included in fit-all
 *
 * CARDS:
 * 8. Job card has left info / right fixed actions structure
 * 9. Appointment card has left info / right fixed actions structure
 * 10. external Google appointment remains manageable
 * 11. Edit/Delete remain visible
 *
 * CALENDAR:
 * 12. day number top-left structure/class
 * 13. event content remains below date
 *
 * NOTIFICATIONS:
 * 14. title/subtitle share common alignment container
 * 15. action alignment is consistent
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const scheduleMapSrc = readSrc('src/components/schedule/ScheduleMap.tsx')
const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')
const calendarDayCellSrc = readSrc('src/components/calendar/CalendarDayCell.tsx')
const notificationsPageSrc = readSrc('src/app/dashboard/notifications/page.tsx')

// ============================================================================
// MAP — touch-based double-tap detection
// ============================================================================
describe('MAP: touch-based double-tap detection', () => {
  it('1. single tap does not change camera (click handler delays toggle, no camera command)', () => {
    // The marker click handler's single-tap branch (else clause) must NOT
    // call any camera function — only toggleMapItemDetails.
    // Anchor on the "SINGLE TAP" comment to find the correct else branch
    // (there is a nested if/else inside the double-tap branch).
    const singleTapCommentIdx = scheduleMapSrc.indexOf('// SINGLE TAP: delay the info toggle')
    expect(singleTapCommentIdx).toBeGreaterThan(-1)
    const singleTapBranch = scheduleMapSrc.slice(singleTapCommentIdx, singleTapCommentIdx + 600)
    expect(singleTapBranch).toContain('toggleMapItemDetails')
    expect(singleTapBranch).not.toContain('focusStopOnMap')
    expect(singleTapBranch).not.toContain('unfocusMarker')
  })

  it('2. double tap focuses (touch handler calls focusStopOnMap)', () => {
    expect(scheduleMapSrc).toContain('touch_double_tap')
    expect(scheduleMapSrc).toContain('focusStopOnMap(item.id, item.latitude, item.longitude)')
  })

  it('3. double tap focused marker fit-alls (touch handler calls unfocusMarker)', () => {
    expect(scheduleMapSrc).toContain('marker_unfocus')
    expect(scheduleMapSrc).toContain('unfocusMarker()')
  })

  it('4. rapid A→B ends on B (no snap-back — camera commands use force=true)', () => {
    expect(scheduleMapSrc).toContain('force: true')
  })

  it('5. drag does not cause snap-back (activeGestureRef suppresses marker updates during drag)', () => {
    expect(scheduleMapSrc).toContain('activeGestureRef')
    expect(scheduleMapSrc).toContain('if (activeGestureRef.current)')
  })

  it('6. date change fit-all occurs once (signature-based dedup prevents jitter loop)', () => {
    expect(scheduleMapSrc).toContain('signature')
    expect(scheduleMapSrc).toContain('contextKey')
  })

  it('7. business location included in fit-all (markersRef includes business marker)', () => {
    const showAllIdx = scheduleMapSrc.indexOf('const showAllMarkers = useCallback')
    const showAllCode = scheduleMapSrc.slice(showAllIdx, showAllIdx + 800)
    expect(showAllCode).toContain('markersRef.current.forEach')
    expect(showAllCode).toContain('bounds.extend')
  })

  it('touch handler uses touchend on map container (not relying on second click)', () => {
    expect(scheduleMapSrc).toContain("addEventListener('touchend'")
  })

  it('touch handler cancels pending single-tap timer on double-tap', () => {
    expect(scheduleMapSrc).toContain('clearTimeout(pendingTimer)')
  })

  it('touch handler uses focusedMarkerIdRef to avoid stale closure', () => {
    expect(scheduleMapSrc).toContain('focusedMarkerIdRef')
    expect(scheduleMapSrc).toContain('focusedMarkerIdRef.current')
  })

  it('markerItemsRef stores primary MapItem for hit-testing', () => {
    expect(scheduleMapSrc).toContain('markerItemsRef')
    expect(scheduleMapSrc).toContain('markerItemsRef.current.set(markerKey, primaryItem)')
  })

  it('touch handler finds nearest marker by pixel distance', () => {
    expect(scheduleMapSrc).toContain('fromLatLngToContainerPixel')
    expect(scheduleMapSrc).toContain('nearestDist')
  })

  it('disableDoubleClickZoom is set (prevents native zoom on double-tap)', () => {
    expect(scheduleMapSrc).toContain('disableDoubleClickZoom: true')
  })

  it('DOUBLE_TAP_DELAY_MS is defined for gesture timing', () => {
    expect(scheduleMapSrc).toContain('DOUBLE_TAP_DELAY_MS')
  })
})

// ============================================================================
// CARDS — Job card two-zone structure
// ============================================================================
describe('CARDS: Job card two-zone structure', () => {
  // Find the JobCard component definition (not just the string "JobCard")
  const jobCardCompIdx = calendarPageSrc.indexOf('const JobCard')
  const jobCardCode = calendarPageSrc.slice(jobCardCompIdx, jobCardCompIdx + 5000)

  it('8. Job card uses items-center (not items-start) for vertically centered actions', () => {
    expect(jobCardCode).toContain('flex items-center justify-between')
  })

  it('Job card left zone uses min-w-0 flex-1', () => {
    expect(jobCardCode).toContain('min-w-0 flex-1')
  })

  it('Job card right zone uses flex-shrink-0', () => {
    expect(jobCardCode).toContain('flex-shrink-0')
  })

  it('11. Job card Edit/Delete buttons remain visible', () => {
    expect(jobCardCode).toContain('onEditJob')
    expect(jobCardCode).toContain('onDeleteJob')
    expect(jobCardCode).toContain('Pencil')
    expect(jobCardCode).toContain('Trash2')
  })
})

// ============================================================================
// CARDS — Appointment card two-zone structure
// ============================================================================
describe('CARDS: Appointment card two-zone structure', () => {
  // There are two renderGroup functions in the file. The appointment card
  // one is the second, identified by the isEditable declaration.
  const isEditableIdx = calendarPageSrc.indexOf('const isEditable = !ev.isHoliday')
  // The renderGroup for appointments starts before isEditable; find the
  // card JSX by anchoring on isEditable and slicing backward to the
  // renderGroup definition, then forward through the card JSX.
  const renderGroupStart = calendarPageSrc.lastIndexOf('renderGroup =', isEditableIdx)
  const renderGroupCode = calendarPageSrc.slice(renderGroupStart, isEditableIdx + 8000)

  it('9. Appointment card uses items-center (not items-start) for vertically centered actions', () => {
    expect(renderGroupCode).toContain('flex items-center justify-between')
  })

  it('Appointment card left zone uses min-w-0 flex-1', () => {
    expect(renderGroupCode).toContain('min-w-0 flex-1')
  })

  it('Appointment card right zone uses flex-shrink-0', () => {
    expect(renderGroupCode).toContain('flex-shrink-0')
  })

  it('10. external Google appointment remains manageable (isEditable check)', () => {
    // isEditable must NOT require isReplyFlowOwned — any non-holiday event
    // in the user's primary calendar is editable.
    expect(calendarPageSrc).toContain('isEditable')
    expect(calendarPageSrc).toMatch(/isEditable\s*=\s*!ev\.isHoliday/)
  })

  it('Appointment card Edit/Delete buttons remain visible for editable events', () => {
    expect(renderGroupCode).toContain('isEditable')
    expect(renderGroupCode).toContain('Pencil')
    expect(renderGroupCode).toContain('Trash2')
  })

  it('Appointment card Join button remains on the left zone (primary action with info)', () => {
    expect(renderGroupCode).toContain('Join')
    expect(renderGroupCode).toContain('meetingUrl')
  })
})

// ============================================================================
// CALENDAR — day number top-left positioning
// ============================================================================
describe('CALENDAR: day number top-left positioning', () => {
  // The day-number wrapper is the div with w-7 h-7 that contains the day span.
  // We check the specific day-number wrapper, not other elements that might
  // use items-center justify-center (like event chip icons).
  const dayNumWrapperIdx = calendarDayCellSrc.indexOf('w-7 h-7')
  const dayNumWrapperCode = calendarDayCellSrc.slice(dayNumWrapperIdx - 200, dayNumWrapperIdx + 300)

  it('12. day number wrapper uses items-start justify-start (not items-center justify-center)', () => {
    expect(dayNumWrapperCode).toContain('items-start justify-start')
    // The day-number wrapper itself must NOT use items-center justify-center
    const wrapperSection = dayNumWrapperCode.slice(0, 200)
    expect(wrapperSection).not.toContain('items-center justify-center')
  })

  it('13. event content renders below day number (separate flex-col container)', () => {
    expect(calendarDayCellSrc).toContain('flex flex-col')
    const dayNumIdx = calendarDayCellSrc.indexOf('w-7 h-7')
    const eventIdx = calendarDayCellSrc.indexOf('visibleEvents.map')
    expect(eventIdx).toBeGreaterThan(dayNumIdx)
  })

  it('day number span has small padding for breathing room', () => {
    expect(calendarDayCellSrc).toContain('pl-0.5')
    expect(calendarDayCellSrc).toContain('pt-0.5')
  })
})

// ============================================================================
// NOTIFICATIONS — header alignment
// ============================================================================
describe('NOTIFICATIONS: header alignment', () => {
  const headerIdx = notificationsPageSrc.indexOf('Header — two-column alignment grid')
  const headerCode = notificationsPageSrc.slice(headerIdx, headerIdx + 4000)

  it('14. title and subtitle share a common content column (flex-1 min-w-0)', () => {
    expect(headerCode).toContain('flex-shrink-0')
    expect(headerCode).toContain('flex-1 min-w-0')
  })

  it('back arrow is in its own fixed left column', () => {
    expect(headerCode).toContain('AppBackButton')
    expect(headerCode).toContain('flex-shrink-0')
  })

  it('15. desktop actions are right-aligned in the title row (justify-between)', () => {
    expect(headerCode).toContain('justify-between')
  })

  it('mobile actions share the same content column left edge', () => {
    const contentColIdx = headerCode.indexOf('flex-1 min-w-0')
    const mobileActionsIdx = headerCode.indexOf('flex sm:hidden')
    expect(mobileActionsIdx).toBeGreaterThan(contentColIdx)
  })

  it('subtitle is inside the content column (not a sibling of the back arrow)', () => {
    const contentColIdx = headerCode.indexOf('flex-1 min-w-0')
    const subtitleIdx = headerCode.indexOf('Stay updated')
    expect(subtitleIdx).toBeGreaterThan(contentColIdx)
  })
})
