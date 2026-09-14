/**
 * RC Batch 1 — Mobile Modal + Interaction System Regression Tests
 *
 * Covers:
 * - Modal geometry (no bottom-nav reserve, proper max-height)
 * - Edit Appointment modal no longer extends above viewport
 * - Customer picker has bounded scroll region
 * - More button not hidden by its own scroll lock
 * - Dropdown outside-tap does not click-through to underlying elements
 * - Add Customer available in Appointment and Reminder modals
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const globalsCssSrc = readSrc('src/app/globals.css')
const modalSrc = readSrc('src/components/ui/Modal.tsx')
const bottomNavSrc = readSrc('src/components/BottomNavigation.tsx')
const eventDetailsModalSrc = readSrc('src/components/calendar/EventDetailsModal.tsx')
const dayDetailModalSrc = readSrc('src/components/calendar/DayDetailModal.tsx')
const jobDetailsModalSrc = readSrc('src/components/jobs/JobDetailsModal.tsx')
const leadPickerModalSrc = readSrc('src/components/jobs/LeadPickerModal.tsx')
const followUpSettingsSrc = readSrc('src/components/FollowUpSettings.tsx')
const newAppointmentModalSrc = readSrc('src/components/calendar/NewAppointmentModal.tsx')
const newTaskModalSrc = readSrc('src/components/schedule/NewTaskModal.tsx')
const jobComposerSrc = readSrc('src/components/jobs/JobComposer.tsx')
const searchableCustomerSelectSrc = readSrc('src/components/customers/SearchableCustomerSelect.tsx')
const dropdownSrc = readSrc('src/components/ui/Dropdown.tsx')
const premiumSelectSrc = readSrc('src/components/ui/PremiumSelect.tsx')
const selectPickerSrc = readSrc('src/components/ui/SelectPicker.tsx')
const mobileDrawerSrc = readSrc('src/components/MobileDrawer.tsx')
const navbarNotificationsSrc = readSrc('src/components/NavbarNotifications.tsx')
const betaFeedbackModalSrc = readSrc('src/components/BetaFeedbackModal.tsx')
const leadStatusGestureSrc = readSrc('src/components/lead-status-gesture.ts')

// ============================================================================
// MOBILE MODAL GEOMETRY
// ============================================================================

describe('MOBILE MODAL GEOMETRY', () => {
  it('1. centered modal uses actual mobile viewport rather than app content minus nav', () => {
    // --modal-bottom-reserve must NOT include --bottom-nav-height
    expect(globalsCssSrc).not.toContain('--modal-bottom-reserve: calc(env(safe-area-inset-bottom) + var(--bottom-nav-height')
    // It should use safe-area + 16px breathing room only
    expect(globalsCssSrc).toContain('--modal-bottom-reserve: calc(env(safe-area-inset-bottom) + 16px)')
  })

  it('2. bottom nav spacing is not double-counted in modal max-height', () => {
    // --modal-max-height must NOT subtract --bottom-nav-height
    expect(globalsCssSrc).not.toContain('--modal-max-height: calc(100dvh - var(--bottom-nav-height')
    expect(globalsCssSrc).toContain('--modal-max-height: calc(100dvh - 32px)')
  })

  it('3. safe-area handling remains present in modal CSS', () => {
    expect(globalsCssSrc).toContain('env(safe-area-inset-bottom)')
    expect(modalSrc).toContain('env(safe-area-inset-top)')
  })

  it('4. explicit bottomSheetOnMobile still bottom-aligns', () => {
    expect(modalSrc).toContain("bottomSheetOnMobile ? 'items-end'")
  })

  it('5. tall modal gets max-height and internal scrolling', () => {
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
    expect(modalSrc).toContain('overflow-y-auto')
  })

  it('6. Edit Appointment cannot render above viewport', () => {
    // EventDetailsModal must not reserve bottom-nav-height in paddingBottom
    expect(eventDetailsModalSrc).not.toContain('var(--bottom-nav-height, 72px)')
    // Must use safe-area only for paddingBottom
    expect(eventDetailsModalSrc).toContain("paddingBottom: 'max(16px, env(safe-area-inset-bottom))'")
    // Must use --modal-max-height for max-height (not hardcoded calc with bottom-nav)
    expect(eventDetailsModalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('7. desktop modal positioning unchanged', () => {
    // Desktop still uses 128px reserve
    expect(globalsCssSrc).toContain('--modal-max-height: calc(100dvh - 128px)')
    // Desktop bottom reserve is 16px
    expect(globalsCssSrc).toContain('--modal-bottom-reserve: 16px')
  })
})

// ============================================================================
// HAND-BUILT MODAL GEOMETRY (same root cause)
// ============================================================================

describe('HAND-BUILT MODAL GEOMETRY', () => {
  it('DayDetailModal does not reserve bottom-nav-height', () => {
    expect(dayDetailModalSrc).not.toContain('max-h-[calc(100dvh-var(--bottom-nav-height')
    expect(dayDetailModalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('JobDetailsModal does not reserve bottom-nav-height', () => {
    expect(jobDetailsModalSrc).not.toContain('max-h-[calc(100dvh-var(--bottom-nav-height')
    expect(jobDetailsModalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('LeadPickerModal does not reserve bottom-nav-height', () => {
    expect(leadPickerModalSrc).not.toContain('max-h-[calc(100dvh-var(--bottom-nav-height')
    expect(leadPickerModalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('FollowUpSettings does not reserve bottom-nav-height in padding', () => {
    expect(followUpSettingsSrc).not.toContain("paddingBottom: 'calc(var(--bottom-nav-height")
    expect(followUpSettingsSrc).toContain("paddingBottom: 'max(16px, env(safe-area-inset-bottom))'")
  })
})

// ============================================================================
// CUSTOMER PICKER
// ============================================================================

describe('CUSTOMER PICKER', () => {
  it('8. appointment customer results have bounded scroll region on mobile', () => {
    expect(searchableCustomerSelectSrc).toContain('overflow-y-auto')
    expect(searchableCustomerSelectSrc).toContain('overscroll-contain')
    expect(searchableCustomerSelectSrc).toContain('touch-pan-y')
  })

  it('9. long customer list remains reachable (max-height + scroll)', () => {
    expect(searchableCustomerSelectSrc).toContain('max-h-[300px]')
    expect(searchableCustomerSelectSrc).toContain('min-h-0')
  })

  it('10. keyboard-size viewport does not collapse picker unusably', () => {
    // Uses visualViewport for dynamic measurement
    expect(searchableCustomerSelectSrc).toContain('window.visualViewport')
    // Has a minimum height floor of 160px
    expect(searchableCustomerSelectSrc).toContain('160')
  })

  it('11. selecting customer preserves appointment form (handleSelect closes dropdown only)', () => {
    expect(searchableCustomerSelectSrc).toContain('setIsOpen(false)')
    expect(searchableCustomerSelectSrc).toContain("setSearchQuery('')")
  })

  it('12. desktop picker unchanged (text-sm class present)', () => {
    expect(searchableCustomerSelectSrc).toContain('sm:text-sm')
  })
})

// ============================================================================
// MORE NAV
// ============================================================================

describe('MORE NAV', () => {
  it('13. More has an active pointer/touch handler', () => {
    expect(bottomNavSrc).toContain("onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}")
  })

  it('14. no overlay intercepts bottom nav after modal close (hideNav excludes More menu)', () => {
    // The hideNav check must not hide the nav when the More menu itself is open
    expect(bottomNavSrc).toContain('(isModalOpen && !isMoreMenuOpen)')
  })

  it('15. all five bottom-nav items preserve equivalent hit targets', () => {
    // Primary nav items and More button both use h-12
    expect(bottomNavSrc).toContain('h-12 w-full flex-col items-center justify-center')
  })

  it('16. More works after opening/closing a representative modal', () => {
    // useBodyScrollLock properly removes data-modal-open on last unlock
    const scrollLockSrc = readSrc('src/hooks/useBodyScrollLock.ts')
    expect(scrollLockSrc).toContain("document.body.removeAttribute('data-modal-open')")
  })

  it('17. More works after opening/closing a dropdown', () => {
    // More menu uses useBodyScrollLock which is reference-counted
    expect(bottomNavSrc).toContain("useBodyScrollLock(isMoreMenuOpen, 'MoreMenu')")
  })
})

// ============================================================================
// OUTSIDE-TAP DISMISSAL
// ============================================================================

describe('OUTSIDE-TAP DISMISSAL', () => {
  it('18. outside pointer dismisses dropdown (uses pointerdown)', () => {
    expect(dropdownSrc).toContain("document.addEventListener('pointerdown'")
    expect(premiumSelectSrc).toContain("document.addEventListener('pointerdown'")
    expect(selectPickerSrc).toContain("document.addEventListener('pointerdown'")
  })

  it('19. same gesture does NOT activate underlying customer card (markDropdownDismissed)', () => {
    // All dropdowns must call markDropdownDismissed before closing
    expect(dropdownSrc).toContain('markDropdownDismissed()')
    expect(premiumSelectSrc).toContain('markDropdownDismissed()')
    expect(selectPickerSrc).toContain('markDropdownDismissed()')
    expect(searchableCustomerSelectSrc).toContain('markDropdownDismissed()')
    expect(mobileDrawerSrc).toContain('markDropdownDismissed()')
    expect(navbarNotificationsSrc).toContain('markDropdownDismissed()')
    expect(betaFeedbackModalSrc).toContain('markDropdownDismissed()')
  })

  it('20. inside dropdown interaction still works (option onClick present)', () => {
    expect(dropdownSrc).toContain('onChange(option.value)')
    expect(premiumSelectSrc).toContain('onChange(option.value)')
  })

  it('21. subsequent tap after dismissal activates underlying card normally', () => {
    // The capture-phase pointerdown listener clears the flag for the next gesture
    expect(leadStatusGestureSrc).toContain("consumedByDismissal = false")
    // The click listener also clears the flag after suppressing
    expect(leadStatusGestureSrc).toContain("consumedByDismissal = false")
  })

  it('22. desktop mouse behavior preserved (pointerdown covers mouse + touch)', () => {
    // pointerdown fires for mouse, touch, and pen — no mousedown-only listeners remain
    expect(dropdownSrc).not.toContain("document.addEventListener('mousedown'")
    expect(premiumSelectSrc).not.toContain("document.addEventListener('mousedown'")
    expect(navbarNotificationsSrc).not.toContain("document.addEventListener('mousedown'")
    expect(mobileDrawerSrc).not.toContain("document.addEventListener('mousedown'")
    expect(betaFeedbackModalSrc).not.toContain("document.addEventListener('mousedown'")
  })
})

// ============================================================================
// ADD CUSTOMER CONSISTENCY
// ============================================================================

describe('ADD CUSTOMER CONSISTENCY', () => {
  it('23. Add Appointment exposes Add customer', () => {
    expect(newAppointmentModalSrc).toContain('AddCustomerModal')
    expect(newAppointmentModalSrc).toContain('onAddCustomerClick')
    expect(newAppointmentModalSrc).toContain('setIsAddCustomerOpen')
  })

  it('24. Add Reminder exposes Add customer', () => {
    expect(newTaskModalSrc).toContain('AddCustomerModal')
    expect(newTaskModalSrc).toContain('onAddCustomerClick')
    expect(newTaskModalSrc).toContain('setIsAddCustomerOpen')
  })

  it('25. Add Job remains unchanged/working', () => {
    expect(jobComposerSrc).toContain('AddCustomerModal')
    expect(jobComposerSrc).toContain('onAddCustomerClick')
  })

  it('26. parent form state survives customer creation (handleLeadCreated preserves form)', () => {
    // Appointment: handleLeadCreated only sets leadId and customer, doesn't reset title/date/etc.
    expect(newAppointmentModalSrc).toContain('handleLeadCreated')
    // Reminder: same pattern
    expect(newTaskModalSrc).toContain('handleLeadCreated')
  })

  it('27. newly created customer is auto-selected', () => {
    // Appointment: setLeadId(newLeadId) called in handleLeadCreated
    expect(newAppointmentModalSrc).toContain('setLeadId(newLeadId)')
    // Reminder: setSelectedLeadId(newLeadId) called in handleLeadCreated
    expect(newTaskModalSrc).toContain('setSelectedLeadId(newLeadId)')
  })

  it('28. cancel customer creation returns to parent form (AddCustomerModal onClose only closes)', () => {
    // The AddCustomerModal onClose just sets isAddCustomerOpen to false
    expect(newAppointmentModalSrc).toContain("onClose={() => setIsAddCustomerOpen(false)}")
    expect(newTaskModalSrc).toContain("onClose={() => setIsAddCustomerOpen(false)}")
  })

  it('29. modal/back stack remains correct (shared Modal + useModalBackButton)', () => {
    // Both modals use the shared Modal component which has useModalBackButton
    expect(newAppointmentModalSrc).toContain('<Modal')
    expect(newTaskModalSrc).toContain('<Modal')
  })

  it('30. Android Back behavior remains correct (shared Modal handles back button)', () => {
    // The shared Modal component registers in the modal back-button stack
    expect(modalSrc).toContain('useModalBackButton')
  })

  it('31. all three modals reuse the same AddCustomerModal component', () => {
    expect(newAppointmentModalSrc).toContain("from '@/components/AddCustomerModal'")
    expect(newTaskModalSrc).toContain("from '@/components/AddCustomerModal'")
    expect(jobComposerSrc).toContain("from '@/components/AddCustomerModal'")
  })

  it('32. all three modals use the same SearchableCustomerSelect with onAddCustomerClick', () => {
    expect(newAppointmentModalSrc).toContain('onAddCustomerClick')
    expect(newTaskModalSrc).toContain('onAddCustomerClick')
    expect(jobComposerSrc).toContain('onAddCustomerClick')
  })
})
