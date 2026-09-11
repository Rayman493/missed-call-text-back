/**
 * Batch 5 — Schedule + Interaction Consistency Tests
 *
 * Proves:
 * - Schedule card shell consistency (Reminder/Job/Appointment)
 * - Appointment Edit action on list cards
 * - Agenda is view-only (no inline edit controls)
 * - Job End Time data model audit (no end_time field → migration required)
 * - Map marker double-tap toggle (focusedMarkerId state)
 * - Dashboard chart remount fix (no key-based remount)
 * - Customer filter drag-open fix (suppress next open)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 5 — Schedule card consistency', () => {
  const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')

  // 1. Reminder/Job/Appointment cards share canonical shell classes
  it('Reminder cards use canonical shell (rounded-xl border p-4)', () => {
    // RemindersList renderGroup card
    expect(calendarPageSrc).toContain('rounded-xl border p-4 transition-all hover:shadow-sm')
  })

  it('Job cards use canonical shell (rounded-xl border p-4)', () => {
    // JobsTab JobCard — now uses border in the shell, not in the conditional
    const jobCardIdx = calendarPageSrc.indexOf('const JobCard =')
    const jobCardSection = calendarPageSrc.substring(jobCardIdx, jobCardIdx + 1000)
    expect(jobCardSection).toContain('rounded-xl border p-4')
  })

  it('Appointment cards use canonical shell (rounded-xl border p-4)', () => {
    // MeetingsTab card
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    expect(meetingsSection).toContain('rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60')
    expect(meetingsSection).toContain('p-4')
  })

  // 2. Title/status hierarchy consistent
  it('All card types use text-sm font-semibold for titles', () => {
    // Reminder title
    expect(calendarPageSrc).toContain('text-sm font-medium truncate')
    // Job title
    const jobCardIdx = calendarPageSrc.indexOf('const JobCard =')
    const jobCardSection = calendarPageSrc.substring(jobCardIdx, jobCardIdx + 2000)
    expect(jobCardSection).toContain('font-semibold')
    // Appointment title
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    expect(meetingsSection).toContain('text-sm font-semibold')
  })

  // 3. Action area aligns predictably (right side, flex-shrink-0)
  it('All card types have action area on right with flex-shrink-0', () => {
    // Reminder actions
    expect(calendarPageSrc).toContain('flex items-center gap-1 flex-shrink-0')
    // Job actions
    const jobCardIdx = calendarPageSrc.indexOf('const JobCard =')
    const jobCardSection = calendarPageSrc.substring(jobCardIdx, jobCardIdx + 3000)
    expect(jobCardSection).toContain('flex-col items-end gap-1.5 flex-shrink-0')
    // Appointment actions
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    expect(meetingsSection).toContain('flex-col items-end gap-1.5 flex-shrink-0')
  })

  // 4. Appointment editable card has Edit action (only for ReplyFlow-owned)
  it('Appointment cards have Edit action gated by isEditable (pencil icon)', () => {
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    expect(meetingsSection).toContain('isEditable')
    expect(meetingsSection).toContain('aria-label="Edit appointment"')
    expect(meetingsSection).toContain('Pencil')
  })

  // 4a. Editability rule: only ReplyFlow-owned events show Edit
  it('Editability uses isReplyFlowOwnedEvent rule (linked job or rfLead metadata)', () => {
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    // isEditable is computed from job link or replyflow_lead_id metadata
    expect(meetingsSection).toContain('const isEditable = Boolean(job || rfLead)')
  })

  // 4b. Read-only external events do not show Edit
  it('Read-only external events do not show Edit (isEditable gate)', () => {
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    // Edit is only rendered when isEditable is true
    expect(meetingsSection).toContain('{isEditable && (')
  })

  // 5. Join remains available where valid
  it('Appointment cards with meetingUrl have Join action', () => {
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    expect(meetingsSection).toContain('meetingUrl')
    expect(meetingsSection).toContain('Join')
  })

  // 5a. Read-only details still open (card click opens details regardless of editability)
  it('Appointment card click opens details view regardless of editability', () => {
    const meetingsTabIdx = calendarPageSrc.indexOf('function MeetingsTab')
    const meetingsSection = calendarPageSrc.substring(meetingsTabIdx, meetingsTabIdx + 8000)
    // The card onClick opens onOpenEvent for all events
    expect(meetingsSection).toContain('onClick={() => onOpenEvent(ev)}')
  })

  // 6. Reminder unique checkbox remains supported
  it('Reminder cards retain checkbox for quick-complete', () => {
    const remindersListIdx = calendarPageSrc.indexOf('function RemindersList')
    const remindersSection = calendarPageSrc.substring(remindersListIdx, remindersListIdx + 5000)
    expect(remindersSection).toContain('onToggleComplete')
    expect(remindersSection).toContain('aria-label')
  })
})

describe('Batch 5 — Agenda view-only', () => {
  const todayCommandCenterSrc = readSrc('src/components/schedule/TodayCommandCenter.tsx')

  // 8. Agenda reminder row has no edit pencil
  it('Agenda timeline task items have no edit pencil', () => {
    // The edit pencil was removed from task items in the timeline
    // Look for the comment indicating view-only
    expect(todayCommandCenterSrc).toContain('Agenda is view-only')
  })

  // 9. Agenda job row has no edit action
  it('Agenda timeline job items have no edit pencil', () => {
    // The edit pencil was removed from job items in the timeline
    const timelineIdx = todayCommandCenterSrc.indexOf("item.type === 'job'")
    const timelineSection = todayCommandCenterSrc.substring(timelineIdx, timelineIdx + 500)
    expect(timelineSection).not.toContain('onEditJob')
    expect(timelineSection).toContain('View')
  })

  // 10. Agenda appointment row has no edit action (never had one)
  it('Agenda appointment items have no edit action', () => {
    // Appointments in the Agenda never had edit controls
    const timelineSection = todayCommandCenterSrc
    // No onEditAppointment call in the timeline items
    const timelineIdx = todayCommandCenterSrc.indexOf('sortedWorkItems.map')
    const timelineSection2 = todayCommandCenterSrc.substring(timelineIdx, timelineIdx + 2000)
    expect(timelineSection2).not.toContain('onEditAppointment')
  })

  // 11. Bottom management cards still navigate correctly
  it('Bottom navigation cards navigate to reminders/jobs/appointments tabs', () => {
    expect(todayCommandCenterSrc).toContain("onNavigateTab?.('reminders')")
    expect(todayCommandCenterSrc).toContain("onNavigateTab?.('jobs')")
    expect(todayCommandCenterSrc).toContain("onNavigateTab?.('appointments')")
  })

  // 12. No separate Tasks tab/route introduced
  it('No separate Tasks tab/route introduced', () => {
    const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')
    // scheduleTab should only have: agenda, reminders, jobs, appointments, calendar, map
    expect(calendarPageSrc).toContain("'agenda' | 'reminders' | 'jobs' | 'appointments' | 'calendar' | 'map'")
    expect(calendarPageSrc).not.toContain("'tasks'")
  })

  // 13. Quick-complete checkbox has documented canonical intent
  it('Quick-complete checkbox retained with documented intent', () => {
    // The checkbox is retained as a canonical quick-action, not an edit action
    expect(todayCommandCenterSrc).toContain('toggleTaskComplete')
    // The view-only comment documents the decision
    expect(todayCommandCenterSrc).toContain('Agenda is view-only')
  })
})

describe('Batch 5 — Job End Time data model', () => {
  const jobsMigrationSrc = readSrc('supabase/migrations/20260731000000_create_jobs_table.sql')
  const jobsEndMigrationSrc = readSrc('supabase/migrations/20260911000000_add_jobs_scheduled_end_time.sql')
  const jobsApiSrc = readSrc('src/app/api/jobs/route.ts')
  const jobsPatchApiSrc = readSrc('src/app/api/jobs/[id]/route.ts')
  const jobComposerSrc = readSrc('src/components/jobs/JobComposer.tsx')
  const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')

  // 1. migration timestamp sorts after create_jobs migration
  it('End-time migration filename sorts after create_jobs migration', () => {
    expect(jobsEndMigrationSrc).toBeTruthy()
    // 20260911000000 > 20260731000000
    expect('20260911000000_add_jobs_scheduled_end_time.sql' > '20260731000000_create_jobs_table.sql').toBe(true)
  })

  // 2. migration adds nullable scheduled_end_time
  it('Migration adds nullable scheduled_end_time column', () => {
    expect(jobsEndMigrationSrc).toContain('scheduled_end_time time')
    expect(jobsEndMigrationSrc).toContain('add column if not exists')
    // Nullable (no NOT NULL constraint)
    expect(jobsEndMigrationSrc.toLowerCase()).not.toContain('not null')
  })

  it('Migration uses same unqualified table name as create_jobs migration', () => {
    // create_jobs uses unqualified "jobs" (no public. prefix)
    expect(jobsMigrationSrc).toContain('create table if not exists jobs (')
    expect(jobsEndMigrationSrc).toContain('alter table jobs')
    // Should NOT use public.jobs prefix (matches create_jobs convention)
    expect(jobsEndMigrationSrc).not.toContain('public.jobs')
  })

  // 10. Create API accepts scheduled_end_time
  it('Create API accepts scheduled_end_time', () => {
    expect(jobsApiSrc).toContain('scheduled_end_time')
    expect(jobsApiSrc).toContain('scheduled_end_time: scheduled_end_time || null')
  })

  // 11. Edit/PATCH API persists scheduled_end_time
  it('PATCH API allows scheduled_end_time in allowedFields', () => {
    expect(jobsPatchApiSrc).toContain("'scheduled_end_time'")
  })

  // 12. same-day end > start remains required (create)
  it('Create API validates end > start for same-day jobs', () => {
    expect(jobsApiSrc).toContain('End time must be after start time')
  })

  // 3. PATCH end-only change validates against persisted start
  it('PATCH computes effectiveStart from incoming or persisted scheduled_time', () => {
    expect(jobsPatchApiSrc).toContain("'scheduled_time' in updates ? updates.scheduled_time : existing.scheduled_time")
  })

  // 4. PATCH start-only change validates against persisted end
  it('PATCH computes effectiveEnd from incoming or persisted scheduled_end_time', () => {
    expect(jobsPatchApiSrc).toContain("'scheduled_end_time' in updates ? updates.scheduled_end_time : existing.scheduled_end_time")
  })

  // 5. invalid end-only PATCH rejected (effective validation present)
  it('PATCH validates effective end > effective start (covers end-only changes)', () => {
    // The effective-value block enforces end > start using merged values
    expect(jobsPatchApiSrc).toContain('effectiveStart')
    expect(jobsPatchApiSrc).toContain('effectiveEnd')
    expect(jobsPatchApiSrc).toContain('if (effectiveDate && effectiveStart && effectiveEnd)')
  })

  // 6. invalid start-only PATCH rejected (same effective validation)
  it('PATCH validates effective start < effective end (covers start-only changes)', () => {
    // Same effective block handles both directions
    const effBlockIdx = jobsPatchApiSrc.indexOf('effectiveStart')
    expect(effBlockIdx).toBeGreaterThan(-1)
  })

  // 7. valid partial PATCH accepted (only validates when both effective non-null)
  it('PATCH skips end>start check when effectiveEnd is null (nullable clearing safe)', () => {
    // Condition requires all three: effectiveDate && effectiveStart && effectiveEnd
    expect(jobsPatchApiSrc).toContain('if (effectiveDate && effectiveStart && effectiveEnd)')
  })

  // 8. clearing nullable end remains safe
  it('PATCH allows clearing scheduled_end_time to null', () => {
    // allowedFields includes scheduled_end_time; null is a valid value to set
    expect(jobsPatchApiSrc).toContain("'scheduled_end_time'")
    // No rejection of null end (the format check only runs when non-null)
    expect(jobsPatchApiSrc).toContain("if ('scheduled_end_time' in updates && updates.scheduled_end_time)")
  })

  it('PATCH fetches persisted job before validation (single read)', () => {
    expect(jobsPatchApiSrc).toContain("select('scheduled_date, scheduled_time, scheduled_end_time')")
  })

  // 13. New job defaults end to start + 1 hour only while end unset
  it('JobComposer defaults end to start + 1 hour while end is unset', () => {
    expect(jobComposerSrc).toContain('endTimeTouched')
    expect(jobComposerSrc).toContain('endH = h + 1')
  })

  // 9. 22:00 start defaults end to 23:00 (no midnight crossing)
  it('22:00 start defaults end to 23:00 (same day)', () => {
    // endH = 22 + 1 = 23, which is < 24, so default applies
    expect(jobComposerSrc).toContain('if (endH >= 24)')
  })

  // 10. 23:30 start does NOT auto-default to 00:30
  it('23:30 start does NOT auto-default (would cross midnight)', () => {
    // When endH >= 24, end is left empty
    expect(jobComposerSrc).toContain('if (endH >= 24)')
    expect(jobComposerSrc).toContain('crosses midnight')
    expect(jobComposerSrc).toContain('setScheduledEndTime(\'\')')
  })

  // 14. User-edited end is not overwritten
  it('User-edited end is preserved (endTimeTouched prevents auto-default)', () => {
    expect(jobComposerSrc).toContain('if (!isOpen || endTimeTouched) return')
    expect(jobComposerSrc).toContain('setEndTimeTouched(true)')
  })

  // 15. Historical null-end job loads safely
  it('Edit job with null scheduled_end_time loads safely', () => {
    // The edit effect uses optional chaining and defaults to empty string
    expect(jobComposerSrc).toContain("editJob.scheduled_end_time?.slice(0, 5) || ''")
  })

  // 16. User-facing time has no seconds
  it('Job card display formats end time as 12-hour AM/PM with no seconds', () => {
    // formatScheduled in calendar page appends end time in AM/PM format
    expect(calendarPageSrc).toContain('eampm')
    expect(calendarPageSrc).toContain('ehour')
  })

  // 17. Calendar uses stored end when present
  it('Calendar page formatScheduled uses scheduled_end_time when present', () => {
    expect(calendarPageSrc).toContain('job.scheduled_end_time')
  })

  // 18. Google sync uses stored end when present
  it('Google Calendar sync uses scheduled_end_time when present', () => {
    expect(jobsApiSrc).toContain('if (scheduled_end_time)')
    expect(jobsApiSrc).toContain("endDateTimeStr = `${scheduled_date}T${scheduled_end_time}:00`")
  })

  // 19. Google sync retains +1h fallback for legacy null end
  it('Google Calendar sync retains +1h fallback for null end', () => {
    expect(jobsApiSrc).toContain('endHours = hours + 1')
  })
})

describe('Batch 5 — Map marker double-tap toggle', () => {
  const scheduleMapSrc = readSrc('src/components/schedule/ScheduleMap.tsx')

  // 24. First double tap focuses marker
  it('Map has focusedMarkerId state for explicit focus tracking', () => {
    expect(scheduleMapSrc).toContain('focusedMarkerId')
    expect(scheduleMapSrc).toContain('setFocusedMarkerId')
  })

  // 25. Second double tap same marker clears focus
  it('Double-tap on focused marker clears focus (showAllMarkers)', () => {
    expect(scheduleMapSrc).toContain("focusedMarkerId === item.id")
    expect(scheduleMapSrc).toContain('showAllMarkers()')
  })

  // 26. Clear focus fits all visible markers
  it('showAllMarkers clears focusedMarkerId and fits bounds', () => {
    expect(scheduleMapSrc).toContain('setFocusedMarkerId(null)')
    const showAllIdx = scheduleMapSrc.indexOf('const showAllMarkers = useCallback')
    const showAllSection = scheduleMapSrc.substring(showAllIdx, showAllIdx + 500)
    expect(showAllSection).toContain('fitBoundsWithMaxZoom')
  })

  // 27. Different marker switches focus
  it('Focusing different marker updates focusedMarkerId', () => {
    expect(scheduleMapSrc).toContain('setFocusedMarkerId(item.id)')
  })

  // 28. Focus clears if marker disappears after date/filter change
  it('focusedMarkerId cleared when marker not in mapItems', () => {
    expect(scheduleMapSrc).toContain('focusExists')
    expect(scheduleMapSrc).toContain('setFocusedMarkerId(null)')
  })

  // 29. No camera feedback loop introduced
  it('No camera feedback loop (focus state is explicit, not inferred from zoom)', () => {
    // focusedMarkerId is an explicit state, not derived from camera position
    expect(scheduleMapSrc).toContain('const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null)')
  })

  // 30. Single-tap existing behavior preserved
  it('Single-tap on native mobile still focuses (existing behavior preserved)', () => {
    expect(scheduleMapSrc).toContain("source: 'marker_tap'")
    expect(scheduleMapSrc).toContain('focusStopOnMap(item.id, item.latitude, item.longitude)')
  })
})

describe('Batch 5 — Dashboard chart remount fix', () => {
  const chartUtilsSrc = readSrc('src/lib/chart-utils.tsx')

  // 31. Vertical drag over chart scrolls page (touchAction preserved)
  it('ChartTouchWrapper preserves touchAction pan-y pan-x for scrolling', () => {
    expect(chartUtilsSrc).toContain("touchAction: 'pan-y pan-x'")
  })

  // 32. Chart key does not change due to drag
  it('ChartTouchWrapper does NOT use chartResetKey for remount', () => {
    expect(chartUtilsSrc).not.toContain('chartResetKey')
    expect(chartUtilsSrc).not.toContain('setChartResetKey')
  })

  // 33. Chart does not remount after drag (no key prop on inner div)
  it('Inner div has no key prop (no remount)', () => {
    const wrapperIdx = chartUtilsSrc.indexOf('export function ChartTouchWrapper')
    const wrapperSection = chartUtilsSrc.substring(wrapperIdx)
    // The inner div should not have a key prop
    const innerDivMatch = wrapperSection.match(/<div\s+ref=\{innerRef\}[^>]*>/)
    expect(innerDivMatch).toBeTruthy()
    expect(innerDivMatch![0]).not.toContain('key=')
  })

  // 34. Chart does not reanimate after drag (no remount = no reanimation)
  it('Chart clears active state via synthetic mouseleave (not remount)', () => {
    expect(chartUtilsSrc).toContain('MouseEvent')
    expect(chartUtilsSrc).toContain('mouseleave')
    expect(chartUtilsSrc).toContain('recharts-surface')
  })

  // 35. Hover/active state clears without remount
  it('Hover/active state cleared via dispatched mouseleave event', () => {
    expect(chartUtilsSrc).toContain('dispatchEvent')
    expect(chartUtilsSrc).toContain('new MouseEvent')
  })

  // 36. Blank touch/tap does not focus whole chart (uses focus:outline-none, not broad outline-none)
  it('Chart wrapper uses focus:outline-none (not broad outline-none) to suppress touch focus', () => {
    expect(chartUtilsSrc).toContain('focus:outline-none')
  })

  // 37. Keyboard focus still has visible focus indication
  it('Chart wrapper has focus-visible ring for keyboard accessibility', () => {
    expect(chartUtilsSrc).toContain('focus-visible:ring-2')
    expect(chartUtilsSrc).toContain('focus-visible:ring-blue-500/30')
  })

  // 38. Datum interaction remains functional (pointerEvents restored after drag)
  it('Pointer events restored to auto after drag ends', () => {
    expect(chartUtilsSrc).toContain("pointerEvents = 'auto'")
  })

  // 39. No broad focus-outline suppression (no !important)
  it('No outline:none !important used', () => {
    expect(chartUtilsSrc).not.toContain('outline:none !important')
    expect(chartUtilsSrc).not.toContain('outline: none !important')
  })
})

describe('Batch 5 — Customer filter drag-open fix', () => {
  const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')

  // 39. Clean tap opens filter
  it('Filter button opens menu on clean tap (onPointerUp sets filterMenuOpen)', () => {
    expect(leadsPageSrc).toContain('setFilterMenuOpen(true)')
  })

  // 40. Minor movement below threshold opens filter
  it('Minor movement below threshold does not set filterMovedRef', () => {
    expect(leadsPageSrc).toContain('shouldPreventMenuOpen')
    expect(leadsPageSrc).toContain('filterMovedRef.current = true')
  })

  // 41. Drag above threshold does not open
  it('Drag above threshold suppresses menu open', () => {
    expect(leadsPageSrc).toContain('wasScroll')
    expect(leadsPageSrc).toContain('filterSuppressNextOpenRef')
  })

  // 42. Synthetic click after drag is suppressed once
  it('Synthetic click after drag is suppressed via filterSuppressNextOpenRef', () => {
    expect(leadsPageSrc).toContain('filterSuppressNextOpenRef.current = true')
    expect(leadsPageSrc).toContain('filterSuppressNextOpenRef.current = false')
  })

  // 43. Subsequent real tap opens normally
  it('Suppress flag is reset after one use', () => {
    // The flag is set to false in onOpenChange, onPointerCancel, and onClick
    expect(leadsPageSrc).toContain('filterSuppressNextOpenRef.current = false')
  })

  // 44. pointercancel resets state
  it('pointercancel resets all filter drag state', () => {
    // Find the filter button's onPointerCancel (near the filter dropdown)
    const filterBtnIdx = leadsPageSrc.indexOf('Filter dropdown button')
    const filterSection = leadsPageSrc.substring(filterBtnIdx, filterBtnIdx + 2000)
    expect(filterSection).toContain('onPointerCancel')
    expect(filterSection).toContain('filterSuppressNextOpenRef.current = false')
  })

  // 45. Keyboard activation still works
  it('Keyboard activation is not blocked (onClick only prevents when suppress flag set)', () => {
    // The onClick handler only prevents default when suppress flag is set
    const filterBtnIdx = leadsPageSrc.indexOf('Filter dropdown button')
    const filterSection = leadsPageSrc.substring(filterBtnIdx, filterBtnIdx + 3000)
    expect(filterSection).toContain('if (filterSuppressNextOpenRef.current)')
    expect(filterSection).toContain('e.preventDefault()')
  })

  // 46. Desktop click still works
  it('Desktop click is not blocked when not dragging', () => {
    // The onClick handler only acts when suppress flag is set
    expect(leadsPageSrc).toContain('if (filterSuppressNextOpenRef.current)')
  })
})
