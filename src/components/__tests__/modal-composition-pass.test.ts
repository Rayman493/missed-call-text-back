import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const eventDetailsContent = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const pageContent = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const newTaskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const jobDetailsModalContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')
const modalShellContent = readFileSync('src/components/ui/Modal.tsx', 'utf8')
const globalsCssContent = readFileSync('src/app/globals.css', 'utf8')

// ---------------------------------------------------------------------------
// 1. MODAL SHELL VIEWPORT CONSTRAINTS
// ---------------------------------------------------------------------------

describe('Modal Composition — Viewport Constraints', () => {
  it('globals.css defines --modal-max-height for desktop with header breathing room', () => {
    // Desktop should reserve enough space for the app header (96px top + 32px bottom)
    const desktopBlock = globalsCssContent.substring(
      globalsCssContent.indexOf('@media (min-width: 768px)'),
      globalsCssContent.indexOf('@media (min-width: 768px)') + 200
    )
    expect(desktopBlock).toContain('--modal-max-height: calc(100dvh - 128px)')
  })

  it('globals.css defines --modal-max-height for mobile with safe areas', () => {
    // Find the modal-specific :root block (after the modal comment)
    const modalCommentIdx = globalsCssContent.indexOf('Modal bottom reservation')
    const modalRootBlock = globalsCssContent.substring(
      modalCommentIdx,
      modalCommentIdx + 600
    )
    expect(modalRootBlock).toContain('--modal-max-height: calc(100dvh - 32px)')
  })

  it('shared Modal shell uses --modal-max-height', () => {
    expect(modalShellContent).toContain('max-h-[var(--modal-max-height)]')
  })

  it('EventDetailsModal uses --modal-max-height (not md:max-h-[90vh] override)', () => {
    expect(eventDetailsContent).toContain('max-h-[var(--modal-max-height)]')
    expect(eventDetailsContent).not.toContain('md:max-h-[90vh]')
  })

  it('EventDetailsModal no longer has my-4 vertical margin (was causing collision)', () => {
    expect(eventDetailsContent).not.toContain('my-4 md:my-0')
  })

  it('shared Modal shell has richer shadow for dark mode', () => {
    expect(modalShellContent).toContain('dark:shadow-')
  })

  it('shared Modal header uses py-3.5 (compact)', () => {
    expect(modalShellContent).toContain('px-4 sm:px-5 py-3.5')
  })
})

// ---------------------------------------------------------------------------
// 2. EVENT DETAILS VERTICAL RHYTHM
// ---------------------------------------------------------------------------

describe('Modal Composition — EventDetailsModal Compactness', () => {
  it('body uses py-4 (was py-5)', () => {
    expect(eventDetailsContent).toContain('px-5 py-4 min-w-0')
  })

  it('main section spacing uses space-y-3.5 (was space-y-4 md:space-y-5)', () => {
    expect(eventDetailsContent).toContain('space-y-3.5')
    expect(eventDetailsContent).not.toContain('space-y-4 md:space-y-5')
  })

  it('header uses py-3.5 (was py-4)', () => {
    expect(eventDetailsContent).toContain('px-5 py-3.5 border-b border-border/60')
  })

  it('section dividers use border-border/40 (lighter)', () => {
    expect(eventDetailsContent).toContain('border-t border-border/40')
  })

  it('AI Summary section uses pt-3 (was pt-4 md:pt-5)', () => {
    expect(eventDetailsContent).toContain('pt-3 border-t border-border/40')
    expect(eventDetailsContent).not.toContain('pt-4 md:pt-5 border-t')
  })
})

// ---------------------------------------------------------------------------
// 3. DESCRIPTION / GOOGLE CALENDAR NOTES DEDUPLICATION
// ---------------------------------------------------------------------------

