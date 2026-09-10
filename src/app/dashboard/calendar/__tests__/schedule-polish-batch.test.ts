import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const eventDetailsContent = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')
const newTaskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const businessDateUtilsContent = readFileSync('src/lib/business-date-utils.ts', 'utf8')
const timeSummaryRouteContent = readFileSync('src/app/api/jobs/time-summary/route.ts', 'utf8')

// ---------------------------------------------------------------------------
// 1. DUPLICATE APPOINTMENT SUCCESS TOAST FIX
// ---------------------------------------------------------------------------

describe('Schedule Polish — Duplicate Toast Fix', () => {
  it('onRefresh no longer shows a generic success toast', () => {
    // The onRefresh callback should only call fetchEvents(), not showToast
    const onRefreshBlock = pageContent.substring(
      pageContent.indexOf('onRefresh={async () => {'),
      pageContent.indexOf('onDelete={async')
    )
    expect(onRefreshBlock).toContain('fetchEvents()')
    expect(onRefreshBlock).not.toContain("showToast('Appointment updated on calendar'")
    expect(onRefreshBlock).not.toContain("showToast(\"Appointment updated on calendar\"")
  })

  it('EventDetailsModal owns customer link success toast', () => {
    expect(eventDetailsContent).toContain("'Customer updated successfully'")
  })

  it('EventDetailsModal owns customer remove success toast', () => {
    expect(eventDetailsContent).toContain("'Customer removed successfully'")
  })

  it('onDelete still owns its own toast (separate action)', () => {
    const onDeleteBlock = pageContent.substring(
      pageContent.indexOf('onDelete={async'),
      pageContent.indexOf('/>', pageContent.indexOf('onDelete={async'))
    )
    expect(onDeleteBlock).toContain("showToast('Appointment removed from calendar'")
  })
})

// ---------------------------------------------------------------------------
// 2. AI SUMMARY DISCLOSURE
// ---------------------------------------------------------------------------

describe('Schedule Polish — AI Summary Disclosure', () => {
  it('uses ChevronDown when collapsed', () => {
    expect(eventDetailsContent).toContain('ChevronDown')
  })

  it('uses ChevronUp when expanded', () => {
    expect(eventDetailsContent).toContain('ChevronUp')
  })

  it('no longer uses X icon for AI Summary disclosure', () => {
    // The X icon rotate-45 pattern is gone from the AI Summary button
    const aiSummaryBlock = eventDetailsContent.substring(
      eventDetailsContent.indexOf('AI Summary'),
      eventDetailsContent.indexOf('AI Summary') + 500
    )
    expect(aiSummaryBlock).not.toContain('rotate-45')
  })

  it('has aria-expanded attribute on disclosure button', () => {
    expect(eventDetailsContent).toContain('aria-expanded={isTranscriptOpen}')
  })

  it('AI Summary label uses uppercase tracking-wider (consistent micro-label)', () => {
    // Search from the disclosure button which contains both the className and "AI Summary"
    const aiSummaryButtonStart = eventDetailsContent.lastIndexOf('<button', eventDetailsContent.indexOf('AI Summary'))
    const aiSummaryLabelBlock = eventDetailsContent.substring(
      aiSummaryButtonStart,
      aiSummaryButtonStart + 600
    )
    expect(aiSummaryLabelBlock).toContain('uppercase')
    expect(aiSummaryLabelBlock).toContain('tracking-wider')
  })

  it('View/Hide Transcript uses chevron icons (not plus/minus)', () => {
    const transcriptBlock = eventDetailsContent.substring(
      eventDetailsContent.indexOf('View Transcript'),
      eventDetailsContent.indexOf('View Transcript') + 500
    )
    // Should use ChevronDown/Up, not Plus/Minus
    expect(transcriptBlock).not.toContain('Plus')
    expect(transcriptBlock).not.toContain('Minus')
  })

  it('transcript block uses muted background (not dark debug-style)', () => {
    expect(eventDetailsContent).not.toContain('bg-slate-900/50')
  })

  it('preserves expand/collapse behavior (isTranscriptOpen state)', () => {
    expect(eventDetailsContent).toContain('setIsTranscriptOpen')
  })
})

// ---------------------------------------------------------------------------
// 3. CROSS-SURFACE CONSISTENCY
// ---------------------------------------------------------------------------

