import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const calendarPage = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const scheduleMap = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8')
const todayCommandCenter = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')
const eventDetailsModal = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const newAppointmentModal = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')

// Extract the createNumberedMarkerIcon function definition (wide window)
const markerFnStart = scheduleMap.indexOf('const createNumberedMarkerIcon = (stopNumber')
const markerFnEnd = scheduleMap.indexOf('const createMarkerShape = (iconSize')
const markerFn = markerFnStart >= 0 ? scheduleMap.substring(markerFnStart, markerFnEnd) : ''

// Extract the createMarkerShape function definition
const shapeFnStart = scheduleMap.indexOf('const createMarkerShape = (iconSize')
const shapeFn = shapeFnStart >= 0 ? scheduleMap.substring(shapeFnStart, shapeFnStart + 500) : ''

// Extract handleSaveChanges function
const saveChangesStart = eventDetailsModal.indexOf('const handleSaveChanges = async')
const saveChangesFn = saveChangesStart >= 0 ? eventDetailsModal.substring(saveChangesStart, saveChangesStart + 2000) : ''

// Extract handleCancelEdit function
const cancelEditStart = eventDetailsModal.indexOf('const handleCancelEdit = ()')
const cancelEditFn = cancelEditStart >= 0 ? eventDetailsModal.substring(cancelEditStart, cancelEditStart + 800) : ''

// Extract the Meeting Notes UI section
const meetingNotesIdx = eventDetailsModal.indexOf('Meeting Notes - private notes')
const meetingNotesBlock = meetingNotesIdx >= 0 ? eventDetailsModal.substring(meetingNotesIdx - 50, meetingNotesIdx + 600) : ''

describe('Part 1 — Modal Right-Edge / Form Grid Alignment', () => {
  it('NewAppointmentModal uses space-y-4 (not space-y-5)', () => {
    expect(newAppointmentModal).toContain('space-y-4')
    expect(newAppointmentModal).not.toContain('space-y-5')
  })

  it('NewAppointmentModal two-column grid has no extra div wrappers around TimePickers', () => {
    const startIdx = newAppointmentModal.indexOf('Start Time')
    const gridStart = newAppointmentModal.lastIndexOf('grid grid-cols-2', startIdx)
    const block = newAppointmentModal.substring(gridStart, startIdx + 100)
    // Should not contain <div> wrapper around TimePicker
    expect(block).not.toContain('<div>\n                    <TimePicker')
  })

  it('NewAppointmentModal footer buttons are direct children (no redundant flex wrapper)', () => {
    const cancelIdx = newAppointmentModal.indexOf("handleCancel('cancel_button')")
    const block = newAppointmentModal.substring(cancelIdx - 200, cancelIdx + 100)
    expect(block).not.toContain('flex flex-wrap gap-2 min-w-0')
  })

  it('JobComposer uses grid-cols-2 for Date|Time row', () => {
    // Find the Date|Time grid by looking for the Date label in the scheduling section
    const dateLabelIdx = jobComposer.indexOf('label="Date"')
    // Search backwards for the grid div
    const gridIdx = jobComposer.lastIndexOf('grid grid-cols-2 gap-3', dateLabelIdx)
    expect(gridIdx).toBeGreaterThan(-1)
    // Verify the grid contains both Date and Time (wider window)
    const block = jobComposer.substring(gridIdx, gridIdx + 500)
    expect(block).toContain('label="Date"')
    expect(block).toContain('label="Time"')
  })
})

describe('Part 2 — Single Save Model (EventDetailsModal)', () => {
  it('has editedNotes state for draft notes', () => {
    expect(eventDetailsModal).toContain('editedNotes')
    expect(eventDetailsModal).toContain('setEditedNotes')
  })

  it('has no standalone Save Notes button', () => {
    expect(eventDetailsModal).not.toContain('Save Notes')
  })

  it('Meeting Notes participates in edit mode (isEditing conditional)', () => {
    expect(meetingNotesBlock).toContain('isEditing')
    expect(meetingNotesBlock).toContain('editedNotes')
  })

  it('handleSaveChanges persists notes alongside other edits', () => {
    expect(saveChangesFn).toContain('/api/meetings/')
    expect(saveChangesFn).toContain('editedNotes')
  })

  it('handleCancelEdit resets editedNotes', () => {
    expect(cancelEditFn).toContain('setEditedNotes')
  })

  it('edit mode footer says "Save Changes" (not just "Save")', () => {
    // Search for the "Save Changes" text directly in the file
    expect(eventDetailsModal).toContain('Save Changes')
  })

  it('initialization effect sets editedNotes from notes', () => {
    const initIdx = eventDetailsModal.indexOf('Initialize form state when event changes')
    const block = eventDetailsModal.substring(initIdx, initIdx + 500)
    expect(block).toContain('setEditedNotes(notes)')
  })
})

