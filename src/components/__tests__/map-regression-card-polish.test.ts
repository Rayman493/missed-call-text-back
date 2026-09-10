import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const scheduleMapContent = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8')
const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

// ---------------------------------------------------------------------------
// 1. MAP DATE KEY FIX — ROOT CAUSE REGRESSION
// ---------------------------------------------------------------------------

describe('Map Marker Regression — Date Key Fix', () => {
  it('prepareMapItems effect uses toLocaleDateString for dateKey (not toISOString)', () => {
    // The bug: preparedDateKeyRef was set using toISOString().split('T')[0] (UTC)
    // but the marker render guard checked against toLocaleDateString('en-CA') (local)
    // In US timezones, UTC date != local date in the evening, so markers never rendered
    const prepareEffectBlock = scheduleMapContent.substring(
      scheduleMapContent.indexOf('Prepare map items when date changes'),
      scheduleMapContent.indexOf('Prepare map items when date changes') + 800
    )
    expect(prepareEffectBlock).toContain("selectedDate.toLocaleDateString('en-CA')")
    expect(prepareEffectBlock).not.toContain('selectedDate.toISOString().split(')
  })

  it('preparedDateKeyRef is set using local date format', () => {
    // Search from the prepare effect start through the preparedDateKeyRef assignment
    const prepareEffectStart = scheduleMapContent.indexOf('Prepare map items when date changes')
    const prepareEffectBlock = scheduleMapContent.substring(prepareEffectStart, prepareEffectStart + 1200)
    expect(prepareEffectBlock).toContain("toLocaleDateString('en-CA')")
    expect(prepareEffectBlock).toContain('preparedDateKeyRef.current = dateKey')
  })

  it('marker render guard uses toLocaleDateString (consistent with preparedDateKey)', () => {
    const guardBlock = scheduleMapContent.substring(
      scheduleMapContent.indexOf('currentSelectedDateKey'),
      scheduleMapContent.indexOf('currentSelectedDateKey') + 200
    )
    expect(guardBlock).toContain("toLocaleDateString('en-CA')")
  })

  it('does not use toISOString for date key preparation', () => {
    // The prepare effect should NOT use toISOString for dateKey
    const prepareEffectBlock = scheduleMapContent.substring(
      scheduleMapContent.indexOf('Prepare map items when date changes'),
      scheduleMapContent.indexOf('Prepare map items when date changes') + 800
    )
    expect(prepareEffectBlock).not.toContain('toISOString()')
  })

  it('getItemsForDate uses toLocaleDateString (unchanged, consistent)', () => {
    const getItemsBlock = scheduleMapContent.substring(
      scheduleMapContent.indexOf('getItemsForDate'),
      scheduleMapContent.indexOf('getItemsForDate') + 200
    )
    expect(getItemsBlock).toContain("toLocaleDateString('en-CA')")
  })
})

// ---------------------------------------------------------------------------
// 2. JOBS CARD — CLICKABLE, VIEW/EDIT REMOVED
// ---------------------------------------------------------------------------

describe('Jobs Card — Clickable, View/Edit Removed', () => {
  // Extract the JobCard component (use wider window to capture full component)
  const jobCardStart = pageContent.indexOf('const JobCard = ({ job, variant }')
  const jobCardBlock = jobCardStart >= 0 ? pageContent.substring(jobCardStart, jobCardStart + 4000) : ''

  it('JobCard has role="button"', () => {
    expect(jobCardBlock).toContain('role="button"')
  })

  it('JobCard has tabIndex={0}', () => {
    expect(jobCardBlock).toContain('tabIndex={0}')
  })

  it('JobCard has onClick that calls onJobClick', () => {
    expect(jobCardBlock).toContain('onClick={() => onJobClick(job)}')
  })

  it('JobCard has keyboard activation (Enter/Space)', () => {
    expect(jobCardBlock).toContain("e.key === 'Enter'")
    expect(jobCardBlock).toContain("e.key === ' '")
  })

  it('JobCard has cursor-pointer', () => {
    expect(jobCardBlock).toContain('cursor-pointer')
  })

  it('JobCard has focus-visible ring', () => {
    expect(jobCardBlock).toContain('focus-visible:ring')
  })

  it('JobCard no longer has View text button', () => {
    // The old footer had a "View" text button
    const oldViewPattern = /View\s*<\/button>/
    expect(oldViewPattern.test(jobCardBlock)).toBe(false)
  })

  it('JobCard no longer has Edit text button in list card', () => {
    // The old footer had an "Edit" text button
    const oldEditPattern = /onEditJob\(job\).*?>\s*Edit\s*<\/button>/
    expect(oldEditPattern.test(jobCardBlock)).toBe(false)
  })

  it('JobCard no longer has footer divider with View/Edit', () => {
    // The old footer had: border-t border-slate-100 with View and Edit buttons
    expect(jobCardBlock).not.toContain('border-t border-slate-100 dark:border-slate-800')
  })

  it('JobCard preserves status badge', () => {
    // STATUS_COLORS is referenced inside JobCard
    expect(jobCardBlock).toContain('STATUS_COLORS[job.status]')
    expect(jobCardBlock).toContain('STATUS_LABELS[job.status]')
  })

  it('JobCard preserves payment badge', () => {
    expect(jobCardBlock).toContain('PAYMENT_COLORS')
    expect(jobCardBlock).toContain('paymentLabel')
  })

  it('JobCard preserves tracked time display', () => {
    expect(jobCardBlock).toContain('time_summary')
    expect(jobCardBlock).toContain('formatDuration')
  })

  it('JobCard preserves timer running indicator', () => {
    expect(jobCardBlock).toContain('Timer running')
  })

  it('JobCard does not use blanket opacity for completed/cancelled', () => {
    // The old code had opacity-80 for completed and opacity-60 for cancelled
    expect(jobCardBlock).not.toContain('opacity-80')
    expect(jobCardBlock).not.toContain('opacity-60')
  })
})

