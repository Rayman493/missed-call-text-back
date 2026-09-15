/**
 * RC Batch 6 — Mobile Transitions + Final UI Consistency
 *
 * Regression tests for:
 * 1. Quote/Invoice chooser → editor mobile transition
 * 2. Edit Appointment modal positioning (centered on mobile)
 * 3. Job/Reminder/Appointment card action alignment
 * 4. "manually" inline link on Customers page
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const chooserSrc = readSrc('src/components/billing/BillingChooserModal.tsx')
const dropdownSrc = readSrc('src/components/ui/Dropdown.tsx')
const navbarNotificationsSrc = readSrc('src/components/NavbarNotifications.tsx')
const modalBackButtonLibSrc = readSrc('src/lib/modalBackButton.ts')
const eventDetailsModalSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')
const calendarPageSrc = readSrc('src/app/dashboard/calendar/page.tsx')
const tasksTabSrc = readSrc('src/components/schedule/TasksTab.tsx')
const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')
const leadCardSrc = readSrc('src/components/LeadCard.tsx')

// ============================================================================
// 1. QUOTE / INVOICE CHOOSER → EDITOR MOBILE TRANSITION
// ============================================================================
describe('CHOOSER → EDITOR MOBILE TRANSITION', () => {
  it('1. handleBillingChooserSelect fires for Create Quote', () => {
    expect(chooserSrc).toContain("onSelectType('quote')")
    expect(chooserSrc).toContain('Create Quote')
  })

  it('2. handleBillingChooserSelect fires for Create Invoice', () => {
    expect(chooserSrc).toContain("onSelectType('invoice')")
    expect(chooserSrc).toContain('Create Invoice')
  })

  it('3. suppressNextHistoryBackCleanup is called before closing chooser', () => {
    const handlerMatch = paymentsPageSrc.match(
      /handleBillingChooserSelect[\s\S]*?\{([\s\S]*?)\n  \}/
    )
    expect(handlerMatch).toBeTruthy()
    const body = handlerMatch![1]
    const suppressIdx = body.indexOf('suppressNextHistoryBackCleanup()')
    const closeChooserIdx = body.indexOf('setShowBillingChooser(false)')
    expect(suppressIdx).toBeGreaterThan(-1)
    expect(closeChooserIdx).toBeGreaterThan(-1)
    expect(suppressIdx).toBeLessThan(closeChooserIdx)
  })

  it('4. editor opens after chooser closes (setShowBillingEditor(true) present)', () => {
    expect(paymentsPageSrc).toContain('setShowBillingEditor(true)')
  })

  it('5. no setTimeout or requestAnimationFrame in transition', () => {
    const handlerMatch = paymentsPageSrc.match(
      /handleBillingChooserSelect[\s\S]*?\{([\s\S]*?)\n  \}/
    )
    expect(handlerMatch).toBeTruthy()
    const body = handlerMatch![1]
    const codeOnly = body.replace(/\/\/[^\n]*/g, '')
    expect(codeOnly).not.toMatch(/setTimeout\s*\(/)
    expect(codeOnly).not.toMatch(/requestAnimationFrame\s*\(/)
  })

  it('6. chooser uses shared Modal (not hand-built)', () => {
    expect(chooserSrc).toContain("from '@/components/ui/Modal'")
    expect(chooserSrc).toContain('<Modal')
  })

  it('7. suppressNextHistoryBackCleanup flag is one-shot', () => {
    expect(modalBackButtonLibSrc).toContain('suppressHistoryBackCleanupOnce = true')
    expect(modalBackButtonLibSrc).toContain('suppressHistoryBackCleanupOnce = false')
  })

  it('8. Dropdown pointerdown listener is conditional on isOpen (not unconditional)', () => {
    // The Dropdown must NOT register pointerdown listener unconditionally.
    // Unconditional registration causes markDropdownDismissed() to fire on
    // every outside pointerdown even when the dropdown is closed, which
    // suppresses clicks on modal buttons (e.g., chooser buttons).
    const effectMatch = dropdownSrc.match(
      /useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[([^\]]*)\]\)/
    )
    expect(effectMatch).toBeTruthy()
    const deps = effectMatch![2].trim()
    expect(deps).toBe('isOpen')
    expect(effectMatch![1]).toContain('if (!isOpen) return')
  })

  it('9. NavbarNotifications pointerdown listener is conditional on isOpen', () => {
    // Find the useEffect that contains the pointerdown listener
    const effectMatch = navbarNotificationsSrc.match(
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?handlePointerDownOutside[\s\S]*?\},\s*\[([^\]]*)\]\)/
    )
    expect(effectMatch).toBeTruthy()
    const deps = effectMatch![1].trim()
    expect(deps).toBe('isOpen')
    // The effect must early-return when not open
    expect(effectMatch![0]).toContain('if (!isOpen) return')
  })

  it('10. Dropdown still calls markDropdownDismissed when open', () => {
    expect(dropdownSrc).toContain('markDropdownDismissed()')
  })

  it('11. chooser buttons use onClick (not pointer handlers)', () => {
    expect(chooserSrc).toContain("onClick={() => onSelectType('quote')}")
    expect(chooserSrc).toContain("onClick={() => onSelectType('invoice')}")
  })
})

