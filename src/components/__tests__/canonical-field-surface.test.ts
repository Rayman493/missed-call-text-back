import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const datePickerContent = readFileSync('src/components/ui/DatePicker.tsx', 'utf8')
const timePickerContent = readFileSync('src/components/ui/TimePicker.tsx', 'utf8')
const selectPickerContent = readFileSync('src/components/ui/SelectPicker.tsx', 'utf8')
const customerSelectContent = readFileSync('src/components/customers/SearchableCustomerSelect.tsx', 'utf8')
const newTaskModalContent = readFileSync('src/components/schedule/NewTaskModal.tsx', 'utf8')
const jobComposerContent = readFileSync('src/components/jobs/JobComposer.tsx', 'utf8')
const eventDetailsContent = readFileSync('src/components/calendar/EventDetailsModal.tsx', 'utf8')
const newAppointmentContent = readFileSync('src/components/calendar/NewAppointmentModal.tsx', 'utf8')

// Canonical editable-field surface tokens
const CANONICAL_DARK_BG = 'dark:bg-slate-900/55'
const CANONICAL_DARK_BORDER = 'dark:border-slate-700/60'
const CANONICAL_FOCUS_RING = 'focus:ring-blue-500/20'
const CANONICAL_FOCUS_BORDER = 'focus:border-blue-500/60'
const CANONICAL_LIGHT_BG = 'bg-muted/30'
const CANONICAL_LIGHT_BORDER = 'border-border/50'

// Old surfaces that should no longer appear in editable fields
const OLD_SHARED_PRIMITIVE = 'bg-background dark:bg-slate-900/40'
const OLD_LOCAL_INPUT = 'dark:bg-slate-800/60 border border-border/50 dark:border-border/40'
const OLD_APPOINTMENT = 'bg-background border border-border rounded-lg'

// ---------------------------------------------------------------------------
// 1. CANONICAL SURFACE PRESENT IN SHARED PRIMITIVES
// ---------------------------------------------------------------------------

