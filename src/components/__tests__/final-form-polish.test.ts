import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const newTaskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const newAppointmentContent = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')

// ---------------------------------------------------------------------------
// 1. NEW REMINDER COMPACTNESS
// ---------------------------------------------------------------------------

describe('Final Form Polish — New Reminder Compactness', () => {
  it('uses space-y-4 for outer body spacing (not space-y-5)', () => {
    expect(newTaskModalContent).toContain('className="space-y-4"')
  })

  it('uses space-y-4 for form spacing (not space-y-5)', () => {
    expect(newTaskModalContent).toContain('<form onSubmit={handleSubmit} className="space-y-4">')
  })

  it('Notes textarea uses rows={2} for compact default', () => {
    const notesIdx = newTaskModalContent.indexOf('Add any details about this reminder')
    const notesBlock = newTaskModalContent.substring(notesIdx, notesIdx + 300)
    expect(notesBlock).toContain('rows={2}')
  })

  it('preserves resize-y on Notes textarea', () => {
    expect(newTaskModalContent).toContain('resize-y')
  })
})

// ---------------------------------------------------------------------------
// 2. NEW JOB STATUS GROUP
// ---------------------------------------------------------------------------

describe('Final Form Polish — New Job Status Group', () => {
  it('unselected status buttons use canonical field surface (not bg-background)', () => {
    const statusBlock = jobComposerContent.substring(
      jobComposerContent.indexOf('STATUS_OPTIONS.map'),
      jobComposerContent.indexOf('STATUS_OPTIONS.map') + 600
    )
    expect(statusBlock).toContain('bg-muted/30 dark:bg-slate-900/55')
    expect(statusBlock).not.toContain('bg-background text-foreground border-border hover:border-border/80')
  })

  it('selected status button remains primary with shadow-sm', () => {
    const statusBlock = jobComposerContent.substring(
      jobComposerContent.indexOf('STATUS_OPTIONS.map'),
      jobComposerContent.indexOf('STATUS_OPTIONS.map') + 600
    )
    expect(statusBlock).toContain('bg-primary text-primary-foreground border-primary shadow-sm')
  })

  it('status buttons preserve focus ring', () => {
    const statusBlock = jobComposerContent.substring(
      jobComposerContent.indexOf('STATUS_OPTIONS.map'),
      jobComposerContent.indexOf('STATUS_OPTIONS.map') + 600
    )
    expect(statusBlock).toContain('focus-visible:ring-2 focus-visible:ring-primary/50')
  })
})

// ---------------------------------------------------------------------------
// 3. NEW APPOINTMENT SPACING NORMALIZATION
// ---------------------------------------------------------------------------