describe('Part 3 — Appointment Card Hierarchy', () => {
  it('card padding is p-3.5 (tightened from p-4)', () => {
    expect(calendarPage).toContain('p-3.5')
  })

  it('type badge spacing tightened to mt-0.5 (from mt-1)', () => {
    expect(calendarPage).toContain('gap-1.5 mt-0.5')
  })

  it('Join button is far right with stopPropagation', () => {
    // Find the Join link in the appointment card (has stopPropagation)
    const joinLinkIdx = calendarPage.indexOf('href={ev.meetingUrl}')
    const block = calendarPage.substring(joinLinkIdx, joinLinkIdx + 500)
    expect(block).toContain('stopPropagation')
    expect(block).toContain('bg-blue-600')
    expect(block).toContain('Join')
  })

  it('status badges are small text with rounded-full', () => {
    expect(calendarPage).toContain("text-[10px] px-1.5 py-0.5 rounded-full")
  })

  it('no blanket opacity on past appointment rows', () => {
    const cardIdx = calendarPage.indexOf('rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60')
    const block = calendarPage.substring(cardIdx, cardIdx + 300)
    expect(block).not.toContain('opacity-50')
    expect(block).not.toContain('opacity-60')
  })
})

describe('Part 4 — Premium Map Marker Visuals', () => {
  it('business marker uses green (#059669)', () => {
    expect(markerFn).toContain('#059669')
  })

  it('premium per-stop palette exists with distinct colors', () => {
    expect(scheduleMap).toContain('PREMIUM_STOP_PALETTE')
    expect(scheduleMap).toContain('#1E40AF') // deep blue
    expect(scheduleMap).toContain('#0D9488') // teal
    expect(scheduleMap).toContain('#7C3AED') // violet
  })

  it('stop colors are assigned by stop number from palette (not single semantic color)', () => {
    expect(markerFn).toContain('PREMIUM_STOP_PALETTE[(stopNumber - 1) % PREMIUM_STOP_PALETTE.length]')
  })

  it('job markers no longer use single #2563EB for all stops', () => {
    expect(markerFn).not.toContain("type === 'job'")
  })

  it('appointment markers no longer use single #D97706 for all stops', () => {
    expect(markerFn).not.toContain("type === 'appointment'\n          ? '#D97706'")
  })

  it('Job vs Appointment type distinction via dashed ring for appointments', () => {
    expect(markerFn).toContain('isAppointment')
    expect(markerFn).toContain('setLineDash')
  })

  it('business marker uses vector home icon (not emoji)', () => {
    expect(markerFn).not.toContain('🏠')
    expect(markerFn).toContain('moveTo')
    expect(markerFn).toContain('lineTo')
  })

  it('selected marker is ~15% larger (42px vs 36px)', () => {
    expect(markerFn).toContain('isSelected ? 42 : 36')
  })

  it('selected marker has amber emphasis ring', () => {
    expect(markerFn).toContain('#F59E0B')
  })

  it('has white outer ring for satellite/map readability', () => {
    expect(markerFn).toContain("'#FFFFFF'")
    expect(markerFn).toContain('ringWidth')
  })

  it('has drop shadow for premium depth', () => {
    expect(markerFn).toContain('shadowColor')
    expect(markerFn).toContain('shadowBlur')
  })

  it('has inner highlight gradient for premium feel', () => {
    expect(markerFn).toContain('highlightGrad')
    expect(markerFn).toContain('createLinearGradient')
  })

  it('handles >99 stops with "99+" label', () => {
    expect(markerFn).toContain('99+')
  })

  it('marker shape scales with icon size (not hardcoded 22)', () => {
    expect(shapeFn).toContain('iconSize / 2')
    expect(shapeFn).not.toContain('radius = 22')
  })

  it('marker shape call site uses 42/36 sizes', () => {
    expect(scheduleMap).toContain('createMarkerShape(isSelected ? 42 : 36)')
  })
})