describe('Canonical Field Surface — Shared Primitives', () => {
  it('DatePicker uses canonical dark background', () => {
    expect(datePickerContent).toContain(CANONICAL_DARK_BG)
  })

  it('DatePicker uses canonical dark border', () => {
    expect(datePickerContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('DatePicker uses canonical focus ring', () => {
    expect(datePickerContent).toContain(CANONICAL_FOCUS_RING)
  })

  it('DatePicker uses canonical focus border', () => {
    expect(datePickerContent).toContain(CANONICAL_FOCUS_BORDER)
  })

  it('DatePicker no longer uses old shared-primitive surface', () => {
    expect(datePickerContent).not.toContain(OLD_SHARED_PRIMITIVE)
  })

  it('TimePicker uses canonical dark background', () => {
    expect(timePickerContent).toContain(CANONICAL_DARK_BG)
  })

  it('TimePicker uses canonical dark border', () => {
    expect(timePickerContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('TimePicker uses canonical focus ring', () => {
    expect(timePickerContent).toContain(CANONICAL_FOCUS_RING)
  })

  it('TimePicker uses canonical focus border', () => {
    expect(timePickerContent).toContain(CANONICAL_FOCUS_BORDER)
  })

  it('TimePicker no longer uses old shared-primitive surface', () => {
    expect(timePickerContent).not.toContain(OLD_SHARED_PRIMITIVE)
  })

  it('SelectPicker uses canonical dark background (button state)', () => {
    expect(selectPickerContent).toContain(CANONICAL_DARK_BG)
  })

  it('SelectPicker uses canonical dark background (search state)', () => {
    // Search state is the focus-within div
    const searchBlock = selectPickerContent.substring(
      selectPickerContent.indexOf('focus-within:ring-blue-500/20'),
      selectPickerContent.indexOf('focus-within:ring-blue-500/20') - 200
    )
    expect(searchBlock).toContain(CANONICAL_DARK_BG)
  })

  it('SelectPicker uses canonical dark border', () => {
    expect(selectPickerContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('SelectPicker no longer uses old shared-primitive surface', () => {
    expect(selectPickerContent).not.toContain(OLD_SHARED_PRIMITIVE)
  })

  it('SearchableCustomerSelect uses canonical dark background (button)', () => {
    expect(customerSelectContent).toContain(CANONICAL_DARK_BG)
  })

  it('SearchableCustomerSelect uses canonical dark background (search)', () => {
    const searchBlock = customerSelectContent.substring(
      customerSelectContent.indexOf('focus-within:ring-blue-500/20'),
      customerSelectContent.indexOf('focus-within:ring-blue-500/20') - 200
    )
    expect(searchBlock).toContain(CANONICAL_DARK_BG)
  })

  it('SearchableCustomerSelect uses canonical dark border', () => {
    expect(customerSelectContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('SearchableCustomerSelect no longer uses old shared-primitive surface', () => {
    expect(customerSelectContent).not.toContain(OLD_SHARED_PRIMITIVE)
  })
})

// ---------------------------------------------------------------------------
// 2. CANONICAL SURFACE PRESENT IN MODAL LOCAL INPUTS
// ---------------------------------------------------------------------------

describe('Canonical Field Surface — Modal Local Inputs', () => {
  it('NewTaskModal title input uses canonical dark background', () => {
    expect(newTaskModalContent).toContain(CANONICAL_DARK_BG)
  })

  it('NewTaskModal title input uses canonical dark border', () => {
    expect(newTaskModalContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('NewTaskModal notes textarea uses canonical surface', () => {
    // Find the notes textarea by its placeholder
    const notesIdx = newTaskModalContent.indexOf('Add any details about this reminder')
    expect(notesIdx).toBeGreaterThan(-1)
    const notesBlock = newTaskModalContent.substring(notesIdx - 200, notesIdx + 300)
    expect(notesBlock).toContain(CANONICAL_DARK_BG)
    expect(notesBlock).toContain(CANONICAL_DARK_BORDER)
  })

  it('NewTaskModal no longer uses old local-input surface', () => {
    expect(newTaskModalContent).not.toContain(OLD_LOCAL_INPUT)
  })

  it('JobComposer title input uses canonical dark background', () => {
    expect(jobComposerContent).toContain(CANONICAL_DARK_BG)
  })

  it('JobComposer title input uses canonical dark border', () => {
    expect(jobComposerContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('JobComposer notes textarea uses canonical surface', () => {
    const notesBlock = jobComposerContent.substring(
      jobComposerContent.indexOf('max-h-40'),
      jobComposerContent.indexOf('max-h-40') + 300
    )
    expect(notesBlock).toContain(CANONICAL_DARK_BG)
    expect(notesBlock).toContain(CANONICAL_DARK_BORDER)
  })

  it('JobComposer no longer uses old local-input surface for editable fields', () => {
    // The preference card is read-only and may still use dark:bg-slate-800/60,
    // but editable inputs should not use the old surface
    const inputMatches = jobComposerContent.match(/bg-muted\/30 dark:bg-slate-800\/60 border border-border\/50 dark:border-border\/40 rounded-lg/g)
    expect(inputMatches).toBeNull()
  })

  it('EventDetailsModal editing inputs use canonical dark background', () => {
    expect(eventDetailsContent).toContain(CANONICAL_DARK_BG)
  })

  it('EventDetailsModal editing inputs use canonical dark border', () => {
    expect(eventDetailsContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('EventDetailsModal textareas use canonical surface', () => {
    // Description textarea and Meeting Notes textarea
    const textareaMatches = eventDetailsContent.match(/bg-muted\/30 dark:bg-slate-900\/55 border border-border\/50 dark:border-slate-700\/60 rounded-lg/g)
    expect(textareaMatches).not.toBeNull()
    expect(textareaMatches!.length).toBeGreaterThanOrEqual(2)
  })

  it('EventDetailsModal no longer uses old local-input surface for editable fields', () => {
    // The Related Job card is read-only and may still use dark:bg-slate-800/60,
    // but editable inputs should not use the old surface
    const editableOldMatches = eventDetailsContent.match(/bg-muted\/30 dark:bg-slate-800\/60 border border-border\/50 dark:border-border\/40 rounded/g)
    expect(editableOldMatches).toBeNull()
  })

  it('NewAppointmentModal title input uses canonical dark background', () => {
    expect(newAppointmentContent).toContain(CANONICAL_DARK_BG)
  })

  it('NewAppointmentModal title input uses canonical dark border', () => {
    expect(newAppointmentContent).toContain(CANONICAL_DARK_BORDER)
  })

  it('NewAppointmentModal location input uses canonical surface', () => {
    const locationBlock = newAppointmentContent.substring(
      newAppointmentContent.indexOf('Location (optional)'),
      newAppointmentContent.indexOf('Location (optional)') + 600
    )
    expect(locationBlock).toContain(CANONICAL_DARK_BG)
    expect(locationBlock).toContain(CANONICAL_DARK_BORDER)
  })

  it('NewAppointmentModal notes textarea uses canonical surface', () => {
    const notesBlock = newAppointmentContent.substring(
      newAppointmentContent.indexOf('Notes (optional)'),
      newAppointmentContent.indexOf('Notes (optional)') + 600
    )
    expect(notesBlock).toContain(CANONICAL_DARK_BG)
    expect(notesBlock).toContain(CANONICAL_DARK_BORDER)
  })

  it('NewAppointmentModal no longer uses old appointment surface (bg-background border-border)', () => {
    // Should not have the old bare bg-background border-border on text inputs/textareas
    expect(newAppointmentContent).not.toContain('bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50')
  })
})

// ---------------------------------------------------------------------------
// 3. NO OLD CONFLICTING SURFACES REMAIN
// ---------------------------------------------------------------------------

describe('Canonical Field Surface — No Old Surfaces Remain', () => {
  it('no shared primitive uses bg-background dark:bg-slate-900/40 for editable fields', () => {
    expect(datePickerContent).not.toContain(OLD_SHARED_PRIMITIVE)
    expect(timePickerContent).not.toContain(OLD_SHARED_PRIMITIVE)
    expect(selectPickerContent).not.toContain(OLD_SHARED_PRIMITIVE)
    expect(customerSelectContent).not.toContain(OLD_SHARED_PRIMITIVE)
  })

  it('no modal local input uses dark:bg-slate-800/60 for editable fields', () => {
    // Read-only cards may still use dark:bg-slate-800/60, but not with the
    // old editable-field border pattern
    const oldEditablePattern = /dark:bg-slate-800\/60 border border-border\/50 dark:border-border\/40 rounded-lg/
    expect(oldEditablePattern.test(newTaskModalContent)).toBe(false)
    expect(oldEditablePattern.test(jobComposerContent)).toBe(false)
    // EventDetailsModal: read-only card uses dark:bg-slate-800/60 but with
    // border-border/40 dark:border-border/30 (read-only pattern), not the editable pattern
    expect(oldEditablePattern.test(eventDetailsContent)).toBe(false)
  })

  it('NewAppointmentModal does not use bare bg-background for text inputs', () => {
    // Checkbox may still use bg-background, but text inputs/textareas should not
    const bareInputPattern = /bg-background border border-border rounded-lg text-sm text-foreground/
    expect(bareInputPattern.test(newAppointmentContent)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. READ-ONLY VS EDITABLE HIERARCHY MAINTAINED
// ---------------------------------------------------------------------------

describe('Canonical Field Surface — Read-Only vs Editable', () => {
  it('EventDetailsModal Related Job card uses lighter read-only surface', () => {
    // Read-only cards should use dark:bg-slate-800/60 (lighter than editable dark:bg-slate-900/55)
    const relatedJobBlock = eventDetailsContent.substring(
      eventDetailsContent.indexOf('Related Job'),
      eventDetailsContent.indexOf('Related Job') + 400
    )
    expect(relatedJobBlock).toContain('dark:bg-slate-800/60')
    // Should NOT have focus styling (it's not editable)
    expect(relatedJobBlock).not.toContain('focus:ring-blue-500/20')
  })

  it('JobTimer panel uses lighter read-only surface', () => {
    const jobTimerContent = readFileSync('src/components/jobs/JobTimer.tsx', 'utf8')
    expect(jobTimerContent).toContain('dark:bg-slate-800/60')
    // Should NOT have focus styling
    const panelBlock = jobTimerContent.substring(
      jobTimerContent.indexOf('Time Tracked'),
      jobTimerContent.indexOf('Time Tracked') + 200
    )
    expect(panelBlock).not.toContain('focus:ring-blue-500/20')
  })

  it('JobDetailsModal Payment card uses lighter read-only surface', () => {
    const jobDetailsContent = readFileSync('src/components/jobs/JobDetailsModal.tsx', 'utf8')
    expect(jobDetailsContent).toContain('dark:bg-slate-800/60')
    // Should NOT have focus styling
    const paymentBlock = jobDetailsContent.substring(
      jobDetailsContent.indexOf('Payment'),
      jobDetailsContent.indexOf('Payment') + 200
    )
    expect(paymentBlock).not.toContain('focus:ring-blue-500/20')
  })

  it('editable fields use darker surface than read-only cards', () => {
    // dark:bg-slate-900/55 (editable) should be darker than dark:bg-slate-800/60 (read-only)
    // This is verified by the fact that they use different surfaces
    expect(eventDetailsContent).toContain('dark:bg-slate-900/55') // editable
    expect(eventDetailsContent).toContain('dark:bg-slate-800/60')  // read-only card
  })
})

// ---------------------------------------------------------------------------
// 5. BEHAVIOR UNCHANGED
// ---------------------------------------------------------------------------

describe('Canonical Field Surface — Behavior Unchanged', () => {
  it('DatePicker still has type="date" and onChange', () => {
    expect(datePickerContent).toContain('type="date"')
    expect(datePickerContent).toContain('onChange={(e) => onChange(e.target.value)}')
  })

  it('TimePicker still has type="time" and onChange', () => {
    expect(timePickerContent).toContain('type="time"')
    expect(timePickerContent).toContain('onChange={(e) => onChange(e.target.value)}')
  })

  it('SelectPicker still has toggleOpen and handleSelect', () => {
    expect(selectPickerContent).toContain('toggleOpen')
    expect(selectPickerContent).toContain('handleSelect')
  })

  it('SearchableCustomerSelect still has fetchCustomers and handleSelect', () => {
    expect(customerSelectContent).toContain('fetchCustomers')
    expect(customerSelectContent).toContain('handleSelect')
  })

  it('NewTaskModal still has handleSubmit and handleDelete', () => {
    expect(newTaskModalContent).toContain('handleSubmit')
    expect(newTaskModalContent).toContain('handleDelete')
  })

  it('JobComposer still has form submission', () => {
    expect(jobComposerContent).toContain('handleSave')
  })

  it('NewAppointmentModal still has handleCreate and handleCancel', () => {
    expect(newAppointmentContent).toContain('handleCreate')
    expect(newAppointmentContent).toContain('handleCancel')
  })

  it('EventDetailsModal still has handleEditClick and handleDeleteClick', () => {
    expect(eventDetailsContent).toContain('handleEditClick')
    expect(eventDetailsContent).toContain('handleDeleteClick')
  })
})
