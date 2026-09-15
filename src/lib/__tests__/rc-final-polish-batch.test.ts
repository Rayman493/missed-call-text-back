/**
 * RC — Final Polish & Launch Messaging Batch
 *
 * Regression tests for the final known-issues cleanup batch covering:
 * 1. iOS modal background scroll lock (shared lock lifecycle)
 * 2. iOS scroll-lock leak after sign out/in (auth transition reset)
 * 3. Mobile bottom-nav responsiveness (pending destination state)
 * 4. iOS Tap to Pay icon contrast (white glyph on green card)
 * 5. Quotes & Invoices empty-state creation CTA
 * 6. Per-unit unit selector (select with custom support)
 * 7. Draft Quote/Invoice Send action on card
 * 8. Dashboard Activity card density (4-6 events)
 * 9. Quotes/Invoices marketing parity
 *
 * These are source-level assertions that verify the implementation
 * matches the required behavior without rendering components (matching
 * the existing RC test pattern).
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) =>
  readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const scrollLockSrc = readSrc('src/hooks/useBodyScrollLock.ts')
const bottomNavSrc = readSrc('src/components/BottomNavigation.tsx')
const mobileDrawerSrc = readSrc('src/components/MobileDrawer.tsx')
const authContextSrc = readSrc('src/contexts/AuthContext.tsx')
const authPageSrc = readSrc('src/app/auth/page.tsx')
const paymentsPageSrc = readSrc('src/app/dashboard/payments/page.tsx')
const billingListSrc = readSrc('src/components/billing/BillingDocumentList.tsx')
const billingEditorSrc = readSrc('src/components/billing/BillingEditorModal.tsx')
const activityCardSrc = readSrc('src/components/RecentActivityCard.tsx')
const homePageSrc = readSrc('src/app/(public)/home/page.tsx')
const publicPageSrc = readSrc('src/app/(public)/page.tsx')
const faqPageSrc = readSrc('src/app/(public)/faq/page.tsx')
const pricingPageSrc = readSrc('src/app/(public)/pricing/page.tsx')
const layoutSrc = readSrc('src/app/layout.tsx')
const homeLayoutSrc = readSrc('src/app/(public)/home/layout.tsx')
const footerSrc = readSrc('src/components/Footer.tsx')
const downloadPageSrc = readSrc('src/app/download/page.tsx')
const interactiveDemoSrc = readSrc('src/components/InteractiveDemoWalkthrough.tsx')
const homepageDemoSrc = readSrc('src/components/HomepageInteractiveDemo.tsx')

// ============================================================================
// 1. iOS MODAL BACKGROUND SCROLL LOCK
// ============================================================================
describe('1. iOS MODAL BACKGROUND SCROLL LOCK', () => {
  it('1. useBodyScrollLock exports resetAllScrollLocks for auth transitions', () => {
    expect(scrollLockSrc).toContain('export function resetAllScrollLocks')
  })

  it('2. resetAllScrollLocks resets lockCount to 0', () => {
    expect(scrollLockSrc).toContain('lockCount = 0')
  })

  it('3. resetAllScrollLocks clears activeOwners', () => {
    expect(scrollLockSrc).toContain('activeOwners.clear()')
  })

  it('4. resetAllScrollLocks restores body overflow', () => {
    expect(scrollLockSrc).toMatch(/document\.body\.style\.overflow = originalBodyOverflow/)
  })

  it('5. resetAllScrollLocks restores html position/width', () => {
    expect(scrollLockSrc).toContain('document.documentElement.style.position = originalHtmlPosition')
    expect(scrollLockSrc).toContain('document.documentElement.style.width = originalHtmlWidth')
  })

  it('6. resetAllScrollLocks removes data-modal-open attribute', () => {
    expect(scrollLockSrc).toContain("document.body.removeAttribute('data-modal-open')")
  })

  it('7. First lock captures html position/width originals', () => {
    expect(scrollLockSrc).toContain('originalHtmlPosition = document.documentElement.style.position')
    expect(scrollLockSrc).toContain('originalHtmlWidth = document.documentElement.style.width')
  })

  it('8. First lock applies html position:fixed for iOS scroll prevention', () => {
    expect(scrollLockSrc).toContain("document.documentElement.style.position = 'fixed'")
    expect(scrollLockSrc).toContain("document.documentElement.style.width = '100%'")
  })

  it('9. Final unlock restores html position/width', () => {
    // The unlock path must restore originalHtmlPosition and originalHtmlWidth
    expect(scrollLockSrc).toContain('document.documentElement.style.position = originalHtmlPosition')
    expect(scrollLockSrc).toContain('document.documentElement.style.width = originalHtmlWidth')
  })

  it('10. window touchmove listener added on first lock for iOS portal content', () => {
    expect(scrollLockSrc).toContain("window.addEventListener('touchmove', preventTouchMove")
  })

  it('11. window touchmove listener removed on final unlock', () => {
    expect(scrollLockSrc).toContain("window.removeEventListener('touchmove', preventTouchMove")
  })

  it('12. reconcileScrollLock handles html position/width state', () => {
    expect(scrollLockSrc).toContain('document.documentElement.style.position = originalHtmlPosition')
  })
})

// ============================================================================
// 2. iOS SCROLL LOCK LEAK AFTER SIGN OUT/IN
// ============================================================================
describe('2. iOS SCROLL LOCK LEAK AFTER SIGN OUT/IN', () => {
  it('13. AuthContext imports resetAllScrollLocks', () => {
    expect(authContextSrc).toContain("import { resetAllScrollLocks } from '@/hooks/useBodyScrollLock'")
  })

  it('14. AuthContext calls resetAllScrollLocks before redirect on sign out', () => {
    expect(authContextSrc).toContain('resetAllScrollLocks()')
  })

  it('15. Auth page imports resetAllScrollLocks', () => {
    expect(authPageSrc).toContain("import { resetAllScrollLocks } from '@/hooks/useBodyScrollLock'")
  })

  it('16. Auth page calls resetAllScrollLocks before navigating to dashboard', () => {
    expect(authPageSrc).toContain('resetAllScrollLocks()')
  })

  it('17. BottomNavigation closes More menu BEFORE signOut', () => {
    // The handleLogout must call setIsMoreMenuOpen(false) before signOut
    const logoutMatch = bottomNavSrc.match(/handleLogout[\s\S]*?}/)
    expect(logoutMatch).toBeTruthy()
    const logoutBody = logoutMatch![0]
    const moreMenuIdx = logoutBody.indexOf('setIsMoreMenuOpen(false)')
    const signOutIdx = logoutBody.indexOf('signOut')
    expect(moreMenuIdx).toBeGreaterThan(-1)
    expect(signOutIdx).toBeGreaterThan(-1)
    expect(moreMenuIdx).toBeLessThan(signOutIdx)
  })

  it('18. BottomNavigation does NOT call router.push after signOut (signOut already redirects)', () => {
    // Extract the handleLogout function body. Verify it does not contain
    // an actual router.push('/') call (comments mentioning it are OK).
    const logoutMatch = bottomNavSrc.match(/handleLogout = async [\s\S]*?\n  \}/)
    expect(logoutMatch).toBeTruthy()
    const logoutBody = logoutMatch![0]
    // Remove comment lines before checking for router.push calls
    const withoutComments = logoutBody.replace(/\/\/[^\n]*/g, '')
    // signOut already calls router.push internally; duplicate push removed
    expect(withoutComments).not.toMatch(/router\.push\(['"]\/['"]\)/)
  })

  it('19. MobileDrawer closes drawer BEFORE signOut', () => {
    const signOutMatch = mobileDrawerSrc.match(/handleSignOut[\s\S]*?^  }/m)
    expect(signOutMatch).toBeTruthy()
    const body = signOutMatch![0]
    const onCloseIdx = body.indexOf('onClose()')
    const signOutIdx = body.indexOf('signOut')
    expect(onCloseIdx).toBeGreaterThan(-1)
    expect(signOutIdx).toBeGreaterThan(-1)
    expect(onCloseIdx).toBeLessThan(signOutIdx)
  })
})