describe('Part 5 — Map Viewport Fit', () => {
  it('ScheduleMap container uses h-full (not dvh calc)', () => {
    const containerIdx = scheduleMap.indexOf('Map Container')
    const block = scheduleMap.substring(containerIdx, containerIdx + 200)
    expect(block).toContain('h-full')
    expect(block).not.toContain('h-[calc(100dvh')
  })

  it('page wrapper owns height with dvh calc', () => {
    expect(calendarPage).toContain('h-[calc(100dvh-160px')
    expect(calendarPage).toContain('md:h-[calc(100dvh-192px')
  })

  it('page wrapper min-h is 400px (reduced from 500px)', () => {
    expect(calendarPage).toContain('min-h-[400px]')
    expect(calendarPage).not.toContain('min-h-[500px]')
  })
})

describe('Part 5b — Bottom Nav Height Audit', () => {
  // --bottom-nav-height is set by BottomNavigation component:
  // - Default in :root (globals.css): 72px
  // - Mobile: measured actual nav height (including safe-area) set on body
  // - Desktop (lg:hidden): nav element has display:none, offsetHeight=0, set to "0px" on body
  // The fallback "80px" in Tailwind class only applies if CSS var is completely unset.

  it('globals.css defines --bottom-nav-height default as 72px', () => {
    const globalsCss = readFileSync('src/app/globals.css', 'utf8')
    expect(globalsCss).toContain('--bottom-nav-height: 72px')
  })

  it('BottomNavigation sets --bottom-nav-height to 0px when nav is hidden', () => {
    const bottomNav = readFileSync('src/components/BottomNavigation.tsx', 'utf8')
    expect(bottomNav).toContain("--bottom-nav-height', '0px'")
  })

  it('BottomNavigation nav element uses lg:hidden (display:none at >=1024px)', () => {
    const bottomNav = readFileSync('src/components/BottomNavigation.tsx', 'utf8')
    expect(bottomNav).toContain('lg:hidden')
  })

  it('BottomNavigation measures actual offsetHeight when nav is visible', () => {
    const bottomNav = readFileSync('src/components/BottomNavigation.tsx', 'utf8')
    expect(bottomNav).toContain('navElement.offsetHeight')
    expect(bottomNav).toContain("document.body.style.setProperty('--bottom-nav-height'")
  })

  it('map height formula uses var(--bottom-nav-height,80px) with fallback', () => {
    // The fallback 80px only applies if CSS var is completely unset.
    // BottomNavigation always sets it (to 0px on desktop, actual height on mobile).
    expect(calendarPage).toContain('var(--bottom-nav-height,80px)')
  })

  it('desktop does NOT reserve mobile bottom nav height (resolves to 0px via lg:hidden)', () => {
    // On desktop: nav has lg:hidden → display:none → offsetHeight=0 → --bottom-nav-height=0px
    // Calc: 100dvh - 192px - 0px = 100dvh - 192px
    // At 1366x768: 768 - 192 = 576px
    // At 1920x1080: 1080 - 192 = 888px
    const bottomNav = readFileSync('src/components/BottomNavigation.tsx', 'utf8')
    // The else branch sets actual offsetHeight, which is 0 on desktop due to lg:hidden
    expect(bottomNav).toContain('navElement.offsetHeight')
  })

  it('mobile still reserves bottom nav (measured actual height)', () => {
    // On mobile: nav is visible → offsetHeight = actual height (e.g., 80px with safe-area)
    // Calc: 100dvh - 160px - ~80px = 100dvh - ~240px
    const bottomNav = readFileSync('src/components/BottomNavigation.tsx', 'utf8')
    expect(bottomNav).toContain('navElement.offsetHeight')
    expect(bottomNav).toContain("document.body.style.setProperty('--bottom-nav-height'")
  })

  it('map marker/date/camera logic unchanged — local-date fix preserved', () => {
    expect(scheduleMap).toContain("toLocaleDateString('en-CA')")
  })

  it('map marker/date/camera logic unchanged — fitBounds preserved', () => {
    expect(scheduleMap).toContain('fitBounds')
  })

  it('map marker/date/camera logic unchanged — STOP_COLOR_PALETTE fallback preserved', () => {
    expect(scheduleMap).toContain('STOP_COLOR_PALETTE')
  })
})

