import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const newTaskModal = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const eventDetails = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const tasksPatch = readFileSync('src/app/api/tasks/[id]/route.ts', 'utf8')
const jobsPatch = readFileSync('src/app/api/jobs/[id]/route.ts', 'utf8')
const eventsPatch = readFileSync('src/app/api/google/calendar/events/[eventId]/route.ts', 'utf8')

describe('one-time → recurring — edit UI', () => {
  it('Job edit shows RepeatControls for non-recurring jobs with the shared hint', () => {
    expect(jobComposer).toContain('{!isRecurring && (')
    expect(jobComposer).toContain("prerequisiteHint={scheduledDate ? undefined : 'Set a date above to schedule a repeating job.'}")
    // payload: recurrence sent whenever the job is not already in a series
    expect(jobComposer).toContain('...(!isRecurring ? { recurrence: scheduledDate ? repeatPayload(repeat) : null } : {})')
    // recurring members keep scope semantics; no scope sent during conversion
    expect(jobComposer).toContain('scope: editScope, occurrence_date: editJob.scheduled_date')
  })

  it('Reminder edit shows RepeatControls for non-recurring reminders with the shared hint', () => {
    expect(newTaskModal).toContain('{!isRecurring && (')
    expect(newTaskModal).toContain("prerequisiteHint={dueDate ? undefined : 'Set a due date above to schedule a repeating reminder.'}")
    expect(newTaskModal).toContain('...(!isRecurring ? { recurrence: dueDate ? repeatPayload(repeat) : null } : {})')
    expect(newTaskModal).toContain('scope: editScope, occurrence_date: taskToEdit.due_date')
  })

  it('Appointment edit shows RepeatControls only for standalone events', () => {
    expect(eventDetails).toContain('{!isRecurringEvent && (')
    expect(eventDetails).toContain("prerequisiteHint={editedStartDate ? undefined : 'Set a date above to schedule a repeating appointment.'}")
    expect(eventDetails).toContain('repeatPayload(repeat)')
    // repeat is reset on entering/cancelling edit — no stale pattern
    expect(eventDetails).toContain('setRepeat(NO_REPEAT)')
    // recurring events keep occurrence/series scope picker
    expect(eventDetails).toContain("value: 'series', label: 'Entire series'")
  })
})

