import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const jobComposer = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const jobDetails = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
const newTask = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const tasksTab = readFileSync('src/components/schedule/TasksTab.tsx', 'utf8')
const newAppointment = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')
const eventDetails = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const calendarPage = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')

const SECTION_TOKEN = 'text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'
const SECTION_WRAP = 'pb-1.5 border-b border-border/40'

// Slice helper: content between two markers
const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from)
  const b = src.indexOf(to, a + from.length)
  return a === -1 || b === -1 ? '' : src.slice(a, b)
}

describe('post-rebuild batch 1 — shared section/header tokens', () => {
  it('all create/edit forms share the canonical uppercase section-header pattern', () => {
    for (const src of [jobComposer, newTask, newAppointment]) {
      expect(src).toContain(SECTION_TOKEN)
      expect(src).toContain(SECTION_WRAP)
    }
  })

  it('all forms use the shared Modal shell with a footer', () => {
    for (const src of [jobComposer, newTask, newAppointment]) {
      expect(src).toMatch(/<Modal[\s\S]*?title=/)
      expect(src).toContain('footer=')
      expect(src).toContain('useModalBackButton is owned by the shared <Modal>')
    }
  })

  it('JobComposer exposes BASICS / TIMING / DETAILS sections', () => {
    expect(jobComposer).toContain('>Basics</p>')
    expect(jobComposer).toContain('>Timing</p>')
    expect(jobComposer).toContain('>Details</p>')
    // Ordering: Basics before Timing before Details
    expect(jobComposer.indexOf('>Basics</p>')).toBeLessThan(jobComposer.indexOf('>Timing</p>'))
    expect(jobComposer.indexOf('>Timing</p>')).toBeLessThan(jobComposer.indexOf('>Details</p>'))
  })

  it('JobComposer keeps the same fields — title, customer, address, date/time, status, notes', () => {
    expect(jobComposer).toContain('Job Title')
    expect(jobComposer).toContain('SearchableCustomerSelect')
    expect(jobComposer).toContain('Service Address')
    expect(jobComposer).toContain('DatePicker')
    expect(jobComposer).toContain('Start Time')
    expect(jobComposer).toContain('Status')
    expect(jobComposer).toContain('Notes')
  })
})

describe('post-rebuild batch 1 — New/Edit parity', () => {
  it('JobComposer is the single New/Edit Job form', () => {
    expect(jobComposer).toContain("title={editJob ? 'Edit Job' : 'New Job'}")
  })

  it('NewTaskModal is the single New/Edit Reminder form', () => {
    expect(newTask).toContain("title={taskToEdit ? 'Edit Reminder' : 'New Reminder'}")
  })

  it('sticky footers share the Cancel + primary action pattern', () => {
    for (const src of [jobComposer, newTask]) {
      expect(src).toMatch(/>\s*Cancel\s*<\/button>/)
      expect(src).toContain('bg-primary hover:bg-primary/90')
      expect(src).toContain('bg-muted hover:bg-muted/80')
    }
    expect(newAppointment).toContain('bg-primary hover:bg-primary/90')
  })
})

describe('post-rebuild batch 1 — View Job horizontal overflow', () => {
  it('customer action row wraps instead of overflowing', () => {
    const row = slice(jobDetails, '{/* Customer', '{/* Location')
    expect(row).toContain('flex-wrap')
    expect(row).toContain('min-w-0 break-words')
    expect(row).toContain('ml-auto')
  })

  it('long names, phones and addresses cannot force horizontal scroll', () => {
    const customer = slice(jobDetails, '{/* Customer', '{/* Location')
    expect(customer).toContain('break-all')
    const location = slice(jobDetails, '{/* Location', '{/* Schedule')
    expect(location).toContain('min-w-0')
    expect(location).toContain('flex-wrap')
  })

  it('header badges and notes wrap safely', () => {
    expect(jobDetails).toContain('flex items-center gap-2 mt-1 flex-wrap')
    const notes = slice(jobDetails, '{/* Job Notes', '{/* Payment')
    expect(notes).toContain('break-words min-w-0')
  })

  it('all customer actions are preserved', () => {
    const row = slice(jobDetails, '{/* Customer', '{/* Location')
    expect(row).toMatch(/>\s*View\s*<\/button>/)
    expect(row).toContain('Conversation')
    expect(row).toMatch(/>\s*Call\s*<\/a>/)
    expect(row).toContain('tel:')
  })
})