describe('Schedule Polish — Cross-Surface Consistency', () => {
  it('Jobs card padding normalized to p-4 (not p-4 sm:p-5)', () => {
    expect(pageContent).not.toContain('rounded-xl p-4 sm:p-5 transition-all hover:shadow-sm')
    expect(pageContent).toContain('rounded-xl p-4 transition-all hover:shadow-sm')
  })

  it('Appointments badges use rounded-full (matching Jobs)', () => {
    // All appointment badges should now use rounded-full
    expect(pageContent).not.toContain('text-[10px] px-1.5 py-0.5 rounded ')
    expect(pageContent).toContain('text-[10px] px-1.5 py-0.5 rounded-full')
  })

  it('all four tabs use text-lg font-semibold for title', () => {
    // Count occurrences of the title pattern
    const matches = pageContent.match(/text-lg font-semibold text-slate-900 dark:text-foreground/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(4)
  })

  it('all four tabs use text-xs text-slate-500 for subtitle', () => {
    const matches = pageContent.match(/text-xs text-slate-500 dark:text-slate-400 mt-0\.5/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// 4. REMINDER MODAL CONSISTENCY
// ---------------------------------------------------------------------------

describe('Schedule Polish — Reminder Modal', () => {
  it('Delete Task uses Trash2 icon', () => {
    expect(newTaskModalContent).toContain('Trash2')
  })

  it('Save Changes uses Check icon (not Plus) when editing', () => {
    expect(newTaskModalContent).toContain('Check')
    // The Save button should use Check for edit mode
    expect(newTaskModalContent).toContain("taskToEdit ? <Check")
  })

  it('Delete button has flex items-center justify-center gap-2', () => {
    const deleteBlock = newTaskModalContent.substring(
      newTaskModalContent.indexOf('onClick={handleDelete}'),
      newTaskModalContent.indexOf('onClick={handleDelete}') + 500
    )
    expect(deleteBlock).toContain('flex items-center justify-center gap-2')
  })
})

// ---------------------------------------------------------------------------
// 5. JOB TIMER PREMIUM POLISH
// ---------------------------------------------------------------------------

describe('Schedule Polish — JobTimer Polish', () => {
  it('Time Tracked header has running indicator in header row', () => {
    // The "Running" badge should be in the header, not inline with the clock
    const headerBlock = jobTimerContent.substring(
      jobTimerContent.indexOf('Time Tracked'),
      jobTimerContent.indexOf('Time Tracked') + 800
    )
    expect(headerBlock).toContain('Running')
  })

  it('entry edit/delete icons use w-3.5 h-3.5 (not w-3 h-3)', () => {
    // The edit/delete buttons should use slightly larger icons
    expect(jobTimerContent).toContain('Pencil className="w-3.5 h-3.5"')
    expect(jobTimerContent).toContain('Trash2 className="w-3.5 h-3.5"')
  })

  it('entry edit/delete buttons have rounded hover background', () => {
    expect(jobTimerContent).toContain('hover:bg-blue-50 dark:hover:bg-blue-900/20')
    expect(jobTimerContent).toContain('hover:bg-red-50 dark:hover:bg-red-900/20')
  })

  it('entry rows have hover background', () => {
    expect(jobTimerContent).toContain('hover:bg-muted/30 dark:hover:bg-muted/20')
  })

  it('inline editing state uses blue border (intentional editing state)', () => {
    expect(jobTimerContent).toContain('border-blue-200 dark:border-blue-700/40')
  })

  it('inline editing inputs have focus ring', () => {
    expect(jobTimerContent).toContain('focus:ring-2 focus:ring-primary/40')
  })

  it('inline editing labels use uppercase tracking-wider', () => {
    expect(jobTimerContent).toContain('uppercase tracking-wider block mb-1')
  })

  it('delete confirmation uses rounded-lg and larger text', () => {
    expect(jobTimerContent).toContain('rounded-lg bg-red-50')
  })
})

// ---------------------------------------------------------------------------
// 6. JOBS TIME TRACKED SUMMARY
// ---------------------------------------------------------------------------

describe('Schedule Polish — Jobs Time Tracked Summary', () => {
  it('JobsTab has timeSummary state', () => {
    expect(pageContent).toContain('timeSummary')
    expect(pageContent).toContain('setTimeSummary')
  })

  it('JobsTab fetches from /api/jobs/time-summary', () => {
    expect(pageContent).toContain('/api/jobs/time-summary')
  })

  it('Time Tracked card shows Today and This Week', () => {
    const timeTrackedBlock = pageContent.substring(
      pageContent.indexOf('Time Tracked Summary'),
      pageContent.indexOf('Time Tracked Summary') + 2000
    )
    expect(timeTrackedBlock).toContain('Today')
    expect(timeTrackedBlock).toContain('This Week')
  })

  it('Time Tracked card uses formatDuration', () => {
    const timeTrackedBlock = pageContent.substring(
      pageContent.indexOf('Time Tracked Summary'),
      pageContent.indexOf('Time Tracked Summary') + 2000
    )
    expect(timeTrackedBlock).toContain('formatDuration')
  })

  it('Time Tracked card shows active timer indicator', () => {
    const timeTrackedBlock = pageContent.substring(
      pageContent.indexOf('Time Tracked Summary'),
      pageContent.indexOf('Time Tracked Summary') + 2000
    )
    expect(timeTrackedBlock).toContain('Timer running')
  })

  it('Time Tracked card shows week job count', () => {
    const timeTrackedBlock = pageContent.substring(
      pageContent.indexOf('Time Tracked Summary'),
      pageContent.indexOf('Time Tracked Summary') + 2000
    )
    expect(timeTrackedBlock).toContain('week_job_count')
  })

  it('Time Tracked card only renders when there is time data', () => {
    const timeTrackedBlock = pageContent.substring(
      pageContent.indexOf('Time Tracked Summary'),
      pageContent.indexOf('Time Tracked Summary') + 200
    )
    // Should be conditionally rendered
    expect(timeTrackedBlock).toContain('timeSummary &&')
  })

  it('API route exists at /api/jobs/time-summary', () => {
    expect(timeSummaryRouteContent).toContain('GET')
    expect(timeSummaryRouteContent).toContain('today_ms')
    expect(timeSummaryRouteContent).toContain('week_ms')
    expect(timeSummaryRouteContent).toContain('week_job_count')
    expect(timeSummaryRouteContent).toContain('active_timer')
  })

  it('API route uses business timezone for day/week boundaries', () => {
    expect(timeSummaryRouteContent).toContain('getBusinessDayStart')
    expect(timeSummaryRouteContent).toContain('getBusinessDayEnd')
    expect(timeSummaryRouteContent).toContain('getBusinessWeekStart')
    expect(timeSummaryRouteContent).toContain('getBusinessWeekEnd')
    expect(timeSummaryRouteContent).toContain('business_hours_timezone')
  })

  it('API route uses single query (no N+1)', () => {
    expect(timeSummaryRouteContent).toContain('.from(')
    expect(timeSummaryRouteContent).toContain("from('job_time_entries')")
    expect(timeSummaryRouteContent).not.toMatch(/for\s*\(.*of\s+jobs.*\)\s*{[\s\S]*?fetch/)
  })

  it('API route clamps entry durations to period boundaries', () => {
    expect(timeSummaryRouteContent).toContain('Math.max(0, Math.min')
    expect(timeSummaryRouteContent).toContain('todayStartMs')
    expect(timeSummaryRouteContent).toContain('weekStartMs')
  })

  it('API route counts active timer', () => {
    expect(timeSummaryRouteContent).toContain('activeTimer')
    expect(timeSummaryRouteContent).toContain('ended_at')
  })
})

// ---------------------------------------------------------------------------
// 7. BUSINESS DATE UTILS
// ---------------------------------------------------------------------------

describe('Schedule Polish — Business Date Utils', () => {
  it('getBusinessWeekEnd helper exists', () => {
    expect(businessDateUtilsContent).toContain('getBusinessWeekEnd')
  })

  it('getBusinessDayEnd helper exists', () => {
    expect(businessDateUtilsContent).toContain('getBusinessDayEnd')
  })

  it('getBusinessWeekEnd uses Sunday-start convention (6 days from Sunday)', () => {
    const weekEndBlock = businessDateUtilsContent.substring(
      businessDateUtilsContent.indexOf('getBusinessWeekEnd'),
      businessDateUtilsContent.indexOf('getBusinessWeekEnd') + 500
    )
    expect(weekEndBlock).toContain('daysToSaturday')
    expect(weekEndBlock).toContain('6 - dayOfWeek')
  })

  it('getBusinessDayEnd sets 23:59:59.999', () => {
    const dayEndBlock = businessDateUtilsContent.substring(
      businessDateUtilsContent.indexOf('getBusinessDayEnd'),
      businessDateUtilsContent.indexOf('getBusinessDayEnd') + 300
    )
    expect(dayEndBlock).toContain('23, 59, 59, 999')
  })
})

// ---------------------------------------------------------------------------
// 8. NO BEHAVIORAL CHANGES
// ---------------------------------------------------------------------------

describe('Schedule Polish — No Behavioral Changes', () => {
  it('EventDetailsModal still calls onRefresh for data refresh', () => {
    expect(eventDetailsContent).toContain('onRefresh?.()')
  })

  it('EventDetailsModal still calls onShowToast for per-action success', () => {
    expect(eventDetailsContent).toContain("onShowToast?.('Customer updated successfully'")
    expect(eventDetailsContent).toContain("onShowToast?.('Customer removed successfully'")
  })

  it('JobTimer still uses /api/jobs/[id]/time-entries for per-job operations', () => {
    expect(jobTimerContent).toContain('/api/jobs/')
    expect(jobTimerContent).toContain('time-entries')
  })

  it('JobTimer still has handleStart and handleStop', () => {
    expect(jobTimerContent).toContain('handleStart')
    expect(jobTimerContent).toContain('handleStop')
  })

  it('Schedule tabs are still horizontally scrollable on mobile', () => {
    expect(pageContent).toContain('overflow-x-auto')
  })
})
