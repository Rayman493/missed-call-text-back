import { describe, it, expect } from 'vitest'

/**
 * Regression tests for Batch 3 — Premium Mobile Modal System Rebuild
 *
 * Canonical contract:
 * - All form modals use the shared Modal component from @/components/ui/Modal
 * - Field surfaces share canonical geometry (px-3 py-2.5, bg-muted/30, border-border/50, rounded-lg, text-sm)
 * - Labels share canonical typography (text-xs text-muted-foreground font-medium mb-1.5)
 * - Right-side affordances share canonical slot (right-3, top-1/2, -translate-y-1/2)
 * - Date/time inputs use deterministic pr-[44px] (not conditional pr-12/pr-20)
 * - Native picker indicator constrained to 44px slot (not full input overlay)
 * - Footer buttons share canonical geometry (px-4 py-2.5 text-sm font-medium)
 * - Request Payment Amount does not autoFocus
 */

const fs = require('fs')

function readContent(path: string): string {
  return fs.readFileSync(path, 'utf8')
}

describe('Batch 3 — Canonical Modal Shell', () => {
  it('all target modals import the shared Modal component', () => {
    const modals = [
      'src/components/schedule/NewTaskModal.tsx',
      'src/components/jobs/JobComposer.tsx',
      'src/components/calendar/NewAppointmentModal.tsx',
      'src/components/AddCustomerModal.tsx',
      'src/components/EditCustomerModal.tsx',
      'src/components/payments/RequestPaymentModal.tsx',
    ]
    for (const path of modals) {
      const content = readContent(path)
      expect(content).toContain("import Modal from '@/components/ui/Modal'")
    }
  })

  it('shared Modal provides canonical close X geometry', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    expect(content).toContain('h-8 w-8')
    expect(content).toContain('aria-label="Close"')
    expect(content).toContain('w-5 h-5 stroke-[1.5]')
  })

  it('shared Modal provides canonical header padding', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    expect(content).toContain('px-4 sm:px-5 py-3.5')
  })

  it('shared Modal provides canonical footer with safe-area', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    expect(content).toContain('border-t border-border')
    expect(content).toContain('env(safe-area-inset-bottom)')
  })
})

describe('Batch 3 — Canonical Field Geometry', () => {
  const canonicalFieldClass = 'px-3 py-2.5 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60'

  it('NewTaskModal title input uses canonical field class', () => {
    const content = readContent('src/components/schedule/NewTaskModal.tsx')
    expect(content).toContain(canonicalFieldClass)
  })

  it('JobComposer inputs use canonical field class', () => {
    const content = readContent('src/components/jobs/JobComposer.tsx')
    expect(content).toContain(canonicalFieldClass)
    // Should NOT have the old px-4 py-2.5 sm:px-3 sm:py-2 pattern
    expect(content).not.toContain('px-4 py-2.5 sm:px-3 sm:py-2 bg-muted/30')
  })

  it('NewAppointmentModal inputs use canonical field class', () => {
    const content = readContent('src/components/calendar/NewAppointmentModal.tsx')
    expect(content).toContain(canonicalFieldClass)
  })

  it('AddCustomerModal inputs use canonical field class', () => {
    const content = readContent('src/components/AddCustomerModal.tsx')
    expect(content).toContain(canonicalFieldClass)
    // Should NOT have the old bg-background border-border pattern
    expect(content).not.toContain('px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg')
  })

  it('EditCustomerModal inputs use canonical field class', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    expect(content).toContain(canonicalFieldClass)
    // Should NOT have the old premium-input pattern
    expect(content).not.toContain('premium-input w-full px-3 py-2.5 rounded-lg focus:outline-none')
  })

  it('RequestPaymentModal inputs use canonical field class', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).toContain(canonicalFieldClass)
  })
})

describe('Batch 3 — Canonical Label System', () => {
  const canonicalLabelClass = 'text-xs text-muted-foreground font-medium mb-1.5'

  it('NewTaskModal labels use canonical label class', () => {
    const content = readContent('src/components/schedule/NewTaskModal.tsx')
    expect(content).toContain(canonicalLabelClass)
  })

  it('JobComposer labels use canonical label class', () => {
    const content = readContent('src/components/jobs/JobComposer.tsx')
    expect(content).toContain(canonicalLabelClass)
  })

  it('NewAppointmentModal labels use canonical label class', () => {
    const content = readContent('src/components/calendar/NewAppointmentModal.tsx')
    expect(content).toContain(canonicalLabelClass)
  })

  it('AddCustomerModal labels use canonical label class', () => {
    const content = readContent('src/components/AddCustomerModal.tsx')
    expect(content).toContain(canonicalLabelClass)
  })

  it('EditCustomerModal labels use canonical text-xs (not text-sm)', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    expect(content).toContain('text-xs text-muted-foreground font-medium')
    // Should NOT have the old text-sm font-medium text-foreground label pattern
    expect(content).not.toContain('block text-sm font-medium text-foreground mb-1.5')
  })

  it('RequestPaymentModal labels use canonical label class', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).toContain(canonicalLabelClass)
  })
})