// ============================================================================
// 3. MOBILE BOTTOM NAV RESPONSIVENESS
// ============================================================================
describe('3. MOBILE BOTTOM NAV RESPONSIVENESS', () => {
  it('20. BottomNavigation has pendingHref state for immediate visual feedback', () => {
    expect(bottomNavSrc).toContain('pendingHref')
    expect(bottomNavSrc).toMatch(/useState<string \| null>\(null\)/)
  })

  it('21. pendingHref is set on nav tab click for immediate feedback', () => {
    expect(bottomNavSrc).toContain('setPendingHref(item.href)')
  })

  it('22. pendingHref reconciles to pathname via effect', () => {
    expect(bottomNavSrc).toMatch(/if \(pendingHref && pathname === pendingHref\)/)
    expect(bottomNavSrc).toContain('setPendingHref(null)')
  })

  it('23. isActive considers pendingHref for immediate highlight', () => {
    expect(bottomNavSrc).toContain('if (pendingHref === href)')
    expect(bottomNavSrc).toMatch(/return true/)
  })

  it('24. isActive still reconciles to pathname as source of truth', () => {
    // pathname-based check must remain
    expect(bottomNavSrc).toContain("pathname === '/dashboard'")
    expect(bottomNavSrc).toMatch(/pathname\?\.startsWith\(href\)/)
  })
})