describe('post-rebuild batch 1 — New Job Repeat prerequisite', () => {
  it('RepeatControls renders only when a scheduled date exists', () => {
    const timing = slice(jobComposer, '{/* Section: Timing', '{/* Section: Details')
    expect(timing).toMatch(/scheduledDate \?\s*\(\s*<RepeatControls/)
    expect(timing).not.toMatch(/scheduledDate[\s\S]*?<RepeatControls[\s\S]*disabledRepeat/)
  })

  it('shows a visible prerequisite hint instead of hiding Repeat entirely', () => {
    expect(jobComposer).toMatch(/>\s*Repeat\s*<\/label>/)
    expect(jobComposer).toContain('Set a date above to schedule a repeating job.')
    // hint must be non-operable (no picker rendered without a date)
    const hint = slice(jobComposer, 'Set a date above', '</p>')
    expect(hint).not.toContain('RepeatControls')
  })

  it('repeat stays inoperable without a date — no enabled picker', () => {
    const timing = slice(jobComposer, '{/* Recurrence', '{isRecurring && (')
    expect(timing).toContain('scheduledDate ?')
    expect(timing).toContain('border-dashed')
  })

  it('edit-mode scope picker is unchanged', () => {
    expect(jobComposer).toContain('Apply changes to')
    expect(jobComposer).toContain('Entire series')
  })
})

describe('post-rebuild batch 1 — appointment customer resolution', () => {
  it('EventDetailsModal accepts a customerResolving prop', () => {
    expect(eventDetails).toContain('customerResolving?: boolean')
    expect(eventDetails).toContain('customerResolving = false')
  })

  it('renders a fixed-height skeleton while the customer is unresolved — never "No customer"', () => {
    const customer = slice(eventDetails, '{/* Customer */}', '{/* Related Job */}')
    expect(customer).toContain('customerResolving ? (')
    expect(customer).toContain('animate-pulse')
    expect(customer).toContain('aria-label="Loading customer"')
    // "No customer" placeholder only reachable via the picker when not resolving
    expect(customer).toContain('placeholder="No customer"')
  })

  it('calendar page clears stale lead immediately on event switch', () => {
    const effect = slice(calendarPage, '// Resolve job and customer', '// Close overflow menu')
    expect(effect).toContain('setSelectedEventLead(null)')
  })

  it('discards stale async lookups via cancellation guard', () => {
    const effect = slice(calendarPage, '// Resolve job and customer', '// Close overflow menu')
    expect(effect).toContain('let cancelled = false')
    expect(effect).toContain('if (cancelled) return')
    expect(effect).toContain('if (!cancelled) setSelectedEventLeadResolving(false)')
    expect(effect).toContain('return () => { cancelled = true }')
  })

  it('wires resolving state into EventDetailsModal', () => {
    expect(calendarPage).toContain('customerResolving={selectedEventLeadResolving}')
    expect(calendarPage).toContain('setSelectedEventLeadResolving')
  })
})

describe('post-rebuild batch 1 — Reminder Summary customer context', () => {
  it('renders customer context before notes (context-first ordering)', () => {
    const customerIdx = tasksTab.indexOf('>Customer</p>')
    const notesIdx = tasksTab.indexOf('>Notes</p>')
    expect(customerIdx).toBeGreaterThan(-1)
    expect(notesIdx).toBeGreaterThan(-1)
    expect(customerIdx).toBeLessThan(notesIdx)
  })

  it('shows name, phone and a View action in the summary customer row', () => {
    const summary = slice(tasksTab, 'title="Reminder Summary"', '</Modal>')
    expect(summary).toContain('caller_phone')
    expect(summary).toContain('tel:')
    expect(summary).toMatch(/>\s*View\s*<\/button>/)
    expect(summary).toContain('/dashboard/leads/')
  })

  it('summary values wrap without horizontal overflow', () => {
    const summary = slice(tasksTab, 'title="Reminder Summary"', '</Modal>')
    expect(summary).toContain('break-words')
    expect(summary).toContain('flex-wrap')
  })
})

describe('post-rebuild batch 1 — preserved behavior', () => {
  it('JobDetailsModal still PATCHes status and DELETEs via canonical routes', () => {
    expect(jobDetails).toContain('/api/jobs/${job.id}')
    expect(jobDetails).toContain("method: 'PATCH'")
    expect(jobDetails).toContain("method: 'DELETE'")
  })

  it('EventDetailsModal preserves customer picker, Meet link and manual Text Details', () => {
    expect(eventDetails).toContain('SearchableCustomerSelect')
    expect(eventDetails).toContain('handleCustomerSelect')
    expect(eventDetails).toMatch(/meet|Meet/)
    expect(eventDetails).toMatch(/[Tt]ext [Dd]etails|Text Details/)
  })

  it('modal back/scroll-lock ownership unchanged', () => {
    expect(jobDetails).toContain("useBodyScrollLock(isOpen, 'job-details-modal')")
    expect(jobDetails).toContain('useModalBackButton({ isOpen, onClose })')
    expect(newTask).toContain('useModalBackButton is owned by the shared <Modal>')
  })

  it('safe-area footer padding preserved on view surfaces', () => {
    expect(jobDetails).toContain('env(safe-area-inset-bottom)')
  })
})