describe('Batch 3 — Right-Side Affordance Slot', () => {
  const canonicalAffordanceSlot = 'right-3 top-1/2 -translate-y-1/2'

  it('DatePicker right affordance uses canonical slot', () => {
    const content = readContent('src/components/ui/DatePicker.tsx')
    expect(content).toContain(canonicalAffordanceSlot)
  })

  it('TimePicker right affordance uses canonical slot', () => {
    const content = readContent('src/components/ui/TimePicker.tsx')
    expect(content).toContain(canonicalAffordanceSlot)
  })

  it('SelectPicker right affordance uses canonical slot', () => {
    const content = readContent('src/components/ui/SelectPicker.tsx')
    expect(content).toContain(canonicalAffordanceSlot)
    // Should NOT have the old right-2 positioning
    expect(content).not.toContain('right-2 top-1/2')
  })

  it('SearchableCustomerSelect right affordance uses canonical slot', () => {
    const content = readContent('src/components/customers/SearchableCustomerSelect.tsx')
    expect(content).toContain(canonicalAffordanceSlot)
    // Should NOT have the old right-2 positioning
    expect(content).not.toContain('right-2 top-1/2')
  })

  it('DatePicker uses deterministic pr-[44px] (not conditional pr-12/pr-20)', () => {
    const content = readContent('src/components/ui/DatePicker.tsx')
    expect(content).toContain('pr-[44px]')
    // Should NOT have conditional padding
    expect(content).not.toContain("'pr-20'")
    expect(content).not.toContain("'pr-12'")
  })

  it('TimePicker uses deterministic pr-[44px] (not conditional pr-12/pr-20)', () => {
    const content = readContent('src/components/ui/TimePicker.tsx')
    expect(content).toContain('pr-[44px]')
    expect(content).not.toContain("'pr-20'")
    expect(content).not.toContain("'pr-12'")
  })

  it('SelectPicker uses deterministic pr-[44px] (not conditional pr-10/pr-14)', () => {
    const content = readContent('src/components/ui/SelectPicker.tsx')
    expect(content).toContain('pr-[44px]')
    // Should NOT have conditional padding
    expect(content).not.toContain("'pr-14'")
    expect(content).not.toContain("'pr-10'")
  })

  it('SearchableCustomerSelect uses deterministic pr-[44px] (not conditional pr-10/pr-14)', () => {
    const content = readContent('src/components/customers/SearchableCustomerSelect.tsx')
    expect(content).toContain('pr-[44px]')
    expect(content).not.toContain("'pr-14'")
    expect(content).not.toContain("'pr-10'")
  })
})

describe('Batch 3 — Date/Time Clipping Root Cause Fix', () => {
  it('hide-native-picker constrains indicator to 44px slot (not full input overlay)', () => {
    const content = readContent('src/app/globals.css')
    // The indicator should be constrained, not covering the full input
    expect(content).toContain('width: 44px')
    expect(content).toContain('height: 44px')
    // Should NOT have the old full-overlay approach
    expect(content).not.toContain('width: 100%;\n  height: 100%;')
  })

  it('hide-native-picker uses vertical centering (top: 50%, translateY)', () => {
    const content = readContent('src/app/globals.css')
    expect(content).toContain('top: 50%')
    expect(content).toContain('translateY(-50%)')
  })

  it('datetime-edit fields wrapper uses min-width: 0 to prevent overflow', () => {
    const content = readContent('src/app/globals.css')
    expect(content).toContain('::-webkit-datetime-edit-fields-wrapper')
    expect(content).toContain('min-width: 0')
  })

  it('DatePicker and TimePicker use min-w-0 on input wrapper', () => {
    const datePicker = readContent('src/components/ui/DatePicker.tsx')
    const timePicker = readContent('src/components/ui/TimePicker.tsx')
    expect(datePicker).toContain('relative min-w-0')
    expect(timePicker).toContain('relative min-w-0')
  })

  it('DatePicker and TimePicker use w-full min-w-0 on input', () => {
    const datePicker = readContent('src/components/ui/DatePicker.tsx')
    const timePicker = readContent('src/components/ui/TimePicker.tsx')
    expect(datePicker).toContain('w-full min-w-0')
    expect(timePicker).toContain('w-full min-w-0')
  })
})

