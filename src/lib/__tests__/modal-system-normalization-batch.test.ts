/**
 * Global Mobile Modal System Normalization — Regression Tests
 *
 * CONTRACT 1: Blocking modal activates global modal-open state
 * CONTRACT 2: Mobile nav is suppressed with one modal
 * CONTRACT 3: Mobile nav remains suppressed with multiple/nested blocking modals
 * CONTRACT 4: Nav restores after final modal closes
 * CONTRACT 5: Modal shell is viewport-constrained and mobile-scrollable
 * CONTRACT 6: Short modal uses centered layout
 * CONTRACT 7: Tall modal uses max-height/internal scrolling
 * CONTRACT 8: Backdrop uses canonical overlay
 * CONTRACT 9: Footer/actions remain outside scrollable body where appropriate
 * CONTRACT 10: PaymentEditModal retains View Customer navigation suppression semantics
 * CONTRACT 11: Android/back history hooks remain wired
 * CONTRACT 12: Destructive modal still retains its destructive variant/requirements
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const modalSrc = readSrc('src/components/ui/Modal.tsx')
const scrollLockSrc = readSrc('src/hooks/useBodyScrollLock.ts')
const bottomNavSrc = readSrc('src/components/BottomNavigation.tsx')
const modalBackButtonSrc = readSrc('src/lib/modalBackButton.ts')
const useModalBackButtonSrc = readSrc('src/hooks/useModalBackButton.ts')
const paymentEditModalSrc = readSrc('src/components/payments/PaymentEditModal.tsx')
const settingsContentSrc = readSrc('src/components/SettingsContent.tsx')
const importContactsModalSrc = readSrc('src/components/ImportContactsModal.tsx')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const globalsCssSrc = readSrc('src/app/globals.css')

// ============================================================================
// CONTRACT 1 — Blocking modal activates global modal-open state
// ============================================================================
describe('CONTRACT 1: Blocking modal activates global modal-open state', () => {
  it('useBodyScrollLock sets data-modal-open on body when first lock is acquired', () => {
    expect(scrollLockSrc).toContain("document.body.setAttribute('data-modal-open', 'true')")
  })

  it('useBodyScrollLock removes data-modal-open when last lock is released', () => {
    expect(scrollLockSrc).toContain("document.body.removeAttribute('data-modal-open')")
  })

  it('useBodyScrollLock sets the attribute inside the first-lock block (reference counted)', () => {
    // The setAttribute call must be inside the `if (lockCount === 0)` block
    // so nested modals don't toggle it off prematurely.
    const firstLockIdx = scrollLockSrc.indexOf('if (lockCount === 0) {')
    expect(firstLockIdx).toBeGreaterThan(-1)
    const setAttrIdx = scrollLockSrc.indexOf("setAttribute('data-modal-open', 'true')", firstLockIdx)
    expect(setAttrIdx).toBeGreaterThan(firstLockIdx)
  })

  it('useBodyScrollLock removes the attribute inside the last-unlock block', () => {
    const lastUnlockIdx = scrollLockSrc.indexOf('if (lockCount === 0) {', scrollLockSrc.indexOf('const unlock = () =>'))
    expect(lastUnlockIdx).toBeGreaterThan(-1)
    const removeAttrIdx = scrollLockSrc.indexOf("removeAttribute('data-modal-open')", lastUnlockIdx)
    expect(removeAttrIdx).toBeGreaterThan(lastUnlockIdx)
  })

  it('reconcileScrollLock also maintains the data-modal-open attribute', () => {
    expect(scrollLockSrc).toContain("setAttribute('data-modal-open', 'true')")
    expect(scrollLockSrc).toContain("removeAttribute('data-modal-open')")
  })
})

// ============================================================================
// CONTRACT 2 — Mobile nav is suppressed with one modal
// ============================================================================
describe('CONTRACT 2: Mobile nav is suppressed with one modal', () => {
  it('BottomNavigation observes data-modal-open on body', () => {
    expect(bottomNavSrc).toContain("data-modal-open")
  })

  it('BottomNavigation has an isModalOpen state variable', () => {
    expect(bottomNavSrc).toContain('isModalOpen')
  })

  it('BottomNavigation hideNav includes isModalOpen', () => {
    expect(bottomNavSrc).toMatch(/hideNav\s*=.*isModalOpen/)
  })

  it('BottomNavigation uses a MutationObserver to react to data-modal-open changes', () => {
    expect(bottomNavSrc).toContain("attributeFilter: ['data-modal-open']")
  })
})

// ============================================================================
// CONTRACT 3 — Mobile nav remains suppressed with multiple/nested modals
// ============================================================================
describe('CONTRACT 3: Mobile nav remains suppressed with multiple/nested blocking modals', () => {
  it('useBodyScrollLock is reference-counted (lockCount increments per lock)', () => {
    expect(scrollLockSrc).toContain('lockCount++')
    expect(scrollLockSrc).toContain('lockCount--')
  })

  it('data-modal-open is only removed when lockCount reaches 0', () => {
    // The removeAttribute must be inside the `if (lockCount === 0)` block of unlock
    const unlockIdx = scrollLockSrc.indexOf('const unlock = () =>')
    const lastZeroIdx = scrollLockSrc.indexOf('if (lockCount === 0) {', unlockIdx)
    const removeAttrIdx = scrollLockSrc.indexOf("removeAttribute('data-modal-open')", lastZeroIdx)
    expect(removeAttrIdx).toBeGreaterThan(lastZeroIdx)
    // And the removeAttribute must come BEFORE the next lockCount check or end of block
    const nextLockIdx = scrollLockSrc.indexOf('lockCount', removeAttrIdx)
    expect(nextLockIdx === -1 || nextLockIdx > removeAttrIdx).toBe(true)
  })
})

// ============================================================================
// CONTRACT 4 — Nav restores after final modal closes
// ============================================================================
describe('CONTRACT 4: Nav restores after final modal closes', () => {
  it('BottomNavigation does not hard-hide nav — it reacts to attribute removal', () => {
    // The observer pattern means when data-modal-open is removed, isModalOpen
    // becomes false and hideNav recomputes to restore nav.
    expect(bottomNavSrc).toContain('checkModalOpen')
  })

  it('useBodyScrollLock restore path removes the attribute (so nav reappears)', () => {
    expect(scrollLockSrc).toContain("document.body.removeAttribute('data-modal-open')")
  })
})

// ============================================================================
// CONTRACT 5 — Modal shell is viewport-constrained and mobile-scrollable
// ============================================================================
describe('CONTRACT 5: Modal shell is viewport-constrained and mobile-scrollable', () => {
  it('Modal uses max-h with --modal-max-height CSS variable', () => {
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('globals.css defines --modal-max-height accounting for bottom nav + safe area', () => {
    expect(globalsCssSrc).toContain('--modal-max-height')
    expect(globalsCssSrc).toContain('--bottom-nav-height')
  })

  it('Modal body is internally scrollable (overflow-y-auto)', () => {
    expect(modalSrc).toContain('overflow-y-auto')
  })

  it('Modal body has data-scroll-lock-allow for touch scrolling', () => {
    expect(modalSrc).toContain('data-scroll-lock-allow')
  })

  it('Modal body uses overscroll-contain to prevent scroll chaining', () => {
    expect(modalSrc).toContain('overscroll-contain')
  })
})

// ============================================================================
// CONTRACT 6 — Short modal uses centered layout
// ============================================================================
describe('CONTRACT 6: Short modal uses centered layout', () => {
  it('Modal centers content on mobile (items-center) by default', () => {
    expect(modalSrc).toContain('items-center')
  })

  it('Modal centers content on desktop (md:items-center)', () => {
    expect(modalSrc).toContain('md:items-center')
  })

  it('Modal has horizontal gutter on mobile (px-4)', () => {
    expect(modalSrc).toContain('px-4')
  })

  it('Modal has top breathing room respecting safe area', () => {
    expect(modalSrc).toContain('env(safe-area-inset-top)')
  })
})

// ============================================================================
// CONTRACT 7 — Tall modal uses max-height/internal scrolling
// ============================================================================
describe('CONTRACT 7: Tall modal uses max-height/internal scrolling', () => {
  it('Modal container has max-h constraint', () => {
    expect(modalSrc).toContain('max-h-[var(--modal-max-height)]')
  })

  it('Modal container uses flex flex-col with min-h-0 for proper flex scrolling', () => {
    expect(modalSrc).toContain('flex flex-col')
    expect(modalSrc).toContain('min-h-0')
  })

  it('Modal body is flex-1 so it grows/shrinks within the constrained shell', () => {
    expect(modalSrc).toContain('flex-1')
  })

  it('Modal header is shrink-0 so it stays fixed while body scrolls', () => {
    expect(modalSrc).toContain('shrink-0')
  })
})

// ============================================================================
// CONTRACT 8 — Backdrop uses canonical overlay
// ============================================================================
describe('CONTRACT 8: Backdrop uses canonical overlay', () => {
  it('Modal backdrop uses z-[60] (above bottom nav z-50)', () => {
    expect(modalSrc).toContain('z-[60]')
  })

  it('Modal backdrop uses consistent opacity (bg-black/50)', () => {
    expect(modalSrc).toContain('bg-black/50')
  })

  it('Modal backdrop uses consistent blur (backdrop-blur-sm)', () => {
    expect(modalSrc).toContain('backdrop-blur-sm')
  })

  it('Modal backdrop covers the entire usable screen (fixed inset-0)', () => {
    expect(modalSrc).toContain('fixed inset-0')
  })

  it('Modal backdrop intercepts pointer/touch (onPointerDown handler)', () => {
    expect(modalSrc).toContain('onPointerDown')
  })
})

// ============================================================================
// CONTRACT 9 — Footer/actions remain outside scrollable body
// ============================================================================
describe('CONTRACT 9: Footer/actions remain outside scrollable body', () => {
  it('Modal renders footer as a sibling of the scrollable body (not inside it)', () => {
    expect(modalSrc).toContain('{footer && (')
  })

  it('Modal footer is shrink-0 so it does not scroll away', () => {
    expect(modalSrc).toContain('shrink-0')
  })

  it('Modal footer has border-t to visually separate from body', () => {
    expect(modalSrc).toContain('border-t')
  })

  it('Modal footer applies safe-area bottom padding', () => {
    expect(modalSrc).toContain('env(safe-area-inset-bottom)')
  })
})

// ============================================================================
// CONTRACT 10 — PaymentEditModal retains View Customer navigation suppression
// ============================================================================
describe('CONTRACT 10: PaymentEditModal retains View Customer navigation suppression', () => {
  it('PaymentEditModal imports suppressNextHistoryBackCleanup', () => {
    expect(paymentEditModalSrc).toContain('suppressNextHistoryBackCleanup')
  })

  it('PaymentEditModal calls suppression before onClose and onViewCustomer', () => {
    const suppressIdx = paymentEditModalSrc.indexOf('suppressNextHistoryBackCleanup()')
    expect(suppressIdx).toBeGreaterThan(-1)
    const onViewCustomerIdx = paymentEditModalSrc.indexOf('onViewCustomer(customerId)', suppressIdx)
    expect(onViewCustomerIdx).toBeGreaterThan(suppressIdx)
  })

  it('modalBackButton exports consumeHistoryBackSuppression', () => {
    expect(modalBackButtonSrc).toContain('consumeHistoryBackSuppression')
  })

  it('modalBackButton exports suppressNextHistoryBackCleanup', () => {
    expect(modalBackButtonSrc).toContain('suppressNextHistoryBackCleanup')
  })
})

// ============================================================================
// CONTRACT 11 — Android/back history hooks remain wired
// ============================================================================
describe('CONTRACT 11: Android/back history hooks remain wired', () => {
  it('Modal uses useModalBackButton', () => {
    expect(modalSrc).toContain('useModalBackButton')
  })

  it('useModalBackButton registers with the module-level modal stack', () => {
    expect(useModalBackButtonSrc).toContain('registerModal') 
    expect(useModalBackButtonSrc).toContain('unregisterModal')
  })

  it('modalBackButton maintains a modal stack array', () => {
    expect(modalBackButtonSrc).toContain('modalStack')
  })

  it('modalBackButton exposes hasOpenModal for Capacitor back handler', () => {
    expect(modalBackButtonSrc).toContain('hasOpenModal')
  })

  it('Modal uses useBodyScrollLock for scroll lock + data-modal-open attribute', () => {
    expect(modalSrc).toContain('useBodyScrollLock')
  })
})

// ============================================================================
// CONTRACT 13 — Transient overlays (dropdowns/popovers) consume hardware back
// ============================================================================
describe('CONTRACT 13: Transient overlays consume hardware back without history', () => {
  it('modalBackButton exports transient overlay registration functions', () => {
    expect(modalBackButtonSrc).toContain('registerTransientOverlay')
    expect(modalBackButtonSrc).toContain('unregisterTransientOverlay')
    expect(modalBackButtonSrc).toContain('hasOpenTransientOverlay')
    expect(modalBackButtonSrc).toContain('handleTransientOverlayBackButton')
  })

  it('transient overlay stack is separate from modal stack', () => {
    expect(modalBackButtonSrc).toContain('const transientOverlayStack')
    expect(modalBackButtonSrc).not.toContain('const transientOverlayStack: Array<() => void> = modalStack')
  })

  it('Capacitor back handler checks transient overlays before modals', () => {
    const initSrc = readSrc('src/capacitor/init.ts')
    const backIdx = initSrc.indexOf("App.addListener('backButton'")
    expect(backIdx).toBeGreaterThan(-1)
    const afterBack = initSrc.slice(backIdx, backIdx + 1200)
    expect(afterBack).toContain('hasOpenTransientOverlay')
    expect(afterBack).toContain('handleTransientOverlayBackButton')
    expect(afterBack).toContain('hasOpenModal')
    expect(afterBack).toContain('handleCapacitorBackButton')
    // transient check must come before modal check
    expect(afterBack.indexOf('hasOpenTransientOverlay')).toBeLessThan(afterBack.indexOf('hasOpenModal'))
  })
})

// ============================================================================
// CONTRACT 12 — Destructive modal retains destructive variant/requirements
// ============================================================================
describe('CONTRACT 12: Destructive modal retains destructive variant/requirements', () => {
  it('SettingsContent Delete Account modal uses the shared Modal component', () => {
    // The Delete Account modal must be migrated to the shared Modal but
    // retain its destructive semantics (red button, DELETE confirmation).
    const deleteModalIdx = settingsContentSrc.indexOf('Delete Account Modal')
    expect(deleteModalIdx).toBeGreaterThan(-1)
    const afterDeleteModal = settingsContentSrc.slice(deleteModalIdx, deleteModalIdx + 200)
    expect(afterDeleteModal).toContain('<Modal')
  })

  it('SettingsContent Delete Account modal retains DELETE confirmation input', () => {
    expect(settingsContentSrc).toContain("deleteConfirmText !== 'DELETE'")
  })

  it('SettingsContent Delete Account modal retains red destructive button', () => {
    expect(settingsContentSrc).toContain('bg-red-600')
  })

  it('SettingsContent Delete Account modal retains password confirmation', () => {
    expect(settingsContentSrc).toContain('deletePassword')
  })
})

// ============================================================================
// Migration verification — hand-built modals moved to shared Modal
// ============================================================================
describe('Migration: hand-built modals moved to shared Modal', () => {
  it('SettingsContent Change Email modal uses shared Modal (not hand-built z-50)', () => {
    const changeEmailIdx = settingsContentSrc.indexOf('Change Email Modal')
    expect(changeEmailIdx).toBeGreaterThan(-1)
    const afterChangeEmail = settingsContentSrc.slice(changeEmailIdx, changeEmailIdx + 200)
    expect(afterChangeEmail).toContain('<Modal')
    expect(afterChangeEmail).not.toContain('fixed inset-0')
  })

  it('SettingsContent Switch to Business Number modal uses shared Modal', () => {
    const switchIdx = settingsContentSrc.indexOf('Business Number Confirmation Modal')
    expect(switchIdx).toBeGreaterThan(-1)
    const afterSwitch = settingsContentSrc.slice(switchIdx, switchIdx + 200)
    expect(afterSwitch).toContain('<Modal')
    expect(afterSwitch).not.toContain('fixed inset-0')
  })

  it('SettingsContent Add Personal Contact modal uses shared Modal', () => {
    const addIdx = settingsContentSrc.indexOf('Add Personal Contact Modal')
    expect(addIdx).toBeGreaterThan(-1)
    const afterAdd = settingsContentSrc.slice(addIdx, addIdx + 200)
    expect(afterAdd).toContain('<Modal')
    expect(afterAdd).not.toContain('fixed inset-0')
  })

  it('SettingsContent Stripe Connect Loading modal uses shared Modal', () => {
    const stripeIdx = settingsContentSrc.indexOf('Stripe Connect Loading Modal')
    expect(stripeIdx).toBeGreaterThan(-1)
    const afterStripe = settingsContentSrc.slice(stripeIdx, stripeIdx + 200)
    expect(afterStripe).toContain('<Modal')
    expect(afterStripe).not.toContain('fixed inset-0')
  })

  it('SettingsContent Tap to Pay Education Confirmation modal uses shared Modal', () => {
    const tapIdx = settingsContentSrc.indexOf('Tap to Pay Education Confirmation Modal')
    expect(tapIdx).toBeGreaterThan(-1)
    const afterTap = settingsContentSrc.slice(tapIdx, tapIdx + 200)
    expect(afterTap).toContain('<Modal')
    expect(afterTap).not.toContain('fixed inset-0')
  })

  it('ImportContactsModal uses shared Modal (not hand-built z-50)', () => {
    expect(importContactsModalSrc).toContain("from '@/components/ui/Modal'")
    expect(importContactsModalSrc).not.toContain('fixed inset-0 bg-black/50 flex items-center justify-center z-50')
  })

  it('ImportContactsModal no longer calls useBodyScrollLock directly (Modal owns it)', () => {
    expect(importContactsModalSrc).not.toContain('useBodyScrollLock')
  })

  it('payments/page.tsx Mark as Paid confirm uses shared Modal', () => {
    const markPaidIdx = paymentsPageSrc.indexOf('Mark as Paid Confirmation Modal')
    expect(markPaidIdx).toBeGreaterThan(-1)
    const afterMarkPaid = paymentsPageSrc.slice(markPaidIdx, markPaidIdx + 300)
    expect(afterMarkPaid).toContain('<Modal')
    expect(afterMarkPaid).not.toContain('fixed inset-0 z-50')
  })

  it('payments/page.tsx no longer has a hand-built popstate listener for mark-paid confirm', () => {
    expect(paymentsPageSrc).not.toContain('rfMarkPaidConfirm')
  })

  it('payments/page.tsx no longer imports useBodyScrollLock (Modal owns it)', () => {
    expect(paymentsPageSrc).not.toContain("import { useBodyScrollLock }")
  })
})

// ============================================================================
// Z-index normalization — hand-built modals elevated above bottom nav
// ============================================================================
describe('Z-index normalization: hand-built modals elevated above bottom nav (z-50)', () => {
  it('BusinessPhoneModal uses z-[60] (not z-50)', () => {
    const src = readSrc('src/components/BusinessPhoneModal.tsx')
    expect(src).not.toContain('fixed inset-0 z-50')
    expect(src).toContain('z-[60]')
  })

  it('EventComposer uses z-[60] (not z-50)', () => {
    const src = readSrc('src/components/calendar/EventComposer.tsx')
    expect(src).not.toContain('fixed inset-0 z-50')
    expect(src).toContain('z-[60]')
  })

  it('DayDetailModal uses z-[60] (not z-50)', () => {
    const src = readSrc('src/components/calendar/DayDetailModal.tsx')
    expect(src).not.toContain('fixed inset-0 z-50')
    expect(src).toContain('z-[60]')
  })

  it('AppointmentSmsModal uses z-[60] (not z-50)', () => {
    const src = readSrc('src/components/calendar/AppointmentSmsModal.tsx')
    expect(src).not.toContain('fixed inset-0 z-50')
    expect(src).toContain('z-[60]')
  })

  it('BetaFeedbackModal uses z-[60] (not z-50)', () => {
    const src = readSrc('src/components/BetaFeedbackModal.tsx')
    expect(src).not.toContain('fixed inset-0 z-50')
    expect(src).toContain('z-[60]')
  })

  it('FollowUpSettings uses z-[60] (not z-50)', () => {
    const src = readSrc('src/components/FollowUpSettings.tsx')
    expect(src).not.toContain('fixed inset-0 z-50')
    expect(src).toContain('z-[60]')
  })

  it('leads/[id]/page-client.tsx customer details (mobile) uses z-[60] (not z-50)', () => {
    const src = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(src).not.toContain('md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-50')
    expect(src).toContain('md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end justify-center z-[60]')
  })

  it('leads/[id]/page-client.tsx customer details (desktop) uses z-[60] (not z-50)', () => {
    const src = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(src).not.toContain('hidden md:block fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50')
    expect(src).toContain('hidden md:block fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]')
  })

  it('leads/[id]/page-client.tsx request payment modal uses z-[60] (not z-50)', () => {
    const src = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(src).not.toContain('fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm')
    expect(src).toContain('fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm')
  })
})

// ============================================================================
// CONTRACT 13 — Photo lightbox uses the shared global overlay layer
// ============================================================================
const photoModalSrc = readSrc('src/components/PhotoModal.tsx')
const appHeaderSrc = readSrc('src/components/AppHeader.tsx')

describe('CONTRACT 13: Photo lightbox uses the shared global overlay layer', () => {
  it('PhotoModal portals its overlay to document.body', () => {
    expect(photoModalSrc).toContain("createPortal(lightbox, document.body)")
  })

  it('PhotoModal uses the same blocking overlay z-index as the shared Modal', () => {
    expect(photoModalSrc).toContain('z-[60]')
    expect(photoModalSrc).not.toContain('z-[200]')
  })

  it('PhotoModal keeps an edge-to-edge backdrop with bg-black/90', () => {
    expect(photoModalSrc).toContain('fixed inset-0')
    expect(photoModalSrc).toContain('bg-black/90')
  })

  it('AppHeader observes chrome-covered state with useLayoutEffect to hide before paint', () => {
    const headerEffect = appHeaderSrc.match(/useLayoutEffect\(\(\) => \{[\s\S]*?data-chrome-covered[\s\S]*?\}, \[\]\)/)?.[0] || ''
    expect(headerEffect).toContain("data-chrome-covered")
    expect(headerEffect).toContain('MutationObserver')
  })

  it('BottomNavigation observes data-modal-open with useLayoutEffect to hide before paint', () => {
    const navEffect = bottomNavSrc.match(/useLayoutEffect\(\(\) => \{[\s\S]*?data-modal-open[\s\S]*?\}, \[\]\)/)?.[0] || ''
    expect(navEffect).toContain("data-modal-open")
    expect(navEffect).toContain('MutationObserver')
  })
})