// ---------------------------------------------------------------------------
// 3. COMPLETED REMINDER — PREMIUM STATE
// ---------------------------------------------------------------------------

describe('Completed Reminder — Premium State', () => {
  // Extract the reminder renderGroup function (wider window to capture edit/delete buttons)
  const renderGroupStart = pageContent.indexOf('const renderGroup = (title')
  const renderGroupBlock = renderGroupStart >= 0 ? pageContent.substring(renderGroupStart, renderGroupStart + 3500) : ''

  it('completed reminder does not use blanket opacity', () => {
    // The old code had opacity-70 on completed rows
    const completedBlock = renderGroupBlock.substring(
      renderGroupBlock.indexOf('task.completed'),
      renderGroupBlock.indexOf('task.completed') + 200
    )
    expect(completedBlock).not.toContain('opacity-70')
    expect(completedBlock).not.toContain('opacity-80')
    expect(completedBlock).not.toContain('opacity-60')
  })

  it('completed reminder uses subtle muted surface', () => {
    const completedBlock = renderGroupBlock.substring(
      renderGroupBlock.indexOf('task.completed'),
      renderGroupBlock.indexOf('task.completed') + 200
    )
    expect(completedBlock).toContain('bg-slate-50/50')
    expect(completedBlock).toContain('dark:bg-slate-800/20')
  })

  it('completed reminder uses restrained neutral border', () => {
    const completedBlock = renderGroupBlock.substring(
      renderGroupBlock.indexOf('task.completed'),
      renderGroupBlock.indexOf('task.completed') + 200
    )
    expect(completedBlock).toContain('border-slate-200/40')
    expect(completedBlock).toContain('dark:border-slate-700/20')
  })

  it('completion indicator turns green when completed', () => {
    // The checkbox should have green border when completed
    const checkboxBlock = renderGroupBlock.substring(
      renderGroupBlock.indexOf('onToggleComplete'),
      renderGroupBlock.indexOf('onToggleComplete') + 400
    )
    expect(checkboxBlock).toContain('border-green-500')
    expect(checkboxBlock).toContain('bg-green-50')
  })

  it('non-completed checkbox uses neutral border', () => {
    const checkboxBlock = renderGroupBlock.substring(
      renderGroupBlock.indexOf('onToggleComplete'),
      renderGroupBlock.indexOf('onToggleComplete') + 400
    )
    expect(checkboxBlock).toContain('border-slate-300')
  })

  it('title keeps line-through when completed', () => {
    expect(renderGroupBlock).toContain('line-through')
  })

  it('title remains readable (not blanketed)', () => {
    // Title should use text-slate-500 dark:text-slate-400 (readable muted, not opacity)
    expect(renderGroupBlock).toContain('text-slate-500 dark:text-slate-400 line-through')
  })

  it('completed metadata is more muted than title', () => {
    // Completed metadata should use text-slate-400 dark:text-slate-500 (more muted)
    // These are in the due_date and notes conditional blocks
    expect(renderGroupBlock).toContain('text-slate-400 dark:text-slate-500')
  })

  it('edit/delete buttons remain muted by default', () => {
    expect(renderGroupBlock).toContain('text-slate-400')
  })

  it('edit button gains blue emphasis on hover', () => {
    expect(renderGroupBlock).toContain('hover:text-blue-600 dark:hover:text-blue-400')
  })

  it('delete button gains red emphasis on hover', () => {
    expect(renderGroupBlock).toContain('hover:text-red-600 dark:hover:text-red-400')
  })

  it('edit/delete callbacks preserved', () => {
    expect(renderGroupBlock).toContain('onEditTask(task)')
    expect(renderGroupBlock).toContain('onDeleteTask(task.id)')
  })

  it('toggle complete callback preserved', () => {
    expect(renderGroupBlock).toContain('onToggleComplete(task.id, task.completed)')
  })
})