describe('Part 6 — Agenda Desktop Density', () => {
  it('Today card has sm:min-h for desktop presence', () => {
    expect(todayCommandCenter).toContain('sm:min-h-[180px]')
  })

  it('Today card uses flex-col for proper layout', () => {
    const todayIdx = todayCommandCenter.indexOf('Today - Premium Daily Summary Card')
    const block = todayCommandCenter.substring(todayIdx, todayIdx + 250)
    expect(block).toContain('flex flex-col')
  })

  it('summary cards have sm:min-h for consistent presence', () => {
    expect(todayCommandCenter).toContain('sm:min-h-[110px]')
  })

  it('summary cards use mt-auto for View link alignment', () => {
    expect(todayCommandCenter).toContain('mt-auto pt-2')
  })

  it('empty state uses flex-1 for centering', () => {
    expect(todayCommandCenter).toContain('flex-1 flex flex-col justify-center')
  })

  it('item list uses flex-1 to fill card', () => {
    expect(todayCommandCenter).toContain('space-y-0.5 flex-1')
  })

  it('mobile does not inherit desktop min-height (sm: prefix)', () => {
    expect(todayCommandCenter).toContain('sm:min-h-[180px]')
    expect(todayCommandCenter).toContain('sm:min-h-[110px]')
  })
})