describe('Batch 3 — Request Payment Autofocus Fix', () => {
  it('Amount input does not have autoFocus attribute', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    // Find the amount input section and verify no autoFocus
    const amountInputMatch = content.match(/ref=\{amountInputRef\}[\s\S]*?\/>/)
    expect(amountInputMatch).toBeTruthy()
    if (amountInputMatch) {
      expect(amountInputMatch[0]).not.toContain('autoFocus')
    }
  })

  it('does NOT use setTimeout blur', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).not.toContain('setTimeout')
    expect(content).not.toContain('blur()')
  })

  it('does NOT use requestAnimationFrame blur', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).not.toContain('requestAnimationFrame')
  })

  it('does NOT have per-modal focus management (no modalPanelRef)', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).not.toContain('modalPanelRef')
    expect(content).not.toContain('tabIndex={-1}')
  })

  it('shared Modal provides deterministic initial focus on dialog panel', () => {
    const content = readContent('src/components/ui/Modal.tsx')
    // The shared Modal focuses the dialog panel on open
    expect(content).toContain('modalRef.current.focus()')
    // The dialog panel has tabIndex=-1 so it can receive focus
    expect(content).toContain('tabIndex={-1}')
    // No timing hacks in the shared Modal (check for actual rAF calls, not comments)
    const codeLines = content.split('\n').filter(line => !line.trim().startsWith('//'))
    const codeWithoutComments = codeLines.join('\n')
    expect(codeWithoutComments).not.toContain('requestAnimationFrame')
    expect(codeWithoutComments).not.toContain('setTimeout')
  })

  it('amount input ref is preserved for user tap-to-edit', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).toContain('ref={amountInputRef}')
  })

  it('payment validation and submit logic unchanged', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).toContain('parseFloat(paymentAmount)')
    expect(content).toContain('handleCreatePayment')
    expect(content).toContain('/api/payments/create')
  })
})

describe('Batch 3 — Footer Button Normalization', () => {
  it('NewTaskModal footer uses py-2.5 buttons', () => {
    const content = readContent('src/components/schedule/NewTaskModal.tsx')
    expect(content).toContain('px-4 py-2.5 text-sm font-medium')
  })

  it('JobComposer footer uses py-2.5 buttons', () => {
    const content = readContent('src/components/jobs/JobComposer.tsx')
    expect(content).toContain('px-4 py-2.5 text-sm font-medium')
  })

  it('NewAppointmentModal footer uses py-2.5 buttons', () => {
    const content = readContent('src/components/calendar/NewAppointmentModal.tsx')
    expect(content).toContain('px-4 py-2.5 text-sm font-medium')
  })

  it('AddCustomerModal footer uses py-2.5 buttons', () => {
    const content = readContent('src/components/AddCustomerModal.tsx')
    expect(content).toContain('px-4 py-2.5 text-sm font-medium')
  })

  it('EditCustomerModal footer uses py-2.5 buttons (not py-2)', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    expect(content).toContain('px-4 py-2.5 text-sm font-medium')
    // Should NOT have the old py-2 pattern
    expect(content).not.toContain('px-4 py-2 text-sm font-medium text-white bg-blue-600')
  })

  it('RequestPaymentModal footer uses py-2.5 buttons (not py-2)', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).toContain('px-4 py-2.5 text-sm font-medium')
    // Should NOT have the old py-2 pattern
    expect(content).not.toContain('px-4 py-2 text-sm font-medium bg-primary')
  })
})

describe('Batch 3 — Business Logic Unchanged', () => {
  it('NewTaskModal preserves task save/update/delete handlers', () => {
    const content = readContent('src/components/schedule/NewTaskModal.tsx')
    expect(content).toContain('taskToEdit')
    expect(content).toMatch(/save|create|update/i)
  })

  it('JobComposer preserves editJob and timer behavior', () => {
    const content = readContent('src/components/jobs/JobComposer.tsx')
    expect(content).toContain('editJob')
    // Timer should remain immediate, not part of deferred save
    expect(content).toMatch(/timer/i)
  })

  it('NewAppointmentModal preserves Google Calendar and completion behavior', () => {
    const content = readContent('src/components/calendar/NewAppointmentModal.tsx')
    expect(content).toMatch(/calendar|google/i)
  })

  it('EditCustomerModal preserves PATCH contract and single-save behavior', () => {
    const content = readContent('src/components/EditCustomerModal.tsx')
    expect(content).toContain('type="submit"')
    expect(content).toContain('Save Changes')
  })

  it('RequestPaymentModal preserves amount validation and payment logic', () => {
    const content = readContent('src/components/payments/RequestPaymentModal.tsx')
    expect(content).toContain('parseFloat(paymentAmount)')
    expect(content).toContain('handleCreatePayment')
    expect(content).toContain('/api/payments/create')
  })
})

describe('Batch 3 — Batch 2 Regression Check', () => {
  it('lead-merge.ts still exports reconcileScopedChildSnapshot', () => {
    const content = readContent('src/lib/lead-merge.ts')
    expect(content).toContain('reconcileScopedChildSnapshot')
  })

  it('lead-merge.ts still exports mergeLeadRealtimeUpdate', () => {
    const content = readContent('src/lib/lead-merge.ts')
    expect(content).toContain('mergeLeadRealtimeUpdate')
  })

  it('lead-merge.ts still exports mergeLeadFetchResult', () => {
    const content = readContent('src/lib/lead-merge.ts')
    expect(content).toContain('mergeLeadFetchResult')
  })
})