describe('one-time → recurring — persistence', () => {
  for (const [name, src] of [['tasks', tasksPatch], ['jobs', jobsPatch]] as const) {
    it(`${name} PATCH converts in place via createSeriesOnce on the existing row id`, () => {
      // conversion only when no series exists and a frequency is supplied
      expect(src).toMatch(/if \(!series && recurrence\?\.frequency/)
      expect(src).toContain('createSeriesOnce(')
      // response carries the series meta so UI reflects recurrence immediately
      expect(src).toContain('recurrenceMetaForRow(createdSeries')
    })
  }

  it('tasks conversion anchors on the persisted due_date with the row as template', () => {
    const block = tasksPatch.slice(tasksPatch.indexOf('One-time → recurring'))
    expect(block).toContain("'task', id, snapshot, updatedTask.due_date")
    expect(block).toContain('business.business_hours_timezone')
    // snapshot keeps associations
    expect(block).toContain('lead_id: updatedTask.lead_id')
    expect(block).toContain('job_id: updatedTask.job_id')
  })

  it('jobs conversion anchors on the persisted scheduled_date with the row as template', () => {
    const block = jobsPatch.slice(jobsPatch.indexOf('One-time → recurring'))
    expect(block).toContain("'job', id, snapshot, job.scheduled_date")
    expect(block).toContain('business_hours_timezone')
    expect(block).toContain('lead_id: job.lead_id')
    expect(block).toContain('conversation_id: job.conversation_id')
  })

  it('conversion failure returns an error — no silent half-state', () => {
    for (const src of [tasksPatch, jobsPatch]) {
      const block = src.slice(src.indexOf('One-time → recurring'))
      expect(block).toContain('seriesError')
      expect(block).toContain('{ status: 400 }')
    }
  })

  it('conversion failure is an honest partial save — distinguishes from field failure and ships the updated row', () => {
    for (const src of [tasksPatch, jobsPatch]) {
      const block = src.slice(src.indexOf('One-time → recurring'))
      // never claims the whole save failed — message says edits persisted
      expect(block).toContain('Your changes were saved, but the repeat schedule could not be applied')
      // distinguishable by the client
      expect(block).toContain('recurrenceFailed: true')
      // authoritative row returned for reconciliation
      expect(block).toMatch(/recurrenceFailed: true,\s*(task:|job,)/)
    }
  })

  it('concurrent conversions converge on one series — loser deactivates its duplicate and adopts the winner', () => {
    const service = readFileSync('src/lib/recurrence/service.ts', 'utf8')
    const once = service.slice(service.indexOf('createSeriesOnce'))
    // pre-check for an existing template series (repeat Save safe)
    expect(once).toContain('getSeriesForTemplate(supabase, businessId, entityType, templateId)')
    // post-insert reconcile: list ALL active series for the template
    expect(once).toContain(".eq('template_id', templateId)")
    expect(once).toContain(".eq('active', true)")
    // deterministic winner + duplicate retirement + adoption
    expect(once).toContain("update({ active: false }).eq('id', created.id)")
    expect(once).toContain('getSeriesById(supabase, businessId, winner.id)')
  })

  it('UI reconciles authoritative state after a partial failure', () => {
    // Reminder modal syncs the persisted row into the list without closing
    expect(newTaskModal).toContain('error.recurrenceFailed && error.task')
    expect(newTaskModal).toContain('onTaskCreated(false, error.task)')
    // Job composer keeps the error visible; onSave would flip it to create mode
    const failStart = jobComposer.indexOf('if (!response.ok)')
    const failEnd = jobComposer.indexOf('throw new Error(data.error', failStart)
    expect(jobComposer.slice(failStart, failEnd)).not.toContain('onSave(')
  })

  it('Google PATCH failure leaves the event untouched and shows a retryable error', () => {
    // single PATCH body carries recurrence — Google applies it atomically
    expect(eventsPatch).toContain('body: JSON.stringify(googleEvent)')
    expect(eventsPatch).toContain("{ error: 'Failed to update event in Google Calendar' }")
    // modal keeps edit mode and shows the error — no recurring claim until 2xx
    const saveBlock = eventDetails.slice(eventDetails.indexOf('const response = await fetch'))
    expect(saveBlock.indexOf('if (!response.ok)')).toBeLessThan(saveBlock.indexOf('setIsEditing(false)'))
    expect(saveBlock).toContain('setError(errorData.error')
  })

  it('appointments convert via Google-native RRULE on the same event id', () => {
    expect(eventsPatch).toContain("import { toGoogleRRules } from '@/lib/recurrence/rule'")
    expect(eventsPatch).toContain("body.recurrence.frequency && body.recurrence.frequency !== 'none'")
    expect(eventsPatch).toContain('googleEvent.recurrence = toGoogleRRules(')
    // anchor day derived from the event's own start date — timezone preserved
    expect(eventsPatch).toContain("body.start?.date || body.start?.dateTime")
  })

  it('appointments still reject future-scope edits (unchanged)', () => {
    expect(eventsPatch).toContain("body.scope === 'future'")
  })

  it('existing series edits never hit the conversion path', () => {
    // conversion is gated on !series — series members take scope paths only
    for (const src of [tasksPatch, jobsPatch]) {
      const convIdx = src.indexOf('One-time → recurring')
      const scopeIdx = src.indexOf("editScope === 'future'")
      expect(convIdx).toBeGreaterThan(scopeIdx)
      expect(src).toContain('if (!series && recurrence?.frequency')
    }
  })
})