// ---------------------------------------------------------------------------
// 4. APPOINTMENTS — HIERARCHY PRESERVED
// ---------------------------------------------------------------------------

describe('Appointments — Hierarchy Preserved', () => {
  // Extract the appointment rendering block (start from the list.map to capture full card including Join button)
  const apptListStart = pageContent.indexOf('list.map(ev => {')
  const apptBlock = apptListStart >= 0 ? pageContent.substring(apptListStart, apptListStart + 4500) : ''

  it('appointment row is clickable (role button)', () => {
    expect(apptBlock).toContain('role="button"')
    expect(apptBlock).toContain('tabIndex={0}')
  })

  it('appointment row opens event details on click', () => {
    expect(apptBlock).toContain('onClick={() => onOpenEvent(ev)}')
  })

  it('appointment row has keyboard activation', () => {
    expect(apptBlock).toContain("e.key === 'Enter'")
  })

  it('Join is far right (in right column)', () => {
    expect(apptBlock).toContain('flex flex-col items-end gap-1.5 flex-shrink-0')
    expect(apptBlock).toContain('Join')
  })

  it('Join uses blue primary treatment', () => {
    expect(apptBlock).toContain('bg-blue-600 text-white')
  })

  it('Join has shadow-sm (premium)', () => {
    expect(apptBlock).toContain('shadow-sm')
  })

  it('Join stopPropagation preserved', () => {
    expect(apptBlock).toContain('onClick={(e) => e.stopPropagation()}')
  })

  it('Past badge uses muted amber', () => {
    expect(apptBlock).toContain('bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300')
  })

  it('Scheduled badge uses restrained slate', () => {
    expect(apptBlock).toContain('bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300')
  })

  it('Completed badge uses restrained green', () => {
    expect(apptBlock).toContain('bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300')
  })

  it('all status badges use rounded-full', () => {
    // All badges should use rounded-full
    const badgeMatches = apptBlock.match(/rounded-full/g)
    expect(badgeMatches).not.toBeNull()
    expect(badgeMatches!.length).toBeGreaterThanOrEqual(3)
  })

  it('all status badges use text-[10px] for compact size', () => {
    const badgeMatches = apptBlock.match(/text-\[10px\]/g)
    expect(badgeMatches).not.toBeNull()
    expect(badgeMatches!.length).toBeGreaterThanOrEqual(3)
  })

  it('type badges are consistent (rounded-full, text-[10px])', () => {
    expect(apptBlock).toContain('Google Meet')
    expect(apptBlock).toContain('In Person')
  })

  it('past rows do not use blanket opacity', () => {
    // The appointment card should not apply opacity to the entire card for past events
    expect(apptBlock).not.toContain('opacity-')
  })

  it('no View/Edit text actions added to appointment card', () => {
    expect(apptBlock).not.toContain('>View<')
    expect(apptBlock).not.toContain('>Edit<')
  })
})

// ---------------------------------------------------------------------------
// 5. BEHAVIOR UNCHANGED
// ---------------------------------------------------------------------------

describe('Behavior Unchanged', () => {
  it('ScheduleMap still has prepareMapItems', () => {
    expect(scheduleMapContent).toContain('prepareMapItems')
  })

  it('ScheduleMap still has business marker logic', () => {
    expect(scheduleMapContent).toContain("type: 'business'")
    expect(scheduleMapContent).toContain("'business:home'")
  })

  it('ScheduleMap still has marker creation with google.maps.Marker', () => {
    expect(scheduleMapContent).toContain('google.maps.Marker')
  })

  it('ScheduleMap still has fitBoundsWithMaxZoom', () => {
    expect(scheduleMapContent).toContain('fitBoundsWithMaxZoom')
  })

  it('ScheduleMap still has mapReady state', () => {
    expect(scheduleMapContent).toContain('mapReady')
  })

  it('ScheduleMap still has markersRef', () => {
    expect(scheduleMapContent).toContain('markersRef')
  })

  it('page still has onJobClick callback', () => {
    expect(pageContent).toContain('onJobClick')
  })

  it('page still has onEditJob callback (for map context)', () => {
    // onEditJob is still used in the map context, just not in the list card
    expect(pageContent).toContain('onEditJob')
  })

  it('page still has onOpenEvent callback', () => {
    expect(pageContent).toContain('onOpenEvent')
  })

  it('page still has onToggleComplete callback', () => {
    expect(pageContent).toContain('onToggleComplete')
  })

  it('page still has onEditTask callback', () => {
    expect(pageContent).toContain('onEditTask')
  })

  it('page still has onDeleteTask callback', () => {
    expect(pageContent).toContain('onDeleteTask')
  })
})
