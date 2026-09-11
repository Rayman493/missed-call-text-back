/**
 * Batch E — Schedule Map Tap/Double-Tap + Overview Card Alignment + Today Row Rhythm
 *
 * Static source-level tests proving:
 *
 * Map Single-Tap (1-6):
 * 1. First single tap selects details
 * 2. First single tap does NOT focus camera
 * 3. Second single tap same marker clears details
 * 4. Second single tap does NOT change camera
 * 5. Single tap different marker switches details
 * 6. Single tap while camera-focused only toggles details
 *
 * Map Double-Tap (7-14):
 * 7. Double tap unfocused marker focuses it
 * 8. Double tap moves camera exactly once
 * 9. Double tap focused marker clears focus
 * 10. Clearing focus restores fit-all
 * 11. Fit-all includes business + visible markers
 * 12. Double tap different marker switches focus
 * 13. Double tap does not execute two conflicting single taps
 * 14. Pending single action is cancelled correctly
 *
 * Map State Cleanup (15-20):
 * 15. Selected marker disappearing clears details
 * 16. Focused marker disappearing clears focus
 * 17. Date change clears stale marker state
 * 18. Deletion does not leave stale quick card
 * 19. Empty-day map remains valid
 * 20. Single-marker day remains valid
 *
 * Overview Cards (21-30):
 * 21. Reminder uses canonical right column
 * 22. Job uses canonical right column
 * 23. Appointment uses canonical right column
 * 24. All status badges terminate at same right inset
 * 25. All action rows align consistently
 * 26. Reminder checkbox stays left
 * 27. Job Edit remains functional
 * 28. Appointment Join remains functional
 * 29. Appointment Edit eligibility unchanged
 * 30. Long titles do not collide with right controls
 *
 * Today Rhythm (31-38):
 * 31. All Today items use canonical outer row spacing
 * 32. Title-only row has correct vertical rhythm
 * 33. Title + time row has correct secondary gap
 * 34. Status row does not introduce extra margin
 * 35. Adjacent rows use consistent separation
 * 36. Wrapped title preserves padding
 * 37. Icons align consistently
 * 38. Card total layout remains compact
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const mapSrc = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8').replace(/\r\n/g, '\n')
const todaySrc = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8').replace(/\r\n/g, '\n')
const calendarSrc = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8').replace(/\r\n/g, '\n')

// ============================================================
// Part 1: Map Single-Tap Contract
// ============================================================

describe('Batch E — Map Single-Tap', () => {
  it('1. first single tap selects details (toggleMapItemDetails sets selectedMapItemId)', () => {
    expect(mapSrc).toContain('const toggleMapItemDetails = useCallback((itemId: string) => {')
    expect(mapSrc).toContain('setSelectedMapItemId(prev => prev === itemId ? null : itemId)')
  })

  it('2. first single tap does NOT focus camera (no focusStopOnMap in single-tap path)', () => {
    // The single-tap handler uses toggleMapItemDetails, not focusStopOnMap
    const detailsToggleIdx = mapSrc.indexOf('marker_details_toggled')
    expect(detailsToggleIdx).toBeGreaterThan(0)
    // Find the single-tap timer block
    const timerBlock = mapSrc.substring(detailsToggleIdx - 200, detailsToggleIdx + 200)
    expect(timerBlock).toContain('toggleMapItemDetails')
    expect(timerBlock).not.toContain('focusStopOnMap')
    expect(timerBlock).not.toContain('setFocusedMarkerId')
  })

  it('3. second single tap same marker clears details (toggleMapItemDetails toggles to null)', () => {
    // toggleMapItemDetails uses prev === itemId ? null : itemId, so tapping the same marker clears
    expect(mapSrc).toContain('setSelectedMapItemId(prev => prev === itemId ? null : itemId)')
  })

  it('4. second single tap does NOT change camera (no camera calls in single-tap path)', () => {
    // Verify the single-tap timer callback does not call panToMarker or focusStopOnMap
    const nativeSingleTapIdx = mapSrc.indexOf("source: 'marker_tap'")
    const nativeBlock = mapSrc.substring(nativeSingleTapIdx - 100, nativeSingleTapIdx + 300)
    expect(nativeBlock).toContain('toggleMapItemDetails')
    expect(nativeBlock).not.toContain('focusStopOnMap')
    expect(nativeBlock).not.toContain('panToMarker')
  })

  it('5. single tap different marker switches details (toggle sets new itemId)', () => {
    // toggleMapItemDetails sets selectedMapItemId to the new itemId when different
    expect(mapSrc).toContain('setSelectedMapItemId(prev => prev === itemId ? null : itemId)')
  })

  it('6. single tap while camera-focused only toggles details (no focusStopOnMap call)', () => {
    // The single-tap handler does not check focusedMarkerId and does not call focusStopOnMap
    const nativeSingleTapIdx = mapSrc.indexOf("source: 'marker_tap'")
    const nativeBlock = mapSrc.substring(nativeSingleTapIdx - 100, nativeSingleTapIdx + 300)
    expect(nativeBlock).not.toContain('focusStopOnMap')
    expect(nativeBlock).not.toContain('setFocusedMarkerId')
  })
})

// ============================================================
// Part 2: Map Double-Tap Contract
// ============================================================

describe('Batch E — Map Double-Tap', () => {
  it('7. double tap unfocused marker focuses it (focusStopOnMap + setFocusedMarkerId)', () => {
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    expect(doubleTapIdx).toBeGreaterThan(0)
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 100, doubleTapIdx + 500)
    expect(doubleTapBlock).toContain('focusStopOnMap')
    expect(doubleTapBlock).toContain('setFocusedMarkerId')
  })

  it('8. double tap moves camera exactly once (single focusStopOnMap call)', () => {
    // The double-tap handler calls focusStopOnMap once, not multiple times
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 100, doubleTapIdx + 500)
    const focusCalls = doubleTapBlock.split('focusStopOnMap').length - 1
    expect(focusCalls).toBe(1)
  })

  it('9. double tap focused marker clears focus (unfocusMarker, NOT showAllMarkers)', () => {
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 200, doubleTapIdx + 500)
    expect(doubleTapBlock).toContain('focusedMarkerId === item.id')
    expect(doubleTapBlock).toContain('unfocusMarker')
    // CRITICAL: double-tap unfocus must NOT call showAllMarkers (which clears details)
    expect(doubleTapBlock).not.toContain('showAllMarkers')
  })

  it('10. clearing focus restores fit-all (unfocusMarker fits all markers)', () => {
    // unfocusMarker calls fitBoundsWithMaxZoom with all markers
    const unfocusIdx = mapSrc.indexOf('const unfocusMarker = useCallback(() => {')
    const unfocusBlock = mapSrc.substring(unfocusIdx, unfocusIdx + 500)
    expect(unfocusBlock).toContain('fitBoundsWithMaxZoom')
    expect(unfocusBlock).toContain('markersRef.current.forEach')
    expect(unfocusBlock).toContain('bounds.extend')
  })

  it('11. fit-all includes business + visible markers (all markers in markersRef)', () => {
    // unfocusMarker iterates all markers in markersRef, which includes business + stops
    const unfocusIdx = mapSrc.indexOf('const unfocusMarker = useCallback(() => {')
    const unfocusBlock = mapSrc.substring(unfocusIdx, unfocusIdx + 500)
    expect(unfocusBlock).toContain('markersRef.current.forEach(marker =>')
    expect(unfocusBlock).toContain('bounds.extend(marker.getPosition()')
  })

  it('12. double tap different marker switches focus (else branch focuses new marker)', () => {
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 200, doubleTapIdx + 500)
    expect(doubleTapBlock).toContain('else {')
    expect(doubleTapBlock).toContain('focusStopOnMap(item.id')
    expect(doubleTapBlock).toContain('setFocusedMarkerId(item.id)')
  })

  it('13. double tap does not execute two conflicting single taps (timer cancelled)', () => {
    // The double-tap handler cancels the pending single-tap timer
    // The timer cancellation code is BEFORE the source: 'marker_double_tap' log line
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 500, doubleTapIdx + 200)
    expect(doubleTapBlock).toContain('singleTapTimerRef.current.get(item.id)')
    expect(doubleTapBlock).toContain('clearTimeout(pendingTimer)')
    expect(doubleTapBlock).toContain('singleTapTimerRef.current.delete(item.id)')
  })

  it('14. pending single action is cancelled correctly (clearTimeout + delete)', () => {
    // Both native and desktop double-tap handlers cancel the pending single-tap
    const nativeDoubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const nativeBlock = mapSrc.substring(nativeDoubleTapIdx - 500, nativeDoubleTapIdx + 200)
    expect(nativeBlock).toContain('clearTimeout(pendingTimer)')
    expect(nativeBlock).toContain('singleTapTimerRef.current.delete(item.id)')

    const desktopDoubleTapIdx = mapSrc.indexOf("source: 'marker_dblclick'")
    const desktopBlock = mapSrc.substring(desktopDoubleTapIdx - 500, desktopDoubleTapIdx + 200)
    expect(desktopBlock).toContain('clearTimeout(pendingTimer)')
    expect(desktopBlock).toContain('singleTapTimerRef.current.delete(item.id)')
  })
})

// ============================================================
// Part 2b: Details/Camera Independence Contract (Batch E Final Correction)
// ============================================================

describe('Batch E — Details/Camera Independence', () => {
  it('1b. single tap marker → details open, no camera focus (toggleMapItemDetails only)', () => {
    // Single tap uses toggleMapItemDetails, which only sets selectedMapItemId
    // It does NOT call focusStopOnMap, panToMarker, or setFocusedMarkerId
    const nativeSingleTapIdx = mapSrc.indexOf("source: 'marker_tap'")
    const nativeBlock = mapSrc.substring(nativeSingleTapIdx - 100, nativeSingleTapIdx + 300)
    expect(nativeBlock).toContain('toggleMapItemDetails')
    expect(nativeBlock).not.toContain('focusStopOnMap')
    expect(nativeBlock).not.toContain('setFocusedMarkerId')
  })

  it('2b. double tap same selected marker → camera focuses, details remain open', () => {
    // Double-tap on a marker that is already selected (details open) focuses the camera.
    // The double-tap handler does NOT clear selectedMapItemId — it only sets focusedMarkerId.
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 200, doubleTapIdx + 500)
    // Focus branch (else) sets focusedMarkerId but does NOT clear selectedMapItemId
    expect(doubleTapBlock).toContain('focusStopOnMap')
    expect(doubleTapBlock).toContain('setFocusedMarkerId')
    // No setSelectedMapItemId(null) in the double-tap handler
    expect(doubleTapBlock).not.toContain('setSelectedMapItemId(null)')
    expect(doubleTapBlock).not.toContain('clearSelectedStop')
  })

  it('3b. double tap focused marker again → camera unfocuses + fit-all, details remain open', () => {
    // Double-tap on the currently focused marker calls unfocusMarker(), NOT showAllMarkers().
    // unfocusMarker() clears focusedMarkerId + restores fit-all but PRESERVES selectedMapItemId.
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 200, doubleTapIdx + 500)
    expect(doubleTapBlock).toContain('unfocusMarker')
    // CRITICAL: must NOT call showAllMarkers (which clears selectedMapItemId)
    expect(doubleTapBlock).not.toContain('showAllMarkers')
  })

  it('4b. double tap a different marker → focus changes, selected details remain unchanged', () => {
    // Double-tap on a different marker focuses it but does NOT clear selectedMapItemId.
    // The double-tap handler only sets focusedMarkerId via focusStopOnMap.
    const doubleTapIdx = mapSrc.indexOf("source: 'marker_double_tap'")
    const doubleTapBlock = mapSrc.substring(doubleTapIdx - 200, doubleTapIdx + 500)
    // The else branch (different marker) focuses the new marker
    expect(doubleTapBlock).toContain('focusStopOnMap(item.id')
    expect(doubleTapBlock).toContain('setFocusedMarkerId(item.id)')
    // No setSelectedMapItemId(null) in the double-tap handler
    expect(doubleTapBlock).not.toContain('setSelectedMapItemId(null)')
  })

  it('5b. explicit details toggle still only changes selectedMapItemId', () => {
    // toggleMapItemDetails only sets selectedMapItemId, no camera calls
    const toggleIdx = mapSrc.indexOf('const toggleMapItemDetails = useCallback')
    const toggleBlock = mapSrc.substring(toggleIdx, toggleIdx + 200)
    expect(toggleBlock).toContain('setSelectedMapItemId(prev => prev === itemId ? null : itemId)')
    expect(toggleBlock).not.toContain('focusStopOnMap')
    expect(toggleBlock).not.toContain('panToMarker')
    expect(toggleBlock).not.toContain('setFocusedMarkerId')
  })

  it('6b. unfocusMarker preserves selectedMapItemId (does NOT clear details)', () => {
    // unfocusMarker clears focusedMarkerId + restores fit-all but does NOT clear selectedMapItemId
    const unfocusIdx = mapSrc.indexOf('const unfocusMarker = useCallback(() => {')
    const unfocusBlock = mapSrc.substring(unfocusIdx, unfocusIdx + 500)
    expect(unfocusBlock).toContain('setFocusedMarkerId(null)')
    expect(unfocusBlock).toContain('fitBoundsWithMaxZoom')
    // CRITICAL: unfocusMarker must NOT clear selectedMapItemId
    expect(unfocusBlock).not.toContain('setSelectedMapItemId(null)')
    expect(unfocusBlock).not.toContain('setSelectedMarker(null)')
  })

  it('7b. showAllMarkers clears both (explicit show-all/reset action)', () => {
    // showAllMarkers is the explicit show-all/reset action — it clears BOTH
    // selectedMapItemId AND focusedMarkerId. This is the intended behavior
    // for the explicit "All" filter click.
    const showAllIdx = mapSrc.indexOf('const showAllMarkers = useCallback(() => {')
    const showAllBlock = mapSrc.substring(showAllIdx, showAllIdx + 500)
    expect(showAllBlock).toContain('setSelectedMapItemId(null)')
    expect(showAllBlock).toContain('setFocusedMarkerId(null)')
    expect(showAllBlock).toContain('fitBoundsWithMaxZoom')
  })

  it('8b. showAllMarkers only called by explicit All filter click (not double-tap)', () => {
    // showAllMarkers should only be called by handleAllFilterClick, not by
    // any double-tap unfocus path. The double-tap paths use unfocusMarker.
    // Verify all showAllMarkers() call sites
    const allCallSites: number[] = []
    let idx = 0
    while (true) {
      idx = mapSrc.indexOf('showAllMarkers()', idx)
      if (idx === -1) break
      allCallSites.push(idx)
      idx++
    }
    // Should be exactly 1 call site: handleAllFilterClick
    expect(allCallSites.length).toBe(1)
    // Verify it's in handleAllFilterClick
    const callSiteBlock = mapSrc.substring(allCallSites[0] - 200, allCallSites[0] + 50)
    expect(callSiteBlock).toContain('handleAllFilterClick')
  })

  it('9b. same selected+focused marker disappearing clears both (disappearance exception)', () => {
    // The cleanup effect independently checks selectedMapItemId and focusedMarkerId.
    // If the same marker was both selected and focused and disappears, both branches
    // run, clearing both. This is different from merely unfocusing an existing marker.
    const cleanupIdx = mapSrc.indexOf('Clear stale selection when date changes')
    const cleanupBlock = mapSrc.substring(cleanupIdx, cleanupIdx + 2000)
    // Selected marker disappearance clears selectedMapItemId
    expect(cleanupBlock).toContain('if (selectedMapItemId)')
    expect(cleanupBlock).toContain('itemExists')
    expect(cleanupBlock).toContain('setSelectedMapItemId(null)')
    // Focused marker disappearance clears focusedMarkerId
    expect(cleanupBlock).toContain('if (focusedMarkerId)')
    expect(cleanupBlock).toContain('focusExists')
    expect(cleanupBlock).toContain('setFocusedMarkerId(null)')
    // Both checks are independent — both run if both disappear
  })

  it('10b. no stale details or focus state (empty-day safeguard clears both)', () => {
    // Empty-day safeguard clears both selectedMapItemId and focusedMarkerId
    const cleanupIdx = mapSrc.indexOf('Empty-day safeguard')
    const emptyDayBlock = mapSrc.substring(cleanupIdx, cleanupIdx + 300)
    expect(emptyDayBlock).toContain('mapItems.length === 0')
    expect(emptyDayBlock).toContain('setSelectedMapItemId(null)')
    expect(emptyDayBlock).toContain('setFocusedMarkerId(null)')
  })
})

// ============================================================
// Part 3: Map State Cleanup
// ============================================================

describe('Batch E — Map State Cleanup', () => {
  it('15. selected marker disappearing clears details (stale selection effect)', () => {
    expect(mapSrc).toContain('[SCHEDULE_MAP_STALE_SELECTION]')
    expect(mapSrc).toContain('setSelectedMapItemId(null)')
    expect(mapSrc).toContain('setSelectedMarker(null)')
  })

  it('16. focused marker disappearing clears focus (stale focus effect)', () => {
    expect(mapSrc).toContain('[SCHEDULE_MAP_STALE_FOCUS]')
    expect(mapSrc).toContain('setFocusedMarkerId(null)')
  })

  it('17. date change clears stale marker state (effect depends on selectedDate)', () => {
    const cleanupIdx = mapSrc.indexOf('Clear stale selection when date changes')
    const cleanupBlock = mapSrc.substring(cleanupIdx, cleanupIdx + 2000)
    expect(cleanupBlock).toContain('selectedDate')
    expect(cleanupBlock).toContain('selectedMapItemId')
    expect(cleanupBlock).toContain('focusedMarkerId')
  })

  it('18. deletion does not leave stale quick card (itemExists check clears)', () => {
    // When mapItems changes (e.g., deletion), the effect checks if selectedMapItemId still exists
    const cleanupIdx = mapSrc.indexOf('Clear stale selection when date changes')
    const cleanupBlock = mapSrc.substring(cleanupIdx, cleanupIdx + 1200)
    expect(cleanupBlock).toContain('itemExists')
    expect(cleanupBlock).toContain('mapItems.some(item => item.id === selectedMapItemId)')
  })

  it('19. empty-day map remains valid (empty-day safeguard clears all state)', () => {
    const cleanupIdx = mapSrc.indexOf('Empty-day safeguard')
    expect(cleanupIdx).toBeGreaterThan(0)
    const emptyDayBlock = mapSrc.substring(cleanupIdx, cleanupIdx + 300)
    expect(emptyDayBlock).toContain('mapItems.length === 0')
    expect(emptyDayBlock).toContain('setSelectedMapItemId(null)')
    expect(emptyDayBlock).toContain('setFocusedMarkerId(null)')
  })

  it('20. single-marker day remains valid (no special-casing that breaks single markers)', () => {
    // The cleanup effect only clears state when items disappear, not when there's one item
    const cleanupIdx = mapSrc.indexOf('Clear stale selection when date changes')
    const cleanupBlock = mapSrc.substring(cleanupIdx, cleanupIdx + 1200)
    // The effect checks mapItems.length === 0 for empty day, and itemExists for non-empty
    expect(cleanupBlock).toContain('mapItems.length === 0')
    expect(cleanupBlock).toContain('mapItems.some(item => item.id === selectedMapItemId)')
  })
})

// ============================================================
// Part 4: Overview Cards
// ============================================================

describe('Batch E — Overview Cards', () => {
  it('21. Reminder uses canonical right column (flex flex-col items-end gap-1.5)', () => {
    // The RemindersList component uses the canonical right column structure
    const reminderIdx = calendarSrc.indexOf('Lightweight RemindersList component')
    const reminderBlock = calendarSrc.substring(reminderIdx, reminderIdx + 8000)
    expect(reminderBlock).toContain('flex flex-col items-end gap-1.5 flex-shrink-0')
  })

  it('22. Job uses canonical right column (flex flex-col items-end gap-1.5)', () => {
    // The JobsTab JobCard uses the canonical right column structure
    const jobIdx = calendarSrc.indexOf('function JobsTab(')
    const jobBlock = calendarSrc.substring(jobIdx, jobIdx + 10000)
    expect(jobBlock).toContain('flex flex-col items-end gap-1.5 flex-shrink-0')
  })

  it('23. Appointment uses canonical right column (flex flex-col items-end gap-1.5)', () => {
    // The MeetingsTab uses the canonical right column structure
    const apptIdx = calendarSrc.indexOf('Lightweight MeetingsTab component')
    const apptBlock = calendarSrc.substring(apptIdx, apptIdx + 10000)
    expect(apptBlock).toContain('flex flex-col items-end gap-1.5 flex-shrink-0')
  })

  it('24. all status badges terminate at same right inset (flex-shrink-0 on right column)', () => {
    // All three card types use flex-shrink-0 on the right column
    expect(calendarSrc).toContain('flex flex-col items-end gap-1.5 flex-shrink-0')
  })

  it('25. all action rows align consistently (horizontal gap-1 for action buttons)', () => {
    // Reminder has Edit/Delete in a horizontal row
    const reminderIdx = calendarSrc.indexOf('Lightweight RemindersList component')
    const reminderBlock = calendarSrc.substring(reminderIdx, reminderIdx + 8000)
    expect(reminderBlock).toContain('flex items-center gap-1')
  })

  it('26. Reminder checkbox stays left (flex-shrink-0 checkbox before flex-1 content)', () => {
    const reminderIdx = calendarSrc.indexOf('Lightweight RemindersList component')
    const reminderBlock = calendarSrc.substring(reminderIdx, reminderIdx + 8000)
    // Checkbox is before the flex-1 content div
    const checkboxIdx = reminderBlock.indexOf('onToggleComplete')
    const flexIdx = reminderBlock.indexOf('min-w-0 flex-1')
    expect(checkboxIdx).toBeGreaterThan(0)
    expect(flexIdx).toBeGreaterThan(0)
    expect(checkboxIdx).toBeLessThan(flexIdx)
  })

  it('27. Job Edit remains functional (onEditJob button with stopPropagation)', () => {
    const jobIdx = calendarSrc.indexOf('function JobsTab(')
    const jobBlock = calendarSrc.substring(jobIdx, jobIdx + 10000)
    expect(jobBlock).toContain('onEditJob')
    expect(jobBlock).toContain('e.stopPropagation()')
    expect(jobBlock).toContain('aria-label="Edit job"')
  })

  it('28. Appointment Join remains functional (meetingUrl link with stopPropagation)', () => {
    const apptIdx = calendarSrc.indexOf('Lightweight MeetingsTab component')
    const apptBlock = calendarSrc.substring(apptIdx, apptIdx + 10000)
    expect(apptBlock).toContain('ev.meetingUrl')
    expect(apptBlock).toContain('Join')
    expect(apptBlock).toContain('e.stopPropagation()')
  })

  it('29. appointment Edit eligibility unchanged (isEditable checks job or rfLead)', () => {
    const apptIdx = calendarSrc.indexOf('Lightweight MeetingsTab component')
    const apptBlock = calendarSrc.substring(apptIdx, apptIdx + 10000)
    expect(apptBlock).toContain('isEligible')
    expect(apptBlock).toContain('isEditable')
    expect(apptBlock).toContain('Boolean(job || rfLead)')
  })

  it('30. long titles do not collide with right controls (min-w-0 flex-1 + flex-shrink-0)', () => {
    // All three card types use min-w-0 flex-1 for left content and flex-shrink-0 for right
    expect(calendarSrc).toContain('min-w-0 flex-1')
    expect(calendarSrc).toContain('flex-shrink-0')
  })
})

// ============================================================
// Part 5: Today Rhythm
// ============================================================

describe('Batch E — Today Rhythm', () => {
  it('31. all Today items use canonical outer row spacing (py-1.5 space-y-0.5)', () => {
    expect(todaySrc).toContain('px-3 pb-2.5 space-y-0.5 flex-1')
    expect(todaySrc).toContain('px-2 py-1.5 rounded hover:bg-blue-100/50')
  })

  it('32. title-only row has correct vertical rhythm (no empty secondary div)', () => {
    // The secondary line is conditionally rendered only when there's content
    expect(todaySrc).toContain('{(item.time || item.customer) && (')
  })

  it('33. title + time row has correct secondary gap (mt-0.5 on secondary line)', () => {
    expect(todaySrc).toContain('flex items-center gap-1.5 mt-0.5')
  })

  it('34. status row does not introduce extra margin (Overdue badge in title line, not secondary)', () => {
    // The Overdue badge is in the title line (flex items-center gap-1.5), not in the secondary line
    const overdueBadgeIdx = todaySrc.indexOf('item.isOverdue && (')
    const titleLineIdx = todaySrc.indexOf('flex items-center gap-1.5')
    expect(overdueBadgeIdx).toBeGreaterThan(titleLineIdx)
    // The badge is inside the title line div, not the secondary div
    const titleLineEnd = todaySrc.indexOf('</div>', titleLineIdx)
    expect(overdueBadgeIdx).toBeLessThan(titleLineEnd)
  })

  it('35. adjacent rows use consistent separation (space-y-0.5 between rows)', () => {
    expect(todaySrc).toContain('space-y-0.5')
  })

  it('36. wrapped title preserves padding (truncate on title, py-1.5 on row)', () => {
    // The title uses truncate, and the row uses py-1.5 for consistent padding
    expect(todaySrc).toContain('text-sm font-medium text-foreground truncate')
    expect(todaySrc).toContain('px-2 py-1.5 rounded hover:bg-blue-100/50')
  })

  it('37. icons align consistently (flex-shrink-0 icon container)', () => {
    expect(todaySrc).toContain('flex-shrink-0')
    // The icon/checkbox container is always 4x4 (w-4 h-4)
    expect(todaySrc).toContain('w-4 h-4')
  })

  it('38. card total layout remains compact (space-y-0.5 + py-1.5, no large gaps in Today card)', () => {
    // The Today card itself uses space-y-0.5 (2px) between rows and py-1.5 (6px) within rows
    // The outer wrapper uses space-y-4 for the entire Agenda section, which is fine
    // We check that the Today card section doesn't use py-4 or space-y-4 internally
    const todayCardStart = todaySrc.indexOf("Today - Premium Daily Summary Card")
    const todayCardEnd = todaySrc.indexOf("Needs Attention", todayCardStart)
    const todayCardBlock = todaySrc.substring(todayCardStart, todayCardEnd)
    expect(todayCardBlock).toContain('space-y-0.5')
    expect(todayCardBlock).toContain('py-1.5')
    // No large margin/padding that would make the card dramatically taller
    expect(todayCardBlock).not.toContain('py-4')
    expect(todayCardBlock).not.toContain('space-y-4')
  })
})