// ============================================================================
// 4. iOS TAP TO PAY ICON CONTRAST
// ============================================================================
describe('4. iOS TAP TO PAY ICON CONTRAST', () => {
  it('25. Green Tap to Pay card passes explicit white color to icon', () => {
    expect(paymentsPageSrc).toContain('color="#ffffff"')
  })

  it('26. Green Tap to Pay card icon retains text-white className', () => {
    expect(paymentsPageSrc).toContain('className="text-white dark:text-white"')
  })
})

// ============================================================================
// 5. QUOTES & INVOICES EMPTY-STATE CREATION CTA
// ============================================================================
describe('5. QUOTES & INVOICES EMPTY-STATE CREATION CTA', () => {
  it('27. BillingDocumentList accepts billingTypeFilter prop', () => {
    expect(billingListSrc).toContain("billingTypeFilter?: 'all' | 'quote' | 'invoice'")
  })

  it('28. BillingDocumentList accepts onCreate prop', () => {
    expect(billingListSrc).toContain('onCreate?: () => void')
  })

  it('29. Empty state shows context-aware title based on filter', () => {
    expect(billingListSrc).toContain("billingTypeFilter === 'quote' ? 'No quotes yet'")
    expect(billingListSrc).toContain("billingTypeFilter === 'invoice' ? 'No invoices yet'")
  })

  it('30. Empty state shows context-aware CTA label', () => {
    expect(billingListSrc).toContain("'Create Quote'")
    expect(billingListSrc).toContain("'Create Invoice'")
    expect(billingListSrc).toContain("'Create Quote or Invoice'")
  })

  it('31. Empty state CTA calls onCreate', () => {
    expect(billingListSrc).toContain('onClick={onCreate}')
  })

  it('32. Payments page passes billingTypeFilter to BillingDocumentList', () => {
    expect(paymentsPageSrc).toContain('billingTypeFilter={billingTypeFilter}')
  })

  it('33. Payments page passes onCreate to open billing chooser', () => {
    expect(paymentsPageSrc).toContain('onCreate={() => setShowBillingChooser(true)}')
  })
})

// ============================================================================
// 6. PER-UNIT UNIT SELECTOR
// ============================================================================
describe('6. PER-UNIT UNIT SELECTOR', () => {
  it('34. BillingEditorModal defines UNIT_OPTIONS with common units', () => {
    expect(billingEditorSrc).toContain('UNIT_OPTIONS')
    expect(billingEditorSrc).toContain("value: 'ea'")
    expect(billingEditorSrc).toContain("value: 'hrs'")
    expect(billingEditorSrc).toContain("value: 'ft'")
  })

  it('35. Unit selector is a <select> element', () => {
    expect(billingEditorSrc).toContain('<select')
  })

  it('36. Unit selector has Custom option', () => {
    expect(billingEditorSrc).toContain('Custom…')
    expect(billingEditorSrc).toContain('value="custom"')
  })

  it('37. Custom unit text input revealed when unit_label is custom', () => {
    expect(billingEditorSrc).toContain('!UNIT_OPTIONS.some(o => o.value === item.unit_label)')
  })

  it('38. Custom unit input persists to unit_label field', () => {
    expect(billingEditorSrc).toContain("updateLineItem(index, 'unit_label', e.target.value)")
  })

  it('39. lineFormula handles no-unit case cleanly (no "unit" label)', () => {
    expect(billingEditorSrc).toContain('if (!unit)')
  })

  it('40. Rate label shows $ when no unit selected (not $/unit)', () => {
    expect(billingEditorSrc).toContain("item.unit_label ? `$/${item.unit_label}` : '$'")
  })
})

// ============================================================================
// 7. DRAFT QUOTE/INVOICE SEND ACTION
// ============================================================================
describe('7. DRAFT QUOTE/INVOICE SEND ACTION', () => {
  it('41. Draft cards expose Send action', () => {
    expect(billingListSrc).toContain("Draft: Send + Edit + Download + Delete")
  })

  it('42. Draft Send button calls onSend', () => {
    expect(billingListSrc).toContain('onClick={() => onSend(doc)}')
  })

  it('43. Draft Send button has disabled state for sendingId', () => {
    expect(billingListSrc).toContain('disabled={sendingId === doc.id}')
  })

  it('44. Draft Send button shows spinner when sending', () => {
    expect(billingListSrc).toContain('sendingId === doc.id ? <Loader2')
  })

  it('45. Draft Send uses Send icon', () => {
    expect(billingListSrc).toContain('<Send className="w-4 h-4" />')
  })

  it('46. Draft Send aria-label is context-aware (quote vs invoice)', () => {
    expect(billingListSrc).toContain("isQuote ? 'Send quote' : 'Send invoice'")
  })
})

