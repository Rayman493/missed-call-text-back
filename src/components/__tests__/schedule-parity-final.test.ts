import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf-8')

const jobComposer = read('src/components/jobs/JobComposer.tsx')
const newTaskModal = read('src/components/schedule/NewTaskModal.tsx')
const newAppointmentModal = read('src/components/calendar/NewAppointmentModal.tsx')
const repeatControls = read('src/components/ui/RepeatControls.tsx')
const disclosure = read('src/components/customers/CustomerContextDisclosure.tsx')
const jobDetails = read('src/components/jobs/JobDetailsModal.tsx')
const tasksTab = read('src/components/schedule/TasksTab.tsx')
const eventDetails = read('src/components/calendar/EventDetailsModal.tsx')
const calendarPage = read('src/app/dashboard/calendar/page.tsx')
const tasksApi = read('src/app/api/tasks/route.ts')

describe('Schedule parity — common BASICS / TIMING / DETAILS hierarchy', () => {
  it('Job, Reminder and Appointment forms all use the shared section-header markup', () => {
    const headerMarkup = 'pb-1.5 border-b border-border/40'
    const headerText = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'
    for (const src of [jobComposer, newTaskModal, newAppointmentModal]) {
      expect(src).toContain(headerMarkup)
      expect(src).toContain(headerText)
    }
  })

  it('Job form exposes Basics, Timing and Details sections', () => {
    for (const name of ['Basics', 'Timing', 'Details']) {
      expect(jobComposer).toContain(`>${name}<`)
    }
  })

  it('Reminder form exposes Basics, Timing and Details sections (no duplicate Details)', () => {
    for (const name of ['Basics', 'Timing', 'Details']) {
      expect(newTaskModal).toContain(`>${name}<`)
    }
    // The old bug rendered two sections both titled "Details"
    expect(newTaskModal.match(/>Details</g)!.length).toBe(1)
  })

  it('Appointment form exposes Basics, Timing and Details sections', () => {
    for (const name of ['Basics', 'Timing', 'Details']) {
      expect(newAppointmentModal).toContain(`>${name}<`)
    }
    expect(newAppointmentModal).not.toContain('>Appointment Details<')
  })
})

describe('Schedule parity — shared Repeat control', () => {
  it('RepeatControls owns the prerequisite-hint treatment', () => {
    expect(repeatControls).toContain('prerequisiteHint?: string')
    expect(repeatControls).toContain('border-dashed')
    expect(repeatControls).toMatch(/>\s*Repeat\s*</)
  })

  it('all three create forms render RepeatControls (control never disappears)', () => {
    for (const src of [jobComposer, newTaskModal, newAppointmentModal]) {
      expect(src).toContain('<RepeatControls')
      expect(src).toContain('prerequisiteHint=')
    }
  })

  it('Repeat picker keeps the shared default label and placeholder', () => {
    expect(repeatControls).toContain('label="Repeat"')
    expect(repeatControls).toContain('placeholder="Does not repeat"')
    expect(repeatControls).toContain("'Does not repeat'")
  })
})

describe('Schedule parity — recurrence prerequisites and payloads unchanged', () => {
  it('Reminder create guards recurrence on a due date (API drops it otherwise)', () => {
    expect(newTaskModal).toContain('recurrence: dueDate ? repeatPayload(repeat) : null')
    expect(newTaskModal).toContain("prerequisiteHint={dueDate ? undefined : 'Set a due date above to schedule a repeating reminder.'}")
  })

  it('Job create guards recurrence on a scheduled date', () => {
    expect(jobComposer).toContain('recurrence: scheduledDate ? repeatPayload(repeat) : null')
    expect(jobComposer).toContain("prerequisiteHint={scheduledDate ? undefined : 'Set a date above to schedule a repeating job.'}")
  })

  it('Appointment create guards recurrence on a date', () => {
    expect(newAppointmentModal).toContain('recurrence: date ? (repeatPayload(repeat) || undefined) : undefined')
    expect(newAppointmentModal).toContain("prerequisiteHint={date ? undefined : 'Set a date above to schedule a repeating appointment.'}")
  })

  it('tasks API still requires due_date before persisting recurrence (engine untouched)', () => {
    expect(tasksApi).toContain('if (recurrence && recurrence.frequency && due_date)')
  })

  it('recurring-series edit scopes remain occurrence / future / series', () => {
    for (const src of [jobComposer, newTaskModal]) {
      expect(src).toContain("value: 'occurrence'")
      expect(src).toContain("value: 'future'")
      expect(src).toContain("value: 'series'")
    }
    for (const src of [jobComposer, newTaskModal]) {
      expect(src).toContain("scope: editScope")
    }
  })
})