// ============================================================================
// 2. EDIT APPOINTMENT MODAL POSITIONING
// ============================================================================
describe('EDIT APPOINTMENT MODAL POSITIONING', () => {
  it('12. EventDetailsModal uses items-center (not items-start) on mobile', () => {
    // The modal must be centered on mobile, not top-aligned.
    // items-start caused the modal to be too high on Android.
    const overlayMatch = eventDetailsModalSrc.match(
      /className="fixed inset-0[^"]*flex (items-\w+)[^"]*justify-center/
    )
    expect(overlayMatch).toBeTruthy()
    expect(overlayMatch![1]).toBe('items-center')
    // Must NOT contain items-start on the overlay
    expect(eventDetailsModalSrc).not.toMatch(/fixed inset-0[^"]*items-start/)
  })

  it('13. EventDetailsModal respects safe-area top', () => {
    expect(eventDetailsModalSrc).toContain('env(safe-area-inset-top)')
  })

  it('14. EventDetailsModal uses modal-bottom-reserve for bottom padding', () => {
    // Must use the shared --modal-bottom-reserve CSS variable, not a
    // hardcoded env(safe-area-inset-bottom), to stay consistent with the
    // shared Modal component and Batch 1 bottom-nav fix.
    expect(eventDetailsModalSrc).toContain('var(--modal-bottom-reserve)')
  })

  it('15. EventDetailsModal uses max-h with modal-max-height variable', () => {
    expect(eventDetailsModalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('16. EventDetailsModal has internal scroll (overflow-hidden on panel, scroll on body)', () => {
    expect(eventDetailsModalSrc).toContain('flex-col overflow-hidden')
  })

  it('17. EventDetailsModal does NOT reserve bottom-nav height', () => {
    // Must not use --bottom-nav-height in the modal itself
    expect(eventDetailsModalSrc).not.toMatch(/bottom-nav-height/)
  })
})

// ============================================================================
// 3. JOB / REMINDER / APPOINTMENT CARD ACTION ALIGNMENT
// ============================================================================
describe('CARD ACTION ALIGNMENT', () => {
  it('18. Job card vertically centers right-side actions on parent row (no shifting)', () => {
    const jobCardMatch = calendarPageSrc.match(
      /JobCard[\s\S]*?flex (items-\w+) justify-between gap-3/
    )
    expect(jobCardMatch).toBeTruthy()
    expect(jobCardMatch![1]).toBe('items-center')
  })

  it('19. Job card action container uses flex items-center', () => {
    expect(calendarPageSrc).toContain('flex items-center gap-1 flex-shrink-0')
  })

  it('20. Job card action buttons use w-8 h-8 hit target', () => {
    expect(calendarPageSrc).toContain('w-8 h-8 flex items-center justify-center')
  })

  it('21. Reminder card (calendar page) vertically centers right-side actions on parent row', () => {
    // The RemindersList card uses items-center so the right-side action group
    // is vertically centered against the full card, preventing high-perched buttons.
    const remindersSectionMatch = calendarPageSrc.match(
      /function RemindersList[\s\S]*?flex (items-\w+) justify-between gap-3/
    )
    expect(remindersSectionMatch).toBeTruthy()
    expect(remindersSectionMatch![1]).toBe('items-center')
  })

  it('22. Reminder card action buttons use w-8 h-8 hit target', () => {
    // Verify the reminder card's edit/delete buttons use w-8 h-8
    const remindersSectionMatch = calendarPageSrc.match(
      /function RemindersList[\s\S]*?aria-label="Edit reminder"[\s\S]*?aria-label="Delete reminder"/
    )
    expect(remindersSectionMatch).toBeTruthy()
    expect(remindersSectionMatch![0]).toContain('w-8 h-8')
  })

  it('23. Appointment card vertically centers right-side actions on parent row', () => {
    const meetingsSectionMatch = calendarPageSrc.match(
      /function MeetingsTab[\s\S]*?flex (items-\w+) justify-between gap-3/
    )
    expect(meetingsSectionMatch).toBeTruthy()
    expect(meetingsSectionMatch![1]).toBe('items-center')
  })

  it('24. Appointment card action buttons use w-8 h-8 hit target', () => {
    expect(calendarPageSrc).toContain('aria-label="Edit appointment"')
    expect(calendarPageSrc).toContain('aria-label="Delete appointment"')
  })

  it('25. TasksTab Reminder card uses w-8 h-8 hit target (not p-1.5)', () => {
    // The TasksTab card must use w-8 h-8 for consistency with other cards
    expect(tasksTabSrc).toContain('w-8 h-8 flex items-center justify-center')
    // Must NOT use the old p-1.5 sizing for the edit button
    expect(tasksTabSrc).not.toMatch(/p-1\.5 text-slate-400 hover:text-slate-600/)
  })

  it('26. TasksTab status badge is NOT inside the action container', () => {
    // The status badge must be in the content area, not the action container,
    // to prevent the action container from shifting when the badge is present.
    const actionContainerMatch = tasksTabSrc.match(
      /<div className="flex items-center gap-1 shrink-0 pl-2">([\s\S]*?)<\/div>/
    )
    expect(actionContainerMatch).toBeTruthy()
    expect(actionContainerMatch![1]).not.toContain('getTaskStatusBadge')
  })

  it('27. TasksTab status badge is in the content area', () => {
    expect(tasksTabSrc).toContain('getTaskStatusBadge(task)')
  })

  it('28. all three card action containers use consistent flex pattern', () => {
    // All action containers should use "flex items-center" with "flex-shrink-0" or "shrink-0"
    expect(calendarPageSrc).toContain('flex items-center gap-1 flex-shrink-0')
    expect(tasksTabSrc).toContain('flex items-center gap-1 shrink-0')
  })
})

// ============================================================================
// 4. "MANUALLY" INLINE LINK ON CUSTOMERS PAGE
// ============================================================================
describe('MANUALLY INLINE LINK', () => {
  it('29. helper copy retains exact sentence structure', () => {
    expect(leadsPageSrc).toContain('Customers are added automatically when they call or message your ReplyFlow number.')
    expect(leadsPageSrc).toContain('You can also add customers')
    expect(leadsPageSrc).toContain('manually')
    expect(leadsPageSrc).toContain('anytime.')
  })

  it('30. only "manually" is interactive (button element)', () => {
    // The word "manually" must be a <button> element
    expect(leadsPageSrc).toMatch(/<button[\s\S]*?>\s*manually\s*<\/button>/)
  })

  it('31. manually button opens existing Add Customer modal', () => {
    // The button's onClick must call setShowAddCustomerModal(true)
    const manuallyMatch = leadsPageSrc.match(
      /<button[\s\S]*?onClick=\{[^}]*setShowAddCustomerModal\(true\)[^}]*\}[\s\S]*?>\s*manually\s*<\/button>/
    )
    expect(manuallyMatch).toBeTruthy()
  })

  it('32. manually button is subtle/link-like (underline, transparent bg)', () => {
    // Find the manually button by its content
    const manuallyIdx = leadsPageSrc.indexOf('manually')
    // Find the manually that's inside a button (search for the one after "add customers")
    const helperIdx = leadsPageSrc.indexOf('You can also add customers')
    expect(helperIdx).toBeGreaterThan(-1)
    const manuallyInHelper = leadsPageSrc.indexOf('manually', helperIdx)
    expect(manuallyInHelper).toBeGreaterThan(-1)
    // Search backwards for the opening <button tag
    const buttonStart = leadsPageSrc.lastIndexOf('<button', manuallyInHelper)
    expect(buttonStart).toBeGreaterThan(-1)
    const buttonBlock = leadsPageSrc.slice(buttonStart, manuallyInHelper + 10)
    expect(buttonBlock).toContain('underline')
    expect(buttonBlock).toContain('bg-transparent')
    expect(buttonBlock).toContain('border-0')
    expect(buttonBlock).toContain('cursor-pointer')
  })

  it('33. manually button has type="button" (no form submit)', () => {
    const manuallyMatch = leadsPageSrc.match(
      /<button[\s\S]*?type="button"[\s\S]*?>\s*manually\s*<\/button>/
    )
    expect(manuallyMatch).toBeTruthy()
  })

  it('34. existing + Add Customer button still works', () => {
    expect(leadsPageSrc).toContain('setShowAddCustomerModal(true)')
  })

  it('35. Manual source badge remains non-interactive (plain span)', () => {
    // The LeadCard's source badge must be a <span>, not a <button> or <a>
    const badgeStart = leadCardSrc.indexOf('{customerSourceInfo && (')
    expect(badgeStart).toBeGreaterThan(-1)
    const badgeBlock = leadCardSrc.slice(badgeStart, badgeStart + 800)
    expect(badgeBlock).toContain('<span')
    expect(badgeBlock).not.toContain('<button')
    // The span tag must not have onClick
    const spanIdx = badgeBlock.indexOf('<span')
    const spanEnd = badgeBlock.indexOf('>', spanIdx)
    const spanTag = badgeBlock.slice(spanIdx, spanEnd + 1)
    expect(spanTag).not.toContain('onClick')
  })

  it('36. no additional visible button added (only inline link)', () => {
    // The manually link must be the ONLY new interactive element in the helper copy
    const helperMatch = leadsPageSrc.match(
      /Customers are added automatically[\s\S]*?anytime\./
    )
    expect(helperMatch).toBeTruthy()
    const buttonCount = (helperMatch![0].match(/<button/g) || []).length
    expect(buttonCount).toBe(1) // Only the "manually" button
  })
})