// ============================================================================
// 8. DASHBOARD ACTIVITY CARD DENSITY
// ============================================================================
describe('8. DASHBOARD ACTIVITY CARD DENSITY', () => {
  it('47. Activity card stores up to 12 events (for 6 display)', () => {
    expect(activityCardSrc).toContain('.slice(0, 12)')
  })

  it('48. Activity card displays up to 6 events', () => {
    expect(activityCardSrc).toContain('.slice(0, 6)')
  })

  it('49. Voicemail cap increased from 2 to 4', () => {
    expect(activityCardSrc).toContain('.slice(0, 4)')
  })

  it('50. Activity card queries recent jobs directly (not just via leads)', () => {
    expect(activityCardSrc).toContain("from('jobs')")
  })

  it('51. Activity card queries recent tasks directly', () => {
    expect(activityCardSrc).toContain("from('tasks')")
  })

  it('52. Activity card queries recent payment_requests directly', () => {
    expect(activityCardSrc).toContain("from('payment_requests')")
  })

  it('53. Activity card deduplicates merged events by id', () => {
    expect(activityCardSrc).toContain('existingEventIds')
  })

  it('54. Activity card sorts newest first', () => {
    expect(activityCardSrc).toContain('new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()')
  })
})

// ============================================================================
// 9. QUOTES & INVOICES MARKETING PARITY
// ============================================================================
describe('9. QUOTES & INVOICES MARKETING PARITY', () => {
  it('55. Home page hero mentions quotes & invoices', () => {
    expect(homePageSrc).toContain('Quotes & invoices via SMS')
  })

  it('56. Home page hero subtitle mentions quotes & invoices', () => {
    expect(homePageSrc).toContain('send quotes & invoices')
  })

  it('57. Public page hero mentions quotes & invoices', () => {
    expect(publicPageSrc).toContain('send quotes & invoices')
  })

  it('58. FAQ has a Quotes & Invoices section', () => {
    expect(faqPageSrc).toContain('Quotes & Invoices')
  })

  it('59. FAQ metadata mentions Quotes', () => {
    expect(faqPageSrc).toContain('Quotes')
  })

  it('60. Pricing page features list includes quotes & invoices', () => {
    expect(pricingPageSrc).toContain('Quotes & invoices sent via SMS with PDF')
  })

  it('61. Pricing page metadata mentions Quotes', () => {
    expect(pricingPageSrc).toContain('Quotes')
  })

  it('62. Root layout metadata mentions Quotes', () => {
    expect(layoutSrc).toContain('Quotes')
  })

  it('63. Home layout metadata mentions Quotes', () => {
    expect(homeLayoutSrc).toContain('Quotes')
  })

  it('64. Footer mentions quotes & invoices', () => {
    expect(footerSrc).toContain('quotes & invoices')
  })

  it('65. Download page mentions quotes & invoices', () => {
    expect(downloadPageSrc).toContain('quotes & invoices')
  })

  it('66. InteractiveDemoWalkthrough mentions quotes & invoices in workflow', () => {
    expect(interactiveDemoSrc).toContain('Send a quote or invoice via SMS')
  })

  it('67. HomepageInteractiveDemo mentions quotes & invoices', () => {
    expect(homepageDemoSrc).toContain('quotes')
    expect(homepageDemoSrc).toContain('invoices')
  })

  it('68. FAQ overview copy mentions quotes & invoices', () => {
    expect(faqPageSrc).toContain('send quotes & invoices')
  })

  it('69. FAQ mobile app copy mentions quotes & invoices', () => {
    expect(faqPageSrc).toContain('creating quotes & invoices')
  })

  it('70. No unsupported accounting claims in marketing copy', () => {
    // Verify no "accounting" or "bookkeeping" claims that the app doesn't support
    expect(homePageSrc).not.toMatch(/accounting software/i)
    expect(publicPageSrc).not.toMatch(/accounting software/i)
    expect(faqPageSrc).not.toMatch(/accounting software/i)
    expect(pricingPageSrc).not.toMatch(/accounting software/i)
  })
})