describe('Schedule parity — one shared Customer Context implementation', () => {
  it('CustomerContextDisclosure resolves via the canonical getCurrentCustomerContext', () => {
    expect(disclosure).toContain("from '@/lib/customer-context'")
    expect(disclosure).toContain('getCurrentCustomerContext(leadData)')
  })

  it('disclosure is a compact expandable section (aria-expanded, collapsed by default)', () => {
    expect(disclosure).toContain('aria-expanded={open}')
    expect(disclosure).toContain('useState(false)')
    expect(disclosure).toContain('Customer context')
  })

  it('disclosure renders nothing without usable context values', () => {
    expect(disclosure).toContain('if (!leadData) return null')
    expect(disclosure).toContain('if (fields.length === 0) return null')
  })

  it('disclosure keeps intake semantics distinct from entity fields', () => {
    // Intake labels only — no "Title", "Notes" or "Scheduled" labels
    expect(disclosure).toContain('Reason for calling')
    expect(disclosure).toContain('Desired completion')
    expect(disclosure).toContain('Preferred callback')
    expect(disclosure).not.toContain("'Title'")
    expect(disclosure).not.toContain("'Scheduled'")
  })

  it('all three create forms mount the shared disclosure after customer selection', () => {
    for (const src of [jobComposer, newTaskModal, newAppointmentModal]) {
      expect(src).toContain('<CustomerContextDisclosure')
      expect(src).toContain('leadData={selectedCustomer}')
      // keyed by customer id — no stale context on customer switching
      expect(src).toContain('key={selectedCustomer.id}')
    }
  })

  it('all three view/summary surfaces mount the shared disclosure', () => {
    expect(jobDetails).toContain('<CustomerContextDisclosure leadData={lead}')
    expect(tasksTab).toContain('<CustomerContextDisclosure leadData={viewingTask.leads}')
    expect(eventDetails).toContain('<CustomerContextDisclosure leadData={currentLeadData}')
  })
})

describe('Schedule parity — appointment association resolution', () => {
  it('calendar resolution precedence is job.lead_id then replyflow_lead_id (no freeform-note inference)', () => {
    const block = calendarPage.slice(
      calendarPage.indexOf('const leadId = job?.lead_id'),
      calendarPage.indexOf('const leadId = job?.lead_id') + 300
    )
    expect(block).toContain('job?.lead_id || replyLeadId || null')
    // no name/phone-based matching against freeform event notes
    expect(block).not.toMatch(/description|notes/i)
  })

  it('resolution keeps the stale-request cancellation guard and loading state', () => {
    expect(calendarPage).toContain('let cancelled = false')
    expect(calendarPage).toContain('setSelectedEventLeadResolving(true)')
    expect(calendarPage).toContain('setSelectedEventLead(null)')
  })

  it('EventDetailsModal keeps the resolving skeleton (Batch 1 loading fix)', () => {
    expect(eventDetails).toContain('customerResolving')
    expect(eventDetails).toContain('animate-pulse')
  })

  it('customer context stays in sync when the associated customer changes or is removed', () => {
    expect(eventDetails).toContain('setCurrentLeadData(customer || null)')
    expect(eventDetails).toContain('setCurrentLeadData(null)')
  })
})

describe('Schedule parity — view/summary consistency', () => {
  it('Reminder summary uses the canonical uppercase field-label style', () => {
    expect(tasksTab).toContain('text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1')
    // six summary labels (Title, Status, Scheduled, Customer, Notes, Job)
    expect(tasksTab.match(/text-\[11px\] font-medium text-muted-foreground uppercase tracking-wider mb-1/g)!.length).toBeGreaterThanOrEqual(6)
  })

  it('view surfaces keep safe wrapping on customer names', () => {
    expect(jobDetails).toContain('min-w-0 break-words')
    expect(tasksTab).toContain('min-w-0 break-words')
  })
})