describe('Modal Composition — Description Deduplication', () => {
  it('renders only ONE description section (not two)', () => {
    // Count occurrences of renderDescription(normalizeDisplayText(event.description))
    const matches = eventDetailsContent.match(/renderDescription\(normalizeDisplayText\(event\.description\)\)/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBe(1)
  })

  it('uses "Google Calendar Notes" label when read-only', () => {
    expect(eventDetailsContent).toContain("{isEditing ? 'Description' : 'Google Calendar Notes'}")
  })

  it('no longer has a separate Google Calendar Notes section', () => {
    // The old separate section had its own label "Google Calendar Notes" as a standalone block
    const oldSectionPattern = /Google Calendar Notes<\/label>\s*<div className="space-y-2">\s*{renderDescription/
    expect(oldSectionPattern.test(eventDetailsContent)).toBe(false)
  })

  it('preserves normalizeDisplayText for content normalization', () => {
    expect(eventDetailsContent).toContain('normalizeDisplayText(event.description)')
  })
})

// ---------------------------------------------------------------------------
// 4. MODAL SURFACE COLOR STANDARDIZATION
// ---------------------------------------------------------------------------

describe('Modal Composition — Surface Hierarchy', () => {
  it('EventDetailsModal editable inputs use canonical surface (dark:bg-slate-900/55)', () => {
    expect(eventDetailsContent).toContain('bg-muted/30 dark:bg-slate-900/55')
  })

  it('EventDetailsModal read-only Related Job card uses lighter surface (dark:bg-slate-800/60)', () => {
    expect(eventDetailsContent).toContain('bg-muted/30 dark:bg-slate-800/60')
  })

  it('EventDetailsModal no longer uses bg-background for textareas', () => {
    expect(eventDetailsContent).not.toContain('bg-background border border-border rounded-lg text-sm text-foreground')
  })

  it('EventDetailsModal editing inputs no longer use bg-slate-800 hardcoded', () => {
    expect(eventDetailsContent).not.toContain('bg-slate-800 border border-slate-700 rounded text-sm text-white')
  })

  it('NewTaskModal inputs use canonical editable surface (bg-muted/30 dark:bg-slate-900/55)', () => {
    expect(newTaskModalContent).toContain('bg-muted/30 dark:bg-slate-900/55')
  })

  it('NewTaskModal no longer uses bg-background for inputs', () => {
    expect(newTaskModalContent).not.toContain('bg-background border border-border rounded-lg')
  })

  it('JobComposer editable inputs use canonical surface (dark:bg-slate-900/55)', () => {
    expect(jobComposerContent).toContain('bg-muted/30 dark:bg-slate-900/55')
  })

  it('JobComposer read-only preference card uses lighter surface (dark:bg-slate-800/60)', () => {
    expect(jobComposerContent).toContain('bg-muted/30 dark:bg-slate-800/60')
  })

  it('JobComposer no longer uses bg-background for inputs', () => {
    expect(jobComposerContent).not.toContain('bg-background border border-border rounded-lg')
  })

  it('JobDetailsModal Payment card uses bg-muted/30 dark:bg-slate-800/60', () => {
    expect(jobDetailsModalContent).toContain('bg-muted/30 dark:bg-slate-800/60')
  })

  it('JobDetailsModal no longer uses bg-slate-50 for Payment card', () => {
    expect(jobDetailsModalContent).not.toContain('bg-slate-50 dark:bg-slate-800/50 border border-slate-100')
  })

  it('JobTimer panel uses bg-muted/30 dark:bg-slate-800/60', () => {
    expect(jobTimerContent).toContain('bg-muted/30 dark:bg-slate-800/60')
  })

  it('JobTimer no longer uses bg-slate-50 for panel', () => {
    expect(jobTimerContent).not.toContain('bg-slate-50 dark:bg-slate-800/50 border border-slate-100')
  })

  it('JobComposer preference card uses bg-muted/30', () => {
    expect(jobComposerContent).toContain('bg-muted/30 dark:bg-slate-800/60 rounded-lg border border-border/40')
  })
})

// ---------------------------------------------------------------------------
// 5. APPOINTMENT ROW ACTION HIERARCHY
// ---------------------------------------------------------------------------

describe('Modal Composition — Appointment Row Actions', () => {
  // Extract the appointment row render block (the actual appointment card, not the empty state)
  const rowStart = pageContent.indexOf('rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 hover:shadow-sm transition-all cursor-pointer')
  const appointmentRowBlock = rowStart >= 0 ? pageContent.substring(rowStart, rowStart + 5000) : ''

  it('appointment row is clickable (role=button, tabIndex=0)', () => {
    expect(appointmentRowBlock).toContain('role="button"')
    expect(appointmentRowBlock).toContain('tabIndex={0}')
  })

  it('appointment row has keyboard handler (Enter/Space)', () => {
    expect(appointmentRowBlock).toContain("e.key === 'Enter'")
    expect(appointmentRowBlock).toContain("e.key === ' '")
  })

  it('Join is positioned in the right column (flex-col items-end)', () => {
    expect(appointmentRowBlock).toContain('flex flex-col items-end gap-1.5 flex-shrink-0')
  })

  it('Join link stops propagation (does not trigger row click)', () => {
    expect(appointmentRowBlock).toContain('onClick={(e) => e.stopPropagation()}')
  })

  it('Join uses rounded-lg with shadow-sm (premium)', () => {
    expect(appointmentRowBlock).toContain('rounded-lg bg-blue-600 text-white hover:bg-blue-700')
    expect(appointmentRowBlock).toContain('shadow-sm')
  })

  it('redundant View text button is removed', () => {
    expect(appointmentRowBlock).not.toContain("'>View</button>")
  })

  it('redundant Customer text button is removed from row', () => {
    // The old "Customer" text button should not be in the appointment row
    expect(appointmentRowBlock).not.toContain("'>Customer</button>")
  })

  it('badges use rounded-full with space (not rounded-fullbg- broken class)', () => {
    expect(appointmentRowBlock).toContain('rounded-full bg-blue-100')
    expect(appointmentRowBlock).not.toContain('rounded-fullbg-blue-100')
    expect(appointmentRowBlock).not.toContain('rounded-fullbg-slate-100')
    expect(appointmentRowBlock).not.toContain('rounded-fullbg-purple-100')
    expect(appointmentRowBlock).not.toContain('rounded-fullbg-green-100')
    expect(appointmentRowBlock).not.toContain('rounded-fullbg-amber-100')
  })
})

// ---------------------------------------------------------------------------
// 6. EVENT DETAILS FOOTER ACTION HIERARCHY
// ---------------------------------------------------------------------------

describe('Modal Composition — Footer Hierarchy', () => {
  // Extract the footer block (non-editing, non-add-location)
  const footerStart = eventDetailsContent.indexOf('{/* Footer */}')
  const footerBlock = footerStart >= 0 ? eventDetailsContent.substring(footerStart, footerStart + 8000) : ''

  it('Join is primary with ml-auto (far right)', () => {
    expect(footerBlock).toContain('ml-auto h-9 px-4 text-sm font-medium bg-blue-600')
  })

  it('Join has shadow-sm (premium primary)', () => {
    expect(footerBlock).toContain('shadow-sm')
  })

  it('Google Calendar is secondary (h-9, bg-muted)', () => {
    expect(footerBlock).toContain('h-9 px-3 text-xs font-medium bg-muted hover:bg-muted/80')
  })

  it('Text Details is secondary with emerald', () => {
    expect(footerBlock).toContain('h-9 px-3 text-xs font-medium bg-emerald-600')
  })

  it('Edit is secondary (h-9, border only)', () => {
    expect(footerBlock).toContain('h-9 px-3 text-xs font-medium text-foreground hover:bg-muted/50 border border-border/50')
  })

  it('Delete is restrained icon-only (w-9 h-9)', () => {
    expect(footerBlock).toContain('h-9 w-9 px-0 text-red-600')
    expect(footerBlock).toContain('aria-label="Delete appointment"')
  })

  it('footer uses flex-wrap items-center (not flex-col)', () => {
    expect(footerBlock).toContain('flex flex-wrap items-center gap-2')
  })

  it('no longer has five equal-width flex-1 buttons', () => {
    // The old layout had flex-1 min-w-[120px] on all buttons
    expect(footerBlock).not.toContain('flex-1 min-w-[120px] h-10')
  })

  it('when no Join, Edit becomes primary far right', () => {
    expect(footerBlock).toContain('!event.meetingUrl && !event.isHoliday && isReplyFlowOwned && !isJobEvent')
  })
})

// ---------------------------------------------------------------------------
// 7. CUSTOMER FIELD POLISH
// ---------------------------------------------------------------------------

describe('Modal Composition — Customer Field', () => {
  it('Customer field uses subtle external-link icon (not chunky View button)', () => {
    expect(eventDetailsContent).toContain('h-10 w-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-blue-600')
  })

  it('Customer field has aria-label for accessibility', () => {
    expect(eventDetailsContent).toContain('aria-label="Open customer details"')
  })

  it('Customer field no longer has chunky View button', () => {
    // The old button had "View" text and h-10 px-3
    const customerBlock = eventDetailsContent.substring(
      eventDetailsContent.indexOf('{/* Customer */}'),
      eventDetailsContent.indexOf('{/* Customer */}') + 600
    )
    expect(customerBlock).not.toContain("'>View</button>")
  })
})

// ---------------------------------------------------------------------------
// 8. AI SUMMARY COMPACTNESS
// ---------------------------------------------------------------------------

describe('Modal Composition — AI Summary Compactness', () => {
  it('collapsed state does not show overview preview', () => {
    // The old code showed aiSummaryStructured?.overview || aiSummary when collapsed
    expect(eventDetailsContent).not.toContain('!isTranscriptOpen && (aiSummaryStructured?.overview || aiSummary)')
  })

  it('collapsed state is just the disclosure row', () => {
    const aiSummaryBlock = eventDetailsContent.substring(
      eventDetailsContent.indexOf('AI Summary'),
      eventDetailsContent.indexOf('AI Summary') + 300
    )
    // Should have the button with chevron, then immediately the expanded conditional
    expect(aiSummaryBlock).toContain('ChevronDown')
    expect(aiSummaryBlock).toContain('ChevronUp')
  })

  it('transcript has bounded max-h-48 with internal scroll', () => {
    expect(eventDetailsContent).toContain('max-h-48 overflow-y-auto')
  })

  it('transcript uses muted surface (not dark debug style)', () => {
    expect(eventDetailsContent).toContain('bg-muted/40 dark:bg-slate-800/40')
  })
})

// ---------------------------------------------------------------------------
// 9. REMINDER MODAL COMPACTNESS
// ---------------------------------------------------------------------------

describe('Modal Composition — Reminder Modal', () => {
  it('section spacing uses space-y-4 (compact, was space-y-5)', () => {
    expect(newTaskModalContent).toContain('space-y-4')
    expect(newTaskModalContent).not.toContain('space-y-5')
    expect(newTaskModalContent).not.toContain('space-y-6')
  })

  it('section headers use text-[11px] (was text-xs)', () => {
    expect(newTaskModalContent).toContain('text-[11px] font-semibold text-muted-foreground uppercase tracking-wider')
  })

  it('section dividers use border-border/40 (was border-border/50)', () => {
    expect(newTaskModalContent).toContain('border-b border-border/40')
  })

  it('Mark Complete is compact with CheckSquare icon', () => {
    expect(newTaskModalContent).toContain('CheckSquare')
    expect(newTaskModalContent).toContain('Mark Complete')
  })

  it('Mark Complete is flex-1 (shares row with Delete)', () => {
    expect(newTaskModalContent).toContain('flex-1 px-3 py-2 border border-border/50 rounded-lg text-xs font-medium')
  })

  it('Delete is compact (not full-width)', () => {
    expect(newTaskModalContent).not.toContain('w-full px-4 py-2.5 border border-red-200')
  })

  it('Delete has aria-label', () => {
    expect(newTaskModalContent).toContain('aria-label="Delete task"')
  })

  it('edit actions are in a flex row (not stacked)', () => {
    expect(newTaskModalContent).toContain('pt-3 border-t border-border/40 flex items-center gap-2')
  })
})

// ---------------------------------------------------------------------------
// 10. NO BEHAVIORAL CHANGES
// ---------------------------------------------------------------------------

describe('Modal Composition — No Behavioral Changes', () => {
  it('EventDetailsModal still calls onRefresh for data refresh', () => {
    expect(eventDetailsContent).toContain('onRefresh?.()')
  })

  it('EventDetailsModal still calls onShowToast for per-action success', () => {
    expect(eventDetailsContent).toContain("onShowToast?.('Customer updated successfully'")
    expect(eventDetailsContent).toContain("onShowToast?.('Customer removed successfully'")
  })

  it('EventDetailsModal still has handleEditClick and handleDeleteClick', () => {
    expect(eventDetailsContent).toContain('handleEditClick')
    expect(eventDetailsContent).toContain('handleDeleteClick')
  })

  it('EventDetailsModal still has openMeetingLink for Join', () => {
    expect(eventDetailsContent).toContain('openMeetingLink')
  })

  it('EventDetailsModal still has openGoogleCalendar', () => {
    expect(eventDetailsContent).toContain('openGoogleCalendar')
  })

  it('EventDetailsModal still has saveNotes', () => {
    expect(eventDetailsContent).toContain('saveNotes')
  })

  it('EventDetailsModal still has markComplete', () => {
    expect(eventDetailsContent).toContain('markComplete')
  })

  it('EventDetailsModal still has transcript loading', () => {
    expect(eventDetailsContent).toContain('transcriptLoading')
  })

  it('EventDetailsModal still has transcript error handling', () => {
    expect(eventDetailsContent).toContain('transcriptError')
  })

  it('appointment row still calls onOpenEvent', () => {
    expect(pageContent).toContain('onOpenEvent(ev)')
  })

  it('appointment row still calls onViewCustomer (preserved in EventDetailsModal)', () => {
    expect(eventDetailsContent).toContain('onViewCustomer')
  })

  it('JobTimer still has handleStart and handleStop', () => {
    expect(jobTimerContent).toContain('handleStart')
    expect(jobTimerContent).toContain('handleStop')
  })

  it('NewTaskModal still has handleSubmit and handleDelete', () => {
    expect(newTaskModalContent).toContain('handleSubmit')
    expect(newTaskModalContent).toContain('handleDelete')
  })

  it('NewTaskModal still has handleToggleComplete', () => {
    expect(newTaskModalContent).toContain('handleToggleComplete')
  })

  it('Schedule tabs still horizontally scrollable', () => {
    expect(pageContent).toContain('overflow-x-auto')
  })
})
