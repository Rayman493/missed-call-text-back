/**
 * Regression tests for three physical-iOS failures:
 *  1. Editing a reminder saved on the server but the visible entry kept
 *     showing old values — onTaskCreated ignored the updated task payload
 *     for edits and only bumped a refresh trigger that never refetches tasks.
 *  2. The Schedule Job dropdown was hard to use on iPhone — tapping an
 *     option in a searchable picker closed the dropdown before the click
 *     landed (focusout with null relatedTarget), and option rows were too
 *     small for comfortable touch.
 *  3. The Time Tracked job selector never stuck — the same swallowed-click
 *     defect meant onChange never ran.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const pickerContent = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')
const taskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')

const onTaskCreatedBlock = pageContent.substring(
  pageContent.indexOf('onTaskCreated={(isNew, task)'),
  pageContent.indexOf('taskToEdit={taskToEdit}')
)
const focusoutSection = pickerContent.substring(
  pickerContent.indexOf('pointerDownInsideRef = useRef'),
  pickerContent.indexOf('// Close on escape key')
)

// Replicates the onTaskCreated reconcile logic: match the saved row by its
// real id or by the edited (possibly virtual) id; append if absent.
function reconcileTasks(prev: any[], task: any, editedId?: string | null) {
  const idx = prev.findIndex(t => t.id === task.id || t.id === editedId)
  if (idx === -1) {
    return prev.some(t => t.id === task.id) ? prev : [...prev, task]
  }
  const next = [...prev]
  next[idx] = { ...next[idx], ...task }
  return next
}

// ---------------------------------------------------------------------------
// ISSUE 2 — Reminder edit real-time update
// ---------------------------------------------------------------------------

describe('Reminder edit — immediate local update', () => {
  it('reconciles the saved task into state for edits, not just creates', () => {
    expect(onTaskCreatedBlock).toContain('setTasks(')
    expect(onTaskCreatedBlock).toContain('taskToEdit?.id')
    expect(onTaskCreatedBlock).toContain('...next[idx]')
    expect(onTaskCreatedBlock).toContain('...task')
  })

  it('refetches tasks when an edit response carries no task (scope=future)', () => {
    expect(onTaskCreatedBlock).toContain('else if (!isNew)')
    expect(onTaskCreatedBlock).toContain('fetchTasks()')
  })

  it('still bumps taskRefreshTrigger so dependent views reconcile', () => {
    expect(onTaskCreatedBlock).toContain('setTaskRefreshTrigger(prev => prev + 1)')
  })

  it('updated values replace the stale row in place (unrelated rows untouched)', () => {
    const prev = [
      { id: 'r1', title: 'Call back', due_date: '2026-09-25' },
      { id: 'r2', title: 'Order parts', due_date: '2026-09-26' },
    ]
    const saved = { id: 'r2', title: 'Order parts — urgent', due_date: '2026-09-27' }
    const next = reconcileTasks(prev, saved, 'r2')
    expect(next.map(t => t.id)).toEqual(['r1', 'r2'])
    expect(next[1].title).toBe('Order parts — urgent')
    expect(next[1].due_date).toBe('2026-09-27')
    expect(next[0]).toEqual(prev[0])
  })

  it('a recurring virtual row is replaced by the materialized real row', () => {
    const prev = [{ id: 'virtual:series9_2026-09-25', title: 'Weekly check' }]
    const saved = { id: 'real-uuid-7', title: 'Weekly check (edited)', series_id: 'series9' }
    const next = reconcileTasks(prev, saved, 'virtual:series9_2026-09-25')
    expect(next).toHaveLength(1)
    expect(next[0].id).toBe('real-uuid-7')
    expect(next[0].title).toBe('Weekly check (edited)')
  })

  it('a brand-new task is appended once without duplicates', () => {
    const prev = [{ id: 'r1', title: 'Existing' }]
    const created = { id: 'r9', title: 'New reminder' }
    const next = reconcileTasks(prev, created, null)
    expect(next.map(t => t.id)).toEqual(['r1', 'r9'])
    // Same payload again → no duplicate
    expect(reconcileTasks(next, created, null)).toHaveLength(2)
  })

  it('the modal still passes the API-returned task on successful save', () => {
    expect(taskModalContent).toContain('onTaskCreated(!taskToEdit, result.task || null)')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 3 — Schedule Job dropdown mobile navigation
// ---------------------------------------------------------------------------

describe('SelectPicker — iOS tap and navigation reliability', () => {
  it('tracks pointerdown inside the picker so option taps are recognized', () => {
    expect(pickerContent).toContain('pointerDownInsideRef = useRef(false)')
    expect(pickerContent).toContain("addEventListener('pointerdown', handlePointerDownInside, true)")
    expect(pickerContent).toContain("addEventListener('pointerup', handlePointerUp, true)")
  })

  it('does not close on focusout when an inside touch tap nulls relatedTarget', () => {
    expect(focusoutSection).toContain('if (!next && pointerDownInsideRef.current) return')
  })

  it('still closes when focus moves to a real element outside the picker', () => {
    const handler = focusoutSection.substring(focusoutSection.indexOf('const handleFocusOut'))
    expect(handler).toContain('pickerRef.current.contains(next)) return')
    expect(handler).toContain('setIsOpen(false)')
    expect(handler).toContain("setSearchQuery('')")
  })

  it('keeps outside-tap dismissal via pointerdown', () => {
    expect(pickerContent).toContain('markDropdownDismissed()')
    expect(pickerContent).toContain('!pickerRef.current.contains(event.target)')
  })

  it('gives option rows comfortable mobile touch targets', () => {
    expect(pickerContent).toContain('px-3 py-3 sm:py-2')
  })

  it('preserves independent in-dropdown scrolling and scroll-lock contract', () => {
    expect(pickerContent).toContain('overscroll-contain')
    expect(pickerContent).toContain('touch-pan-y')
    expect(pickerContent).toContain('WebkitOverflowScrolling')
    expect(pickerContent).toContain('data-scroll-lock-allow')
  })

  it('preserves viewport-aware dropdown height and drop-up placement', () => {
    expect(pickerContent).toContain('window.visualViewport')
    expect(pickerContent).toContain('setDropup')
    expect(pickerContent).toContain('setMaxDropdownHeight')
  })

  it('keeps long job titles readable via truncation and visible selected state', () => {
    expect(pickerContent).toContain('truncate flex-1 min-w-0')
    expect(pickerContent).toContain('selected ? \'bg-accent/40\'')
  })

  it('the Schedule Job dropdown is searchable only for long job lists', () => {
    expect(taskModalContent).toContain('searchable={jobs.length > 10}')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 4 — Time Tracked job selection sticks and persists
// ---------------------------------------------------------------------------

describe('Time Tracked card — job selection persistence', () => {
  const pickerSection = pageContent.substring(
    pageContent.indexOf('showTimerJobPicker && timeSummary'),
    pageContent.indexOf('timeSummary && !timeSummary.active_timer && active.length > 0')
  )
  const startTimerSection = pageContent.substring(
    pageContent.indexOf('const startSummaryTimer'),
    pageContent.indexOf('const stopSummaryTimer')
  )

  it('binds the dropdown value to timerJobId and onChange to setTimerJobId', () => {
    expect(pickerSection).toContain('value={timerJobId}')
    expect(pickerSection).toContain('onChange={(value) => setTimerJobId(value)}')
  })

  it('disables Start Timer until a job is selected', () => {
    expect(pickerSection).toContain('disabled={!timerJobId || timerActionInFlight}')
  })

  it('sends the selected job id in the start request path', () => {
    expect(startTimerSection).toContain('`/api/jobs/${timerJobId}/time-entries`')
    expect(startTimerSection).toContain("body: JSON.stringify({ action: 'start' })")
  })

  it('clears the selection only after a confirmed start, never on failure', () => {
    // Exactly one clear site, in the success path after res.ok.
    const clears = startTimerSection.match(/setTimerJobId\(null\)/g) || []
    expect(clears).toHaveLength(1)
    const successBranch = startTimerSection.substring(
      startTimerSection.indexOf('const entry = data?.entry')
    )
    expect(successBranch).toContain('setTimerJobId(null)')
    const failureBranch = startTimerSection.substring(
      startTimerSection.indexOf('if (!res.ok)'),
      startTimerSection.indexOf('const entry = data?.entry')
    )
    expect(failureBranch).not.toContain('setTimerJobId')
    const catchBranch = startTimerSection.substring(startTimerSection.indexOf('} catch {'))
    expect(catchBranch).not.toContain('setTimerJobId')
  })

  it('cancel hides the picker without touching saved data or firing requests', () => {
    const cancelButton = pickerSection.substring(
      pickerSection.indexOf('setShowTimerJobPicker(false)'),
      pickerSection.indexOf('onClick={startSummaryTimer}')
    )
    expect(cancelButton).not.toContain('fetch(')
    expect(cancelButton).not.toContain('setTimerJobId')
  })

  it('active timer state comes from the server summary, not the picker', () => {
    expect(pageContent).toContain('data.active_job?.job_id')
    expect(pageContent).toContain('setActiveTimerJob(null)')
  })

  it('is searchable for larger job lists — the case the swallowed click broke', () => {
    expect(pickerSection).toContain('searchable={active.length > 5}')
  })
})