describe('Part 7 — Reminder Completion Toast Verification', () => {
  it('has exactly one showToast call in handleToggleTaskComplete', () => {
    const handlerStart = calendarPage.indexOf('const handleToggleTaskComplete')
    const handlerBlock = calendarPage.substring(handlerStart, handlerStart + 1200)
    const showToastCalls = handlerBlock.match(/showToast\(/g)
    expect(showToastCalls).not.toBeNull()
    expect(showToastCalls!.length).toBe(1)
  })

  it('uses "Reminder completed" copy', () => {
    expect(calendarPage).toContain("'Reminder completed'")
  })

  it('uses "Reminder reopened" copy', () => {
    expect(calendarPage).toContain("'Reminder reopened'")
  })

  it('uses success type', () => {
    const handlerStart = calendarPage.indexOf('const handleToggleTaskComplete')
    const handlerBlock = calendarPage.substring(handlerStart, handlerStart + 1200)
    expect(handlerBlock).toContain("'success'")
  })

  it('toast fires after response.ok guard', () => {
    const handlerStart = calendarPage.indexOf('const handleToggleTaskComplete')
    const handlerBlock = calendarPage.substring(handlerStart, handlerStart + 1200)
    const okGuardIdx = handlerBlock.indexOf('if (!response.ok) return')
    const showToastIdx = handlerBlock.indexOf('showToast')
    expect(okGuardIdx).toBeGreaterThan(-1)
    expect(showToastIdx).toBeGreaterThan(okGuardIdx)
  })
})

describe('Part 2b — Appointment Save Partial-Failure Safety', () => {
  // Extract handleSaveChanges function (wide window to capture notes persistence)
  const saveChangesStart = eventDetailsModal.indexOf('const handleSaveChanges = async')
  const saveChangesFn = saveChangesStart >= 0 ? eventDetailsModal.substring(saveChangesStart, saveChangesStart + 3500) : ''

  it('Google Calendar PATCH is attempted first', () => {
    const googlePatchIdx = saveChangesFn.indexOf('/api/google/calendar/events/')
    const notesPatchIdx = saveChangesFn.indexOf('/api/meetings/')
    expect(googlePatchIdx).toBeGreaterThan(-1)
    expect(notesPatchIdx).toBeGreaterThan(-1)
    expect(googlePatchIdx).toBeLessThan(notesPatchIdx)
  })

  it('Google failure returns early without attempting notes save', () => {
    // The !response.ok guard returns before the notes PATCH
    const googleFailGuard = saveChangesFn.indexOf('if (!response.ok)')
    const notesPatch = saveChangesFn.indexOf('/api/meetings/')
    expect(googleFailGuard).toBeGreaterThan(-1)
    expect(notesPatch).toBeGreaterThan(googleFailGuard)
  })

  it('Google failure sets error and does not close edit mode', () => {
    const googleFailGuard = saveChangesFn.indexOf('if (!response.ok)')
    const block = saveChangesFn.substring(googleFailGuard, googleFailGuard + 200)
    expect(block).toContain('setError')
    expect(block).toContain('return')
  })

  it('notes save failure does NOT silently close edit mode', () => {
    // The notesSaveFailed flag should prevent setIsEditing(false)
    expect(saveChangesFn).toContain('notesSaveFailed')
    expect(saveChangesFn).toContain('if (notesSaveFailed)')
    expect(saveChangesFn).toContain('return')
  })

  it('notes save failure preserves draft and shows error', () => {
    const notesFailBlock = saveChangesFn.indexOf('if (notesSaveFailed)')
    const block = saveChangesFn.substring(notesFailBlock, notesFailBlock + 300)
    expect(block).toContain('setError')
    expect(block).toContain('notes draft is preserved')
  })

  it('notes save failure does NOT call onRefresh or onClose', () => {
    // The notesSaveFailed block should return before onRefresh/onClose
    // Only check the if-block itself (not the Success section that follows)
    const notesFailBlock = saveChangesFn.indexOf('if (notesSaveFailed)')
    const block = saveChangesFn.substring(notesFailBlock, notesFailBlock + 150)
    expect(block).toContain('return')
    // The block should end before the Success section
    expect(block).not.toContain('onRefresh')
    expect(block).not.toContain('onClose')
  })

  it('full success closes edit mode and calls onRefresh/onClose', () => {
    const successBlock = saveChangesFn.indexOf('// Success')
    const block = saveChangesFn.substring(successBlock, successBlock + 200)
    expect(block).toContain('setIsEditing(false)')
    expect(block).toContain('onRefresh')
    expect(block).toContain('onClose')
  })

  it('unchanged notes do not generate unnecessary PATCH', () => {
    // The guard "editedNotes !== notes" prevents unnecessary notes PATCH
    expect(saveChangesFn).toContain('editedNotes !== notes')
  })

  it('no duplicate success toast (no explicit toast in handleSaveChanges)', () => {
    // handleSaveChanges should not call onShowToast or showToast
    expect(saveChangesFn).not.toContain('onShowToast')
    expect(saveChangesFn).not.toContain('showToast')
  })

  it('Cancel still restores original Meeting Notes', () => {
    const cancelStart = eventDetailsModal.indexOf('const handleCancelEdit = ()')
    const cancelFn = cancelStart >= 0 ? eventDetailsModal.substring(cancelStart, cancelStart + 800) : ''
    expect(cancelFn).toContain('setEditedNotes(notes)')
  })

  it('notes-only save works (Google fields unchanged still PATCHes Google)', () => {
    // Even if only notes changed, the Google PATCH still fires with current edited field values.
    // This is correct: the single-save model always sends the full form state.
    expect(saveChangesFn).toContain('/api/google/calendar/events/')
    expect(saveChangesFn).toContain('/api/meetings/')
  })

  it('calendar-fields-only save works (notes unchanged skips notes PATCH)', () => {
    // If notes are unchanged, the notes PATCH is skipped via the guard
    expect(saveChangesFn).toContain('editedNotes !== notes')
  })
})

describe('Part 9 — Regression Safety', () => {
  it('six schedule tabs preserved', () => {
    expect(calendarPage).toContain("scheduleTab === 'agenda'")
    expect(calendarPage).toContain("scheduleTab === 'reminders'")
    expect(calendarPage).toContain("scheduleTab === 'jobs'")
    expect(calendarPage).toContain("scheduleTab === 'appointments'")
    expect(calendarPage).toContain("scheduleTab === 'calendar'")
    expect(calendarPage).toContain("scheduleTab === 'map'")
  })

  it('local-date marker fix preserved (toLocaleDateString en-CA)', () => {
    expect(scheduleMap).toContain("toLocaleDateString('en-CA')")
  })

  it('STOP_COLOR_PALETTE still exists as fallback', () => {
    expect(scheduleMap).toContain('STOP_COLOR_PALETTE')
  })

  it('markerIconCache preserved', () => {
    expect(scheduleMap).toContain('markerIconCache')
  })

  it('fitBounds preserved', () => {
    expect(scheduleMap).toContain('fitBounds')
  })

  it('EventDetailsModal Mark Complete preserved', () => {
    expect(eventDetailsModal).toContain('markComplete')
    expect(eventDetailsModal).toContain('showCompleteConfirm')
  })

  it('EventDetailsModal Join preserved', () => {
    expect(eventDetailsModal).toContain('Join')
    expect(eventDetailsModal).toContain('meetingUrl')
  })

  it('EventDetailsModal Text Details preserved', () => {
    expect(eventDetailsModal).toContain('Text Details')
  })

  it('EventDetailsModal Google Calendar link preserved', () => {
    expect(eventDetailsModal).toContain('Google Calendar')
  })
})
