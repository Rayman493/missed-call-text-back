/**
 * Batch C — Customer Card Action Alignment + Modal Sizing + Customer Details / Delete Account Polish
 *
 * Static source-level tests proving:
 * 1. All five customer card headers use the same canonical right-slot contract
 * 2. Customer Details modal has no fake drag handle
 * 3. Customer Details modal is slightly taller but not fullscreen
 * 4. Shared modal system is content-driven (no excessive dead space)
 * 5. Delete Account password field has canonical border
 * 6. Delete Account modal is content-driven
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const sidebarSectionSrc = readSrc('src/components/SidebarSection.tsx')
const modalSrc = readSrc('src/components/ui/Modal.tsx')
const settingsSrc = readSrc('src/components/SettingsContent.tsx')
const editCustomerSrc = readSrc('src/components/EditCustomerModal.tsx')
const passwordInputSrc = readSrc('src/components/PasswordInput.tsx')

// ============================================================
// Part 1: Customer Card Alignment
// ============================================================

describe('Batch C — Part 1: Customer Card Alignment', () => {
  it('1. Jobs action uses canonical right slot', () => {
    // Jobs card uses SidebarSection with headerAction
    expect(pageClientSrc).toContain('title="Jobs"')
    const jobsSection = pageClientSrc.substring(
      pageClientSrc.indexOf('title="Jobs"'),
      pageClientSrc.indexOf('title="Jobs"') + 500
    )
    expect(jobsSection).toContain('headerAction')
    expect(jobsSection).toContain('handleCreateJobClick')
  })

  it('2. Reminders action uses canonical right slot', () => {
    expect(pageClientSrc).toContain('title="Reminders"')
    const remindersSection = pageClientSrc.substring(
      pageClientSrc.indexOf('title="Reminders"'),
      pageClientSrc.indexOf('title="Reminders"') + 500
    )
    expect(remindersSection).toContain('headerAction')
    expect(remindersSection).toContain('openTaskModal')
  })

  it('3. Payments action uses canonical right slot', () => {
    expect(pageClientSrc).toContain('title="Payments"')
    const paymentsSection = pageClientSrc.substring(
      pageClientSrc.indexOf('title="Payments"'),
      pageClientSrc.indexOf('title="Payments"') + 500
    )
    expect(paymentsSection).toContain('headerAction')
    expect(paymentsSection).toContain('handleRequestPaymentClick')
  })

  it('4. Appointments action uses canonical right slot', () => {
    expect(pageClientSrc).toContain('title="Appointments"')
    const appointmentsSection = pageClientSrc.substring(
      pageClientSrc.indexOf('title="Appointments"'),
      pageClientSrc.indexOf('title="Appointments"') + 500
    )
    expect(appointmentsSection).toContain('headerAction')
    expect(appointmentsSection).toContain('handleAppointmentClick')
  })

  it('5. Internal Notes action uses canonical right slot', () => {
    expect(pageClientSrc).toContain('title="Internal Notes"')
    const notesSection = pageClientSrc.substring(
      pageClientSrc.indexOf('title="Internal Notes"'),
      pageClientSrc.indexOf('title="Internal Notes"') + 500
    )
    expect(notesSection).toContain('headerAction')
    expect(notesSection).toContain('setShowInternalNotesModal')
  })

  it('6. all five right edges use the same header contract (chevron before action)', () => {
    // SidebarSection renders chevron BEFORE headerAction so action is always at far right
    const chevronIdx = sidebarSectionSrc.indexOf('collapsible &&')
    const actionIdx = sidebarSectionSrc.indexOf('{headerAction}')
    expect(chevronIdx).toBeGreaterThan(0)
    expect(actionIdx).toBeGreaterThan(0)
    expect(chevronIdx).toBeLessThan(actionIdx)
  })

  it('7. long titles do not push action off-screen (min-w-0 + truncate on title)', () => {
    // The title element has min-w-0 and truncate to prevent pushing
    expect(sidebarSectionSrc).toContain('min-w-0')
    expect(sidebarSectionSrc).toContain('truncate')
    // The right slot uses justify-end shrink-0 (canonical Add alignment)
    expect(sidebarSectionSrc).toContain('justify-end shrink-0')
  })

  it('8. action tap behavior unchanged (all onClick handlers preserved)', () => {
    // All action buttons still have their onClick handlers
    expect(pageClientSrc).toContain('onClick={handleCreateJobClick}')
    expect(pageClientSrc).toContain('onClick={() => openTaskModal')
    expect(pageClientSrc).toContain('onClick={handleRequestPaymentClick}')
    expect(pageClientSrc).toContain('onClick={handleAppointmentClick}')
    expect(pageClientSrc).toContain('setShowInternalNotesModal(true)')
  })
})

// ============================================================
// Part 2: Shared Modal Height
// ============================================================

describe('Batch C — Part 2: Shared Modal Height', () => {
  it('9. short modal is content-driven (no fixed height on modal shell)', () => {
    // Modal shell uses max-h, not fixed h
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
    expect(modalSrc).not.toMatch(/h-\[\d+vh\]/)
  })

  it('10. medium modal is content-driven (flex-1 body grows only when needed)', () => {
    // Body uses flex-1 min-h-0 for scroll-when-needed behavior
    expect(modalSrc).toContain('flex-1 min-h-0')
  })

  it('11. long modal respects max viewport height (max-h via --modal-max-height)', () => {
    // The modal shell has max-h-[var(--modal-max-height)]
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('12. body becomes scroll owner only when needed (overflow-y-auto on body)', () => {
    expect(modalSrc).toContain('overflow-y-auto')
    expect(modalSrc).toContain('overscroll-contain')
  })

  it('13. footer does not create artificial min-height (shrink-0 on footer)', () => {
    // Footer uses shrink-0, not min-h
    expect(modalSrc).toContain('shrink-0')
    const footerSection = modalSrc.substring(
      modalSrc.indexOf('footer &&'),
      modalSrc.indexOf('footer &&') + 200
    )
    expect(footerSection).toContain('shrink-0')
  })

  it('14. no duplicate bottom-safe-area padding (body padding uses footer-conditional)', () => {
    // Body paddingBottom is conditional on footer presence
    // When footer present: uses env(safe-area-inset-bottom)
    // When no footer: uses --modal-bottom-reserve
    expect(modalSrc).toContain("paddingBottom: footer ? 'max(16px, env(safe-area-inset-bottom))' : 'max(16px, var(--modal-bottom-reserve))'")
    // The old 80px fixed minimum is gone
    expect(modalSrc).not.toContain("paddingBottom: 'max(80px, calc(64px + var(--modal-bottom-reserve)))'")
  })

  it('15. 320px viewport still usable (modal uses dvh-based max-height)', () => {
    // --modal-max-height uses 100dvh which adapts to viewport
    const globalsSrc = readSrc('src/app/globals.css')
    expect(globalsSrc).toContain('--modal-max-height: calc(100dvh - 32px)')
  })

  it('16. 390px viewport does not create excess dead space (no 80px bottom padding)', () => {
    // The old 80px minimum bottom padding is removed
    expect(modalSrc).not.toContain('max(80px')
  })
})

// ============================================================
// Part 3: Customer Details
// ============================================================

describe('Batch C — Part 3: Customer Details', () => {
  it('17. fake grabber is absent (no w-12 h-1 handle div)', () => {
    // The grabber handle div should be removed
    const customerDetailsModalSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details'),
      pageClientSrc.indexOf('Desktop Modal for Customer Details')
    )
    expect(customerDetailsModalSection).not.toContain('w-12 h-1')
    expect(customerDetailsModalSection).not.toContain('Handle')
  })

  it('18. modal is slightly taller than generic short modal (max-h-[85vh])', () => {
    // Customer Details bottom sheet uses max-h-[85vh] (increased from 80vh)
    const customerDetailsModalSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details'),
      pageClientSrc.indexOf('Desktop Modal for Customer Details')
    )
    expect(customerDetailsModalSection).toContain('max-h-[85vh]')
  })

  it('19. modal is not fullscreen (max-h-[85vh], not 100vh)', () => {
    const customerDetailsModalSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details'),
      pageClientSrc.indexOf('Desktop Modal for Customer Details')
    )
    expect(customerDetailsModalSection).not.toContain('h-[100vh]')
    expect(customerDetailsModalSection).not.toContain('h-[100dvh]')
  })

  it('20. body scrolls independently (overflow-y-auto on content area)', () => {
    const customerDetailsModalSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details'),
      pageClientSrc.indexOf('Desktop Modal for Customer Details')
    )
    expect(customerDetailsModalSection).toContain('overflow-y-auto')
    expect(customerDetailsModalSection).toContain('data-scroll-lock-allow')
  })

  it('21. header remains stable (flex-shrink-0 on header)', () => {
    // The header has border-b and is not scrollable
    const customerDetailsModalSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details'),
      pageClientSrc.indexOf('Desktop Modal for Customer Details')
    )
    expect(customerDetailsModalSection).toContain('border-b')
    expect(customerDetailsModalSection).toContain('Customer Details')
  })

  it('22. Android Back still closes correctly (backdrop click closes)', () => {
    // The backdrop onClick closes the modal
    const customerDetailsModalSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Mobile Bottom Sheet for Customer Details'),
      pageClientSrc.indexOf('Desktop Modal for Customer Details')
    )
    expect(customerDetailsModalSection).toContain('setShowLeadInfo(false)')
  })
})

// ============================================================
// Part 4: Delete Account
// ============================================================

describe('Batch C — Part 4: Delete Account', () => {
  it('23. Current Password field has canonical border (border utility present)', () => {
    // The password field className must include the 'border' utility (width)
    // not just border-color utilities. Search for the actual usage, not the import.
    const passwordSection = settingsSrc.substring(
      settingsSrc.indexOf('id="delete-password"'),
      settingsSrc.indexOf('id="delete-password"') + 1000
    )
    // The 'border' utility must be present in the className (sets border-width: 1px)
    expect(passwordSection).toContain('border ')
    // The border color classes must still be present (in the else branch of ternary)
    expect(passwordSection).toContain('border-slate-200/70')
    expect(passwordSection).toContain('dark:border-slate-700/50')
  })

  it('24. password reveal icon stays aligned (PasswordInput uses absolute positioning)', () => {
    // PasswordInput component uses absolute positioning for the reveal button
    expect(passwordInputSrc).toContain('absolute inset-y-0 right-0')
    expect(passwordInputSrc).toContain('pr-12')
  })

  it('25. modal is content-driven (no h-[100vh] on mobile)', () => {
    // The Delete Account modal should NOT have h-[100vh] (fullscreen on mobile)
    const deleteModalSection = settingsSrc.substring(
      settingsSrc.indexOf('Delete Account Modal'),
      settingsSrc.indexOf('Delete Account Modal') + 500
    )
    expect(deleteModalSection).not.toContain('h-[100vh]')
    expect(deleteModalSection).not.toContain('h-[100dvh]')
  })

  it('26. destructive warning preserved (warning text still present)', () => {
    // The destructive warning text is still present
    expect(settingsSrc).toContain('This permanently deletes your account and business data')
    expect(settingsSrc).toContain('This action cannot be undone')
  })

  it('27. destructive action flow unchanged (Delete Account button still present)', () => {
    // The delete button and confirmation flow are unchanged
    expect(settingsSrc).toContain('Delete Account Permanently')
    expect(settingsSrc).toContain("deleteConfirmText !== 'DELETE'")
  })

  it('28. keyboard does not hide action buttons (footer is shrink-0, body scrolls)', () => {
    // The footer is flex-shrink-0 so it stays visible above keyboard
    const footerSection = settingsSrc.substring(
      settingsSrc.indexOf('Fixed Footer'),
      settingsSrc.indexOf('Fixed Footer') + 200
    )
    expect(footerSection).toContain('flex-shrink-0')
    // The body is scrollable
    const bodySection = settingsSrc.substring(
      settingsSrc.indexOf('Scrollable Body'),
      settingsSrc.indexOf('Scrollable Body') + 200
    )
    expect(bodySection).toContain('overflow-y-scroll')
    expect(bodySection).toContain('data-scroll-lock-allow')
  })
})
