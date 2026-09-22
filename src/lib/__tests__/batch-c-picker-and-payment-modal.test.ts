/**
 * Batch C — mobile customer picker positioning + payment request modal nav
 *
 * Verifies the customer picker stays below the trigger on mobile, uses the
 * visual viewport, and that the New Payment Request modal correctly suppresses
 * the persistent bottom nav.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8')

describe('SearchableCustomerSelect mobile below-only placement', () => {
  const picker = read('src/components/customers/SearchableCustomerSelect.tsx')

  it('measures space below from the visual viewport', () => {
    expect(picker).toContain('window.visualViewport')
    expect(picker).toContain('viewportBottom - pickerRect.bottom')
  })

  it('detects coarse-pointer (mobile) input and forces the dropdown below the trigger', () => {
    expect(picker).toContain("matchMedia('(pointer: coarse)')")
    expect(picker).toContain('ontouchstart')
    expect(picker).toContain('const forceBelow = isCoarsePointer || isTouchFallback')
    expect(picker).toContain('const useDropup = !forceBelow')
    expect(picker).toContain('setDropup(useDropup)')
  })

  it('does not flip above on mobile even when space above is larger', () => {
    expect(picker).toMatch(/spaceAbove > spaceBelow\s*&&\s*\(spaceAbove - safeGap\) >= 160/)
    expect(picker).toContain('!forceBelow &&')
  })

  it('caps max height to the actual available space below', () => {
    expect(picker).toContain('Math.min(desiredMax, Math.max(available, 0))')
    expect(picker).not.toMatch(/Math\.max\(available,\s*160\)/)
  })

  it('recalculates on visual viewport resize/scroll', () => {
    expect(picker).toContain("vv.addEventListener('resize', measure)")
    expect(picker).toContain("vv.addEventListener('scroll', measure)")
  })

  it('keeps the results list scrollable and the search trigger fixed', () => {
    expect(picker).toContain('overflow-y-auto')
    expect(picker).toContain('flex-1')
    expect(picker).toContain('min-h-0')
    expect(picker).toContain('overscroll-contain')
    expect(picker).toContain('touch-pan-y')
  })

  it('preserves the prior no-bleed selection contract', () => {
    expect(picker).toContain('e.preventDefault()')
    expect(picker).toContain('e.stopPropagation()')
    expect(picker).toContain('pointerDownInsideRef')
  })
})

describe('New Payment Request modal viewport ownership', () => {
  const modal = read('src/components/ui/Modal.tsx')
  const paymentModal = read('src/components/payments/PaymentsNewRequestModal.tsx')
  const requestModal = read('src/components/payments/RequestPaymentModal.tsx')
  const globalsCss = read('src/app/globals.css')
  const bottomNav = read('src/components/BottomNavigation.tsx')

  it('Payment Request modal uses the shared Modal with fullScreen overlay', () => {
    expect(paymentModal).toContain('fullScreen')
    expect(modal).toContain('fullScreen?: boolean')
    expect(modal).toContain('fixed inset-0 z-[60]')
  })

  it('shared Modal uses useBodyScrollLock, which owns the data-modal-open contract', () => {
    const scrollLock = read('src/hooks/useBodyScrollLock.ts')
    expect(modal).toContain('useBodyScrollLock')
    expect(scrollLock).toContain("document.body.setAttribute('data-modal-open', 'true')")
    expect(scrollLock).toContain("document.body.removeAttribute('data-modal-open')")
  })

  it('Payment Request modal lifecycle activates chrome-covered via the shared lock', () => {
    const scrollLock = read('src/hooks/useBodyScrollLock.ts')
    expect(paymentModal).toMatch(/<Modal[\s\S]*?title="New Payment Request"/)
    expect(paymentModal).toMatch(/<Modal[\s\S]*?fullScreen/)
    expect(scrollLock).toContain('data-chrome-covered')
    expect(scrollLock).toContain("document.body.setAttribute('data-chrome-covered'")
  })

  it('BottomNavigation observes the shared modal attribute', () => {
    expect(bottomNav).toContain('data-modal-open')
    expect(bottomNav).toContain('isModalOpen')
    expect(bottomNav).toContain('(isModalOpen && !isMoreMenuOpen)')
  })

  it('nav element is keyed for the synchronous CSS suppression rule', () => {
    expect(bottomNav).toContain('data-bottom-nav')
    expect(bottomNav).toContain('<nav data-bottom-nav')
  })

  it('globals.css immediately hides the keyed nav when chrome is covered', () => {
    expect(globalsCss).toContain("body[data-chrome-covered='true'] nav[data-bottom-nav]")
    expect(globalsCss).toContain('display: none !important')
  })

  it('globals.css zeroes bottom-nav height while chrome is covered', () => {
    expect(globalsCss).toContain("body[data-chrome-covered='true'] {")
    expect(globalsCss).toContain('--bottom-nav-height: 0px !important')
  })

  it('does not hide nav for chrome-owned overlays like More menu', () => {
    expect(globalsCss).toMatch(/body\[data-chrome-covered='true'\][^}]*nav\[data-bottom-nav\][^}]*display:\s*none/)
    expect(bottomNav).toContain("useBodyScrollLock(isMoreMenuOpen, 'MoreMenu')")
    // More menu is in CHROME_OWNED_OVERLAY_OWNERS, so data-chrome-covered is not set for it
    expect(read('src/hooks/useBodyScrollLock.ts')).toContain('MoreMenu')
    expect(read('src/hooks/useBodyScrollLock.ts')).toContain('CHROME_OWNED_OVERLAY_OWNERS')
  })

  it('modal content is constrained by --modal-max-height and scrolls internally', () => {
    expect(modal).toContain('max-h-[var(--modal-max-height)]')
    expect(modal).toContain('overflow-y-auto')
    expect(modal).toContain('flex flex-col')
    expect(globalsCss).toContain('--modal-max-height')
  })

  it('safe-area insets remain for the modal shell', () => {
    expect(modal).toContain('env(safe-area-inset-bottom)')
    expect(modal).toContain('env(safe-area-inset-top)')
    expect(globalsCss).toContain('--modal-bottom-reserve')
  })
})

describe('Customer picker + modal physical retest contracts', () => {
  const picker = read('src/components/customers/SearchableCustomerSelect.tsx')
  const paymentModal = read('src/components/payments/PaymentsNewRequestModal.tsx')

  it('customer picker still allows + Create New Customer hook when provided', () => {
    expect(picker).toContain('onAddCustomerClick')
    expect(picker).toContain('Add customer')
  })

  it('customer picker rows use click with stopPropagation', () => {
    expect(picker).toMatch(/onClick=\{[^}]*handleSelect/)
    expect(picker).toContain('stopPropagation')
  })

  it('payment request modal keeps the footer Send/Cancel actions', () => {
    expect(paymentModal).toContain('Cancel')
    expect(paymentModal).toContain('Send Payment Request')
    expect(paymentModal).toContain('footer={')
  })

  it('payment request modal customer change path remains wired', () => {
    expect(paymentModal).toContain('onChangeCustomer')
    expect(paymentModal).toContain('Change')
  })
})