describe('Final Form Polish — New Appointment Spacing', () => {
  it('uses space-y-5 for outer body (not space-y-6)', () => {
    expect(newAppointmentContent).toContain('className="space-y-5"')
  })

  it('uses space-y-3 for inner sections (not space-y-4)', () => {
    // All three sections should use space-y-3
    const matches = newAppointmentContent.match(/space-y-3/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(3)
  })

  it('intro copy uses mb-4 (not mb-6)', () => {
    expect(newAppointmentContent).toContain('mb-4">Add something to your calendar')
  })

  it('section headings use text-[11px] (not text-xs)', () => {
    expect(newAppointmentContent).toContain('text-[11px] font-semibold text-muted-foreground uppercase tracking-wider')
  })

  it('section headings use border-border/40 (not border-border/50)', () => {
    expect(newAppointmentContent).toContain('pb-1.5 border-b border-border/40')
  })

  it('does not use old text-foreground/70 section heading style', () => {
    expect(newAppointmentContent).not.toContain('text-xs font-semibold text-foreground/70 uppercase tracking-wider')
  })
})

// ---------------------------------------------------------------------------
// 4. SECTION HEADING CONSISTENCY
// ---------------------------------------------------------------------------

describe('Final Form Polish — Section Heading Consistency', () => {
  it('NewTaskModal uses text-[11px] muted-foreground headings', () => {
    expect(newTaskModalContent).toContain('text-[11px] font-semibold text-muted-foreground uppercase tracking-wider')
  })

  it('NewAppointmentModal uses text-[11px] muted-foreground headings', () => {
    expect(newAppointmentContent).toContain('text-[11px] font-semibold text-muted-foreground uppercase tracking-wider')
  })

  it('both modals use pb-1.5 border-b border-border/40', () => {
    expect(newTaskModalContent).toContain('pb-1.5 border-b border-border/40')
    expect(newAppointmentContent).toContain('pb-1.5 border-b border-border/40')
  })
})

// ---------------------------------------------------------------------------
// 5. FOOTER CONSISTENCY
// ---------------------------------------------------------------------------

describe('Final Form Polish — Footer Consistency', () => {
  it('NewAppointmentModal footer uses gap-2 (not gap-3)', () => {
    expect(newAppointmentContent).toContain('flex flex-wrap gap-2 min-w-0')
    expect(newAppointmentContent).not.toContain('flex flex-wrap gap-3 min-w-0')
  })

  it('all three modals use px-4 py-2.5 for footer buttons', () => {
    expect(newTaskModalContent).toContain('px-4 py-2.5 text-sm font-medium')
    expect(jobComposerContent).toContain('px-4 py-2.5 text-sm font-medium')
    expect(newAppointmentContent).toContain('px-4 py-2.5 text-sm font-medium')
  })

  it('all three modals use rounded-lg for footer buttons', () => {
    expect(newTaskModalContent).toContain('rounded-lg transition-all duration-200')
    expect(jobComposerContent).toContain('rounded-lg transition-all duration-200')
    expect(newAppointmentContent).toContain('rounded-lg transition-all duration-200')
  })
})

// ---------------------------------------------------------------------------
// 6. DISABLED PRIMARY TREATMENT
// ---------------------------------------------------------------------------

describe('Final Form Polish — Disabled Primary Treatment', () => {
  it('NewTaskModal primary uses disabled:opacity-60 (not 50)', () => {
    expect(newTaskModalContent).toContain('disabled:opacity-60')
    // Should not have the old disabled:opacity-50 on primary
    const primaryBlock = newTaskModalContent.substring(
      newTaskModalContent.indexOf('onClick={handleSubmit}'),
      newTaskModalContent.indexOf('onClick={handleSubmit}') + 300
    )
    expect(primaryBlock).not.toContain('disabled:opacity-50')
  })

  it('NewTaskModal primary prevents hover when disabled', () => {
    expect(newTaskModalContent).toContain('disabled:hover:bg-primary')
  })

  it('NewTaskModal primary prevents active scale when disabled', () => {
    expect(newTaskModalContent).toContain('disabled:active:scale-100')
  })

  it('JobComposer primary uses disabled:opacity-60 (not 50)', () => {
    expect(jobComposerContent).toContain('disabled:opacity-60')
    const primaryBlock = jobComposerContent.substring(
      jobComposerContent.indexOf('onClick={handleSave}'),
      jobComposerContent.indexOf('onClick={handleSave}') + 300
    )
    expect(primaryBlock).not.toContain('disabled:opacity-50')
  })

  it('JobComposer primary prevents hover when disabled', () => {
    expect(jobComposerContent).toContain('disabled:hover:bg-primary')
  })

  it('NewAppointmentModal primary uses disabled:opacity-60 (not 50)', () => {
    expect(newAppointmentContent).toContain('disabled:opacity-60')
    const primaryBlock = newAppointmentContent.substring(
      newAppointmentContent.indexOf('onClick={handleCreate}'),
      newAppointmentContent.indexOf('onClick={handleCreate}') + 300
    )
    expect(primaryBlock).not.toContain('disabled:opacity-50')
  })

  it('NewAppointmentModal primary prevents hover when disabled', () => {
    expect(newAppointmentContent).toContain('disabled:hover:bg-primary')
  })

  it('NewAppointmentModal primary prevents active scale when disabled', () => {
    expect(newAppointmentContent).toContain('disabled:active:scale-100')
  })
})

// ---------------------------------------------------------------------------
// 7. BUTTON NORMALIZATION
// ---------------------------------------------------------------------------

describe('Final Form Polish — Button Normalization', () => {
  it('all primary buttons use bg-primary hover:bg-primary/90', () => {
    expect(newTaskModalContent).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
    expect(jobComposerContent).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
    expect(newAppointmentContent).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
  })

  it('all Cancel buttons use bg-muted hover:bg-muted/80', () => {
    expect(newTaskModalContent).toContain('bg-muted hover:bg-muted/80 text-foreground')
    expect(jobComposerContent).toContain('bg-muted hover:bg-muted/80 text-foreground')
    expect(newAppointmentContent).toContain('bg-muted hover:bg-muted/80 text-foreground')
  })

  it('all primary buttons use w-4 h-4 icons with gap-2', () => {
    expect(newTaskModalContent).toContain('w-4 h-4')
    expect(jobComposerContent).toContain('w-4 h-4')
    expect(newAppointmentContent).toContain('w-4 h-4')
  })
})

// ---------------------------------------------------------------------------
// 8. FIELD SURFACE SYSTEM UNCHANGED
// ---------------------------------------------------------------------------

describe('Final Form Polish — Field Surface Preserved', () => {
  it('NewTaskModal still uses canonical editable surface', () => {
    expect(newTaskModalContent).toContain('bg-muted/30 dark:bg-slate-900/55')
    expect(newTaskModalContent).toContain('dark:border-slate-700/60')
  })

  it('JobComposer still uses canonical editable surface', () => {
    expect(jobComposerContent).toContain('bg-muted/30 dark:bg-slate-900/55')
    expect(jobComposerContent).toContain('dark:border-slate-700/60')
  })

  it('NewAppointmentModal still uses canonical editable surface', () => {
    expect(newAppointmentContent).toContain('bg-muted/30 dark:bg-slate-900/55')
    expect(newAppointmentContent).toContain('dark:border-slate-700/60')
  })
})

// ---------------------------------------------------------------------------
// 9. BEHAVIOR UNCHANGED
// ---------------------------------------------------------------------------

describe('Final Form Polish — Behavior Unchanged', () => {
  it('NewTaskModal still has handleSubmit and handleDelete', () => {
    expect(newTaskModalContent).toContain('handleSubmit')
    expect(newTaskModalContent).toContain('handleDelete')
  })

  it('JobComposer still has handleSave', () => {
    expect(jobComposerContent).toContain('handleSave')
  })

  it('NewAppointmentModal still has handleCreate and handleCancel', () => {
    expect(newAppointmentContent).toContain('handleCreate')
    expect(newAppointmentContent).toContain('handleCancel')
  })

  it('NewTaskModal still has handleToggleComplete', () => {
    expect(newTaskModalContent).toContain('handleToggleComplete')
  })

  it('JobComposer STATUS_OPTIONS still maps correctly', () => {
    expect(jobComposerContent).toContain('STATUS_OPTIONS.map')
    expect(jobComposerContent).toContain('setStatus(opt.value)')
  })
})
