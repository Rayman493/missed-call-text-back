/**
 * Batch 4 — Modal Visual System Standardization Tests
 *
 * Proves:
 * - Canonical modal shell classes present on all active modal surfaces
 * - Primary action uses ReplyFlow blue (bg-primary)
 * - Secondary action does not use destructive treatment
 * - Modal X uses canonical placement/hit-target
 * - Footer visual separator consistent (bg-muted/30, border-t)
 * - Form controls use canonical field treatment
 * - Tap to Pay title is not autofocus target (no tabIndex=-1)
 * - Tap to Pay title retains semantic heading
 * - X remains keyboard focusable
 * - No broad focus-outline suppression introduced
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 4 — Modal visual system standardization', () => {
  const modalSrc = readSrc('src/components/ui/Modal.tsx')
  const jobComposerSrc = readSrc('src/components/jobs/JobComposer.tsx')
  const jobDetailsModalSrc = readSrc('src/components/jobs/JobDetailsModal.tsx')
  const newAppointmentSrc = readSrc('src/components/calendar/NewAppointmentModal.tsx')
  const eventDetailsSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')
  const newTaskSrc = readSrc('src/components/schedule/NewTaskModal.tsx')
  const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
  const paymentsNewRequestSrc = readSrc('src/components/payments/PaymentsNewRequestModal.tsx')
  const callForwardingSrc = readSrc('src/components/CallForwardingInstructions.tsx')
  const tapToPaySrc = readSrc('src/components/payments/TapToPayModal.tsx')

  // ========== CANONICAL SHELL PRESENCE ==========

  // 1. New Job canonical shell (via shared Modal)
  it('New Job uses shared Modal with canonical shell', () => {
    expect(jobComposerSrc).toContain('<Modal')
    // Shared Modal provides canonical shell
    expect(modalSrc).toContain('rounded-2xl')
    expect(modalSrc).toContain('bg-card')
    expect(modalSrc).toContain('shadow-2xl')
    expect(modalSrc).toContain('border border-border/50')
  })

  // 2. Edit Job canonical shell (via shared Modal)
  it('Edit Job uses shared Modal with canonical shell', () => {
    expect(jobComposerSrc).toContain("title={editJob ? 'Edit Job' : 'New Job'}")
    // Same shared Modal as New Job
    expect(modalSrc).toContain('rounded-2xl')
  })

  // 3. New Appointment canonical shell (via shared Modal)
  it('New Appointment uses shared Modal with canonical shell', () => {
    expect(newAppointmentSrc).toContain('<Modal')
    expect(newAppointmentSrc).toContain('title="New Appointment"')
  })

  // 4. Edit Appointment canonical shell (EventDetailsModal edit mode)
  it('Edit Appointment uses EventDetailsModal with canonical shell', () => {
    expect(eventDetailsSrc).toContain('rounded-2xl')
    expect(eventDetailsSrc).toContain('bg-card')
    expect(eventDetailsSrc).toContain('shadow-2xl')
    expect(eventDetailsSrc).toContain('border border-border/60')
  })

  // 5. New Reminder canonical shell (via shared Modal)
  it('New Reminder uses shared Modal with canonical shell', () => {
    expect(newTaskSrc).toContain('<Modal')
    expect(newTaskSrc).toContain("title={taskToEdit ? 'Edit Reminder' : 'New Reminder'}")
  })

  // 6. Customer Request Payment canonical shell (inline in page-client)
  it('Customer Request Payment uses canonical shell classes', () => {
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 1000)
    expect(paymentModalSection).toContain('bg-card')
    expect(paymentModalSection).toContain('rounded-2xl')
    expect(paymentModalSection).toContain('shadow-2xl')
    expect(paymentModalSection).toContain('border border-border/50')
  })

  // 7. Payments New Payment Request canonical shell (via shared Modal)
  it('Payments New Payment Request uses shared Modal with canonical shell', () => {
    expect(paymentsNewRequestSrc).toContain('<Modal')
    expect(paymentsNewRequestSrc).toContain('title="New Payment Request"')
  })

  // 8. Customer Details canonical shell
  it('Customer Details mobile uses canonical shell classes', () => {
    const mobileSheetIdx = pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details')
    const mobileSheet = pageClientSrc.substring(mobileSheetIdx, mobileSheetIdx + 1000)
    expect(mobileSheet).toContain('bg-card')
    expect(mobileSheet).toContain('border-border/50')
  })

  it('Customer Details desktop uses canonical shell classes', () => {
    const desktopIdx = pageClientSrc.indexOf('Desktop Modal for Customer Details')
    const desktopSection = pageClientSrc.substring(desktopIdx, desktopIdx + 500)
    expect(desktopSection).toContain('bg-card')
    expect(desktopSection).toContain('rounded-2xl')
    expect(desktopSection).toContain('shadow-2xl')
    expect(desktopSection).toContain('border border-border/50')
  })

  // 9. Call Forwarding canonical shell
  it('Call Forwarding uses canonical shell classes', () => {
    expect(callForwardingSrc).toContain('bg-card')
    expect(callForwardingSrc).toContain('rounded-2xl')
    expect(callForwardingSrc).toContain('shadow-2xl')
    expect(callForwardingSrc).toContain('border border-border/50')
  })

  // 10. Tap to Pay canonical shell
  it('Tap to Pay uses canonical shell classes', () => {
    expect(tapToPaySrc).toContain('bg-card')
    expect(tapToPaySrc).toContain('rounded-2xl')
    expect(tapToPaySrc).toContain('shadow-2xl')
    expect(tapToPaySrc).toContain('border border-border/50')
  })

  // ========== PRIMARY ACTION TREATMENT ==========

  // 11. Primary action uses canonical ReplyFlow blue (bg-primary)
  it('Shared Modal consumers use bg-primary for primary action', () => {
    // JobComposer
    expect(jobComposerSrc).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
    // NewAppointmentModal
    expect(newAppointmentSrc).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
    // NewTaskModal
    expect(newTaskSrc).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
  })

  it('Inline Request Payment uses bg-primary for primary action', () => {
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 25000)
    expect(paymentModalSection).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
    // Should NOT use old bg-blue-600 for the primary action button
    // (payment method selection buttons may still use bg-blue-600 as selected state)
    const primaryBtnIdx = paymentModalSection.indexOf('Send Payment Request')
    const primaryBtnSection = paymentModalSection.substring(primaryBtnIdx - 300, primaryBtnIdx + 50)
    expect(primaryBtnSection).not.toContain('bg-blue-600')
  })

  it('PaymentsNewRequestModal uses bg-primary for primary action', () => {
    // The footer primary action button uses bg-primary
    expect(paymentsNewRequestSrc).toContain('bg-primary hover:bg-primary/90 text-primary-foreground')
    // The footer primary action should NOT use bg-blue-600
    const sendBtnIdx = paymentsNewRequestSrc.indexOf('Send Payment Request')
    const sendBtnSection = paymentsNewRequestSrc.substring(sendBtnIdx - 300, sendBtnIdx + 50)
    expect(sendBtnSection).not.toContain('bg-blue-600')
  })

  // 12. Secondary action does not use destructive treatment
  it('Secondary/Cancel actions do not use destructive red treatment', () => {
    // JobComposer Cancel
    expect(jobComposerSrc).toContain('bg-muted hover:bg-muted/80 text-foreground')
    // NewAppointmentModal Cancel
    expect(newAppointmentSrc).toContain('bg-muted hover:bg-muted/80 text-foreground')
    // NewTaskModal Cancel
    expect(newTaskSrc).toContain('bg-muted hover:bg-muted/80 text-foreground')
    // PaymentsNewRequestModal Cancel
    expect(paymentsNewRequestSrc).toContain('bg-muted hover:bg-muted/80 text-foreground')
    // Inline Request Payment Cancel
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 12000)
    expect(paymentModalSection).toContain('bg-muted hover:bg-muted/80 text-foreground')
  })

  // 13. Destructive action remains visually distinct where appropriate
  it('Destructive actions use red treatment (not accidental on Cancel)', () => {
    // EventDetailsModal has a delete action that should use destructive treatment
    expect(eventDetailsSrc).toContain('text-red-600')
    // But Cancel buttons should NOT use red
    const cancelButtons = [
      jobComposerSrc.match(/Cancel[\s\S]{0,500}?bg-muted/g),
      newAppointmentSrc.match(/Cancel[\s\S]{0,500}?bg-muted/g),
      newTaskSrc.match(/Cancel[\s\S]{0,500}?bg-muted/g),
    ]
    cancelButtons.forEach(m => {
      if (m) {
        expect(m[0]).not.toContain('text-red')
        expect(m[0]).not.toContain('bg-red')
      }
    })
  })

  // ========== X BUTTON / CLOSE TREATMENT ==========

  // 14. Modal X uses canonical placement/hit-target
  it('Shared Modal X button has canonical hit-target (h-8 w-8) and placement', () => {
    expect(modalSrc).toContain('h-8 w-8')
    expect(modalSrc).toContain('aria-label="Close"')
    expect(modalSrc).toContain('rounded-lg')
    expect(modalSrc).toContain('hover:bg-muted')
  })

  it('Standalone modals use consistent X button treatment', () => {
    // JobDetailsModal
    expect(jobDetailsModalSrc).toContain('aria-label="Close modal"')
    // EventDetailsModal
    expect(eventDetailsSrc).toContain('aria-label="Close modal"')
    // CallForwarding
    expect(callForwardingSrc).toContain('aria-label="Close modal"')
    // Tap to Pay
    expect(tapToPaySrc).toContain('aria-label="Close modal"')
    // Customer Details mobile
    expect(pageClientSrc).toContain('aria-label="Close"')
    // Inline Request Payment
    expect(pageClientSrc).toContain('aria-label="Close modal"')
  })

  // ========== FOOTER VISUAL SEPARATOR ==========

  // 15. Footer visual separator consistent (bg-muted/30, border-t)
  it('Shared Modal footer has bg-muted/30 and border-t', () => {
    expect(modalSrc).toContain('border-t border-border/50 bg-muted/30')
  })

  it('Standalone modal footers have bg-muted/30 and border-t', () => {
    // JobDetailsModal footer
    expect(jobDetailsModalSrc).toContain('border-t border-border/50 bg-muted/30')
    // EventDetailsModal footer
    expect(eventDetailsSrc).toContain('border-t border-border/60 dark:border-border/50 bg-muted/30')
    // CallForwarding footer
    expect(callForwardingSrc).toContain('border-t border-border/50 bg-muted/30')
  })

  it('Modal headers have bg-muted/30 differentiation', () => {
    // Shared Modal header
    expect(modalSrc).toContain('border-b border-border/50 shrink-0 bg-muted/30')
    // JobDetailsModal header
    expect(jobDetailsModalSrc).toContain('border-b border-border/50 bg-muted/30')
    // EventDetailsModal header
    expect(eventDetailsSrc).toContain('border-b border-border/60 dark:border-border/50 flex-shrink-0 bg-muted/30')
    // Tap to Pay header
    expect(tapToPaySrc).toContain('border-b border-border/50 bg-muted/30 shrink-0')
  })

  // ========== FORM FIELD TREATMENT ==========

  // 16. Form controls use canonical field treatment where applicable
  it('Shared Modal form controls use canonical field treatment', () => {
    // JobComposer inputs
    expect(jobComposerSrc).toContain('bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg')
    expect(jobComposerSrc).toContain('focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60')
    // NewAppointmentModal inputs
    expect(newAppointmentSrc).toContain('bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg')
    // NewTaskModal inputs
    expect(newTaskSrc).toContain('bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg')
  })

  it('Inline Request Payment form controls use canonical field treatment', () => {
    const paymentModalIdx = pageClientSrc.indexOf('{/* Payment Request Modal */}')
    const paymentModalSection = pageClientSrc.substring(paymentModalIdx, paymentModalIdx + 12000)
    expect(paymentModalSection).toContain('bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg')
    expect(paymentModalSection).toContain('focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60')
  })

  // ========== TAP TO PAY TITLE ==========

  // 17. Tap to Pay title is not autofocus target
  it('Tap to Pay title does NOT have tabIndex=-1 (not an autofocus target)', () => {
    // The title should not have tabIndex={-1}
    const titleIdx = tapToPaySrc.indexOf('Tap to Pay</h3>')
    const titleSection = tapToPaySrc.substring(titleIdx - 100, titleIdx + 20)
    expect(titleSection).not.toContain('tabIndex={-1}')
  })

  // 18. Title has no tabIndex unless semantically required
  it('Tap to Pay title has no tabIndex attribute', () => {
    const titleIdx = tapToPaySrc.indexOf('Tap to Pay</h3>')
    const titleSection = tapToPaySrc.substring(titleIdx - 200, titleIdx + 20)
    expect(titleSection).not.toContain('tabIndex')
  })

  // 19. Title retains semantic heading/aria relationship
  it('Tap to Pay title remains a semantic heading (h3)', () => {
    expect(tapToPaySrc).toContain('<h3')
    expect(tapToPaySrc).toContain('Tap to Pay</h3>')
    // Title has select-none to prevent text selection highlight
    expect(tapToPaySrc).toContain('select-none')
  })

  // 20. X remains keyboard focusable
  it('Tap to Pay X button remains keyboard accessible (no outline suppression)', () => {
    // The X button should not have outline-none or outline:none !important
    const xButtonIdx = tapToPaySrc.indexOf('aria-label="Close modal"')
    const xSection = tapToPaySrc.substring(xButtonIdx - 200, xButtonIdx + 100)
    expect(xSection).not.toContain('outline-none')
    expect(xSection).not.toContain('outline:none')
  })

  // 21. No broad focus-outline suppression introduced
  it('No broad outline:none !important introduced in changed files', () => {
    const files = [modalSrc, tapToPaySrc, eventDetailsSrc, jobDetailsModalSrc, callForwardingSrc]
    files.forEach(src => {
      expect(src).not.toContain('outline:none !important')
      expect(src).not.toContain('outline: none !important')
    })
  })

  // ========== SHARED MODAL DOES NOT OVERRIDE BG-CARD ==========

  it('Shared Modal does NOT override bg-card with slate-800', () => {
    // The old dark:bg-slate-800/95 override was removed
    expect(modalSrc).not.toContain('dark:bg-slate-800/95')
    // bg-card provides the canonical navy in dark mode
    expect(modalSrc).toContain('bg-card')
  })

  it('Shared Modal uses rounded-2xl (not rounded-xl)', () => {
    expect(modalSrc).toContain('rounded-2xl')
    expect(modalSrc).not.toContain('rounded-xl')
  })
})
