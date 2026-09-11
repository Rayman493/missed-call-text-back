import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  rankCustomerForQuery,
  searchCustomers,
  normalizePhoneDigits,
} from '../customer-search'

const repoRoot = process.cwd()
const readSrc = (rel: string) => {
  try {
    return readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')
  } catch {
    return ''
  }
}

describe('Batch 6 — Customer search precision', () => {
  const customers = [
    { name: 'Ryan Bandi', caller_phone: '+1-412-555-1234', email: 'ryan@example.com' },
    { name: 'Add Manual Customer Test', caller_phone: '+1-412-555-9999', email: 'add@example.com' },
    { name: 'Ryan Test', caller_phone: '+1-412-555-0000', email: 'ryant@example.com' },
    { name: 'Not collected', caller_phone: '+1-555-0100', email: null },
  ]

  // 1. "A" matches Add Manual Customer Test
  it('"A" matches Add Manual Customer Test', () => {
    const results = searchCustomers(customers, 'A')
    const names = results.map(c => c.name)
    expect(names).toContain('Add Manual Customer Test')
  })

  // 2. "A" does not match Ryan Bandi
  it('"A" does not match Ryan Bandi', () => {
    const results = searchCustomers(customers, 'A')
    const names = results.map(c => c.name)
    expect(names).not.toContain('Ryan Bandi')
  })

  // 3. "Ry" matches Ryan names
  it('"Ry" matches Ryan Bandi and Ryan Test', () => {
    const results = searchCustomers(customers, 'Ry')
    const names = results.map(c => c.name)
    expect(names).toContain('Ryan Bandi')
    expect(names).toContain('Ryan Test')
  })

  // 4. "Bandi" matches Ryan Bandi
  it('"Bandi" matches Ryan Bandi', () => {
    const results = searchCustomers(customers, 'Bandi')
    const names = results.map(c => c.name)
    expect(names).toContain('Ryan Bandi')
  })

  // 5. "yan" does not match Ryan
  it('"yan" does not match Ryan', () => {
    const results = searchCustomers(customers, 'yan')
    const names = results.map(c => c.name)
    expect(names).not.toContain('Ryan Bandi')
    expect(names).not.toContain('Ryan Test')
  })

  // 6. multiword prefix "Ryan B" works
  it('"Ryan B" matches Ryan Bandi (multiword prefix)', () => {
    const results = searchCustomers(customers, 'Ryan B')
    const names = results.map(c => c.name)
    expect(names).toContain('Ryan Bandi')
    expect(names).not.toContain('Ryan Test')
  })

  // 7. multiword prefix "Add Man" works
  it('"Add Man" matches Add Manual Customer Test (multiword prefix)', () => {
    const results = searchCustomers(customers, 'Add Man')
    const names = results.map(c => c.name)
    expect(names).toContain('Add Manual Customer Test')
  })

  // 8. exact phone works
  it('exact phone matches', () => {
    const results = searchCustomers(customers, '4125551234')
    const names = results.map(c => c.name)
    expect(names).toContain('Ryan Bandi')
  })

  // 9. phone prefix works
  it('phone prefix matches', () => {
    const results = searchCustomers(customers, '412555')
    const names = results.map(c => c.name)
    expect(names).toContain('Ryan Bandi')
    expect(names).toContain('Add Manual Customer Test')
    expect(names).toContain('Ryan Test')
  })

  // 10. unrelated metadata does not cause a match
  it('email-only substring does not cause a match (email is not searched)', () => {
    // "example" is in emails but should NOT match because email is not searched
    const results = searchCustomers(customers, 'example')
    expect(results.length).toBe(0)
  })

  it('rankCustomerForQuery returns 0 for no match', () => {
    expect(rankCustomerForQuery({ name: 'Ryan', caller_phone: null }, 'zzz')).toBe(0)
  })

  it('rankCustomerForQuery returns 0 for placeholder name', () => {
    expect(rankCustomerForQuery({ name: 'Not collected', caller_phone: '4125551234' }, 'Not')).toBe(0)
  })

  // 11. status filter composes with search (source-level: leads page uses rankCustomerForQuery)
  it('leads page uses rankCustomerForQuery for search', () => {
    const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')
    expect(leadsPageSrc).toContain('rankCustomerForQuery')
    // Does NOT search email anymore
    expect(leadsPageSrc).not.toContain('lead.email.toLowerCase().includes')
  })

  // 12. empty query restores normal list
  it('empty query returns original list unmodified', () => {
    const results = searchCustomers(customers, '')
    expect(results.length).toBe(customers.length)
  })

  it('normalizePhoneDigits strips formatting', () => {
    expect(normalizePhoneDigits('+1 (412) 555-1234')).toBe('14125551234')
  })

  it('deterministic relevance order: exact name < name-startswith < token-prefix < exact phone < phone-prefix', () => {
    const exact = rankCustomerForQuery({ name: 'Ryan Bandi', caller_phone: null }, 'ryan bandi')
    const starts = rankCustomerForQuery({ name: 'Ryan Bandi', caller_phone: null }, 'ryan b')
    const token = rankCustomerForQuery({ name: 'Ryan Bandi', caller_phone: null }, 'bandi')
    const phoneExact = rankCustomerForQuery({ name: 'Other', caller_phone: '4125551234' }, '4125551234')
    const phonePrefix = rankCustomerForQuery({ name: 'Other', caller_phone: '4125551234' }, '412')
    expect(exact).toBeLessThan(starts)
    expect(starts).toBeLessThan(token)
    expect(token).toBeLessThan(phoneExact)
    expect(phoneExact).toBeLessThan(phonePrefix)
  })
})

describe('Batch 6 — Notifications page mobile layout', () => {
  const notificationsSrc = readSrc('src/app/dashboard/notifications/page.tsx')

  // 13. mobile actions render left aligned under subtitle
  it('mobile actions are left-aligned (no ml-auto) and under subtitle', () => {
    // Mobile action row uses flex sm:hidden (left-aligned, no ml-auto)
    const mobileActionIdx = notificationsSrc.indexOf('flex sm:hidden items-center gap-2 mt-3')
    expect(mobileActionIdx).toBeGreaterThan(-1)
    // The mobile action row should NOT have ml-auto
    const mobileSection = notificationsSrc.substring(mobileActionIdx, mobileActionIdx + 200)
    expect(mobileSection).not.toContain('ml-auto')
  })

  // 14. desktop layout remains appropriate (right-aligned)
  it('desktop actions remain right-aligned with ml-auto', () => {
    expect(notificationsSrc).toContain('hidden sm:flex items-center gap-2 shrink-0 ml-auto')
  })

  // 15. Mark all as read behavior unchanged
  it('Mark all as read handler remains', () => {
    expect(notificationsSrc).toContain('handleMarkAllAsRead')
    expect(notificationsSrc).toContain('Mark all as read')
  })

  // 16. Clear all behavior unchanged
  it('Clear all handler remains', () => {
    expect(notificationsSrc).toContain('handleClearAll')
    expect(notificationsSrc).toContain('Clear all')
  })

  // 17. dropdown/panel remains viewport-bounded
  it('notification dropdown panel remains viewport-bounded (maxHeight uses bottom-nav-height)', () => {
    const navbarSrc = readSrc('src/components/NavbarNotifications.tsx')
    expect(navbarSrc).toContain('--bottom-nav-height')
    expect(navbarSrc).toContain('100dvh')
  })

  // 18. View All remains reachable
  it('View all notifications link remains reachable (shrink-0 footer)', () => {
    const navbarSrc = readSrc('src/components/NavbarNotifications.tsx')
    expect(navbarSrc).toContain('View all notifications')
    expect(navbarSrc).toContain('shrink-0')
  })
})

describe('Batch 6 — FAQ / legal mobile header', () => {
  // 19-22. mobile FAQ/Privacy/Terms/Compliance have no public header (hidden on mobile)
  const faqSrc = readSrc('src/app/(public)/faq/page.tsx')
  const privacySrc = readSrc('src/app/(public)/privacy/page.tsx')
  const termsSrc = readSrc('src/app/(public)/terms/page.tsx')
  const complianceSrc = readSrc('src/app/compliance/page.tsx')
  const wrapperSrc = readSrc('src/components/MobileHiddenSSRSafeNavbar.tsx')

  it('all four legal pages import MobileHiddenSSRSafeNavbar', () => {
    expect(faqSrc).toContain('MobileHiddenSSRSafeNavbar')
    expect(privacySrc).toContain('MobileHiddenSSRSafeNavbar')
    expect(termsSrc).toContain('MobileHiddenSSRSafeNavbar')
    expect(complianceSrc).toContain('MobileHiddenSSRSafeNavbar')
  })

  it('wrapper hides navbar on mobile (hidden sm:block)', () => {
    expect(wrapperSrc).toContain('hidden sm:block')
  })

  // 6. FAQ/legal navbar visibility matches canonical responsive layout breakpoint
  it('navbar visibility breakpoint (sm) matches DocumentationHero canonical breakpoint', () => {
    // DocumentationHero uses sm: for its mobile→desktop transition (padding, text size).
    // The wrapper must use the same breakpoint so there's no intermediate width
    // where the page is mobile-layout but the navbar has already returned.
    const heroSrc = readSrc('src/components/DocumentationHero.tsx')
    expect(heroSrc).toContain('sm:px-6')
    expect(heroSrc).toContain('sm:text-4xl')
    // Wrapper uses the same sm: breakpoint
    expect(wrapperSrc).toContain('hidden sm:block')
  })

  it('navbar visibility breakpoint (sm) matches LegalNavigation canonical breakpoint', () => {
    const legalNavSrc = readSrc('src/components/LegalNavigation.tsx')
    expect(legalNavSrc).toContain('sm:flex')
    expect(legalNavSrc).toContain('sm:overflow-visible')
  })

  it('navbar visibility breakpoint (sm) matches Navbar hamburger breakpoint', () => {
    // Navbar hides hamburger at sm: (sm:hidden) and shows nav links at sm: (sm:block).
    // The wrapper must match so the public navbar appears exactly when the
    // desktop layout begins.
    const navbarSrc = readSrc('src/components/Navbar.tsx')
    expect(navbarSrc).toContain('sm:hidden')
    expect(navbarSrc).toContain('sm:block')
  })

  // 7. mobile/reference layout has no public navbar
  it('mobile layout has no public navbar (hidden below sm)', () => {
    expect(wrapperSrc).toContain('hidden sm:block')
  })

  // 8. desktop layout retains public navbar
  it('desktop layout retains public navbar (shown at sm+)', () => {
    expect(wrapperSrc).toContain('SSRSafeNavbar')
  })

  // 23. Back control exists
  it('Back control exists in DocumentationHero', () => {
    const heroSrc = readSrc('src/components/DocumentationHero.tsx')
    expect(heroSrc).toContain('showBackLink')
    expect(heroSrc).toContain('router.back')
    expect(heroSrc).toContain('Back')
  })

  // 24. section tabs remain
  it('LegalNavigation section tabs remain', () => {
    const heroSrc = readSrc('src/components/DocumentationHero.tsx')
    expect(heroSrc).toContain('LegalNavigation')
    const legalNavSrc = readSrc('src/components/LegalNavigation.tsx')
    expect(legalNavSrc).toContain('/faq')
    expect(legalNavSrc).toContain('/privacy')
    expect(legalNavSrc).toContain('/terms')
    expect(legalNavSrc).toContain('/compliance')
  })

  // 25. desktop public navigation remains unchanged (sm:block shows it)
  it('desktop public navigation remains (navbar renders at sm+)', () => {
    expect(wrapperSrc).toContain('SSRSafeNavbar')
  })
})

describe('Batch 6 — More menu account header', () => {
  const bottomNavSrc = readSrc('src/components/BottomNavigation.tsx')

  // 26. business name shown when available
  it('business name shown when available', () => {
    expect(bottomNavSrc).toContain('business?.name')
    expect(bottomNavSrc).toContain('data-account-primary')
  })

  // 27. email shown
  it('email shown', () => {
    expect(bottomNavSrc).toContain('user?.email')
    expect(bottomNavSrc).toContain('data-account-secondary')
  })

  // 28. fallback works when business name missing
  it('fallback to email as primary when business name missing', () => {
    // When business?.name is falsy, email gets the primary styling class
    expect(bottomNavSrc).toContain("business?.name ? 'mt-0.5' : 'text-sm font-semibold text-popover-foreground'")
  })

  // 29. no new fetch introduced (uses existing context)
  it('uses existing useBusiness and useAuth context (no new fetch)', () => {
    expect(bottomNavSrc).toContain("import { useBusiness } from '@/contexts/BusinessContext'")
    // useAuth was already imported; now also destructures user
    expect(bottomNavSrc).toContain('const { signOut, user } = useAuth()')
  })

  // 30. menu actions unchanged
  it('menu actions unchanged (Settings, Billing, Assistant, Support, FAQ, Sign Out)', () => {
    expect(bottomNavSrc).toContain('/dashboard/settings')
    expect(bottomNavSrc).toContain('handleBilling')
    expect(bottomNavSrc).toContain('Sign Out')
  })

  it('account header is non-interactive (no button/link) and has divider', () => {
    const headerIdx = bottomNavSrc.indexOf('data-account-primary')
    const headerSection = bottomNavSrc.substring(headerIdx - 200, headerIdx + 400)
    expect(headerSection).toContain('border-b')
    expect(headerSection).not.toContain('<button')
    expect(headerSection).not.toContain('<Link')
  })
})

describe('Batch 6 — Analytics All Time range', () => {
  const timeframeSrc = readSrc('src/lib/analytics-timeframe.ts')

  // 31. All Time option appears after This Year
  it('All Time option appears after This Year in options array', () => {
    expect(timeframeSrc).toContain("'all_time' as AnalyticsTimeframe, label: 'All Time'")
    const optionsIdx = timeframeSrc.indexOf('ANALYTICS_TIMEFRAME_OPTIONS')
    const optionsSection = timeframeSrc.substring(optionsIdx, optionsIdx + 500)
    const thisYearIdx = optionsSection.indexOf("'1y'")
    const allTimeIdx = optionsSection.indexOf("'all_time'")
    expect(allTimeIdx).toBeGreaterThan(thisYearIdx)
  })

  // 32. canonical value is handled by shared range logic
  it("canonical value 'all_time' is in the type", () => {
    expect(timeframeSrc).toContain("'7d' | '30d' | '90d' | '1y' | 'all_time'")
  })

  // 33. no artificial start bound
  it('getStartDateForTimeframe returns null for all_time (no artificial start bound)', () => {
    expect(timeframeSrc).toContain("case 'all_time':")
    expect(timeframeSrc).toContain('return null')
  })

  // 34. KPI and chart use same range (shared utility)
  it('getDaysInTimeframe accepts optional startDate for all_time averages', () => {
    expect(timeframeSrc).toContain('getDaysInTimeframe(timeframe: AnalyticsTimeframe, startDate?: Date | null)')
  })

  // 35. existing ranges unchanged
  it('existing ranges (7d, 30d, 90d, 1y) remain in options', () => {
    expect(timeframeSrc).toContain("'7d'")
    expect(timeframeSrc).toContain("'30d'")
    expect(timeframeSrc).toContain("'90d'")
    expect(timeframeSrc).toContain("'1y'")
  })

  // 36. shared analytics cards recognize All Time
  it('all 6 analytics graphs include all_time in daysMap', () => {
    const graphs = [
      'src/components/analytics/RevenueGraph.tsx',
      'src/components/analytics/BusinessActivityGraph.tsx',
      'src/components/analytics/NewCustomersGraph.tsx',
      'src/components/analytics/PaymentCollectionGraph.tsx',
      'src/components/analytics/LeadConversionGraph.tsx',
      'src/components/analytics/LeadsSourceGraph.tsx',
    ]
    for (const g of graphs) {
      const src = readSrc(g)
      expect(src).toContain("'all_time': null")
      // Conditionally applies gte (skips when startDateIso is null)
      expect(src).toContain('if (startDateIso)')
    }
  })
})

describe('Batch 6 — Out of Office clear', () => {
  const settingsSrc = readSrc('src/components/SettingsContent.tsx')
  const hookSrc = readSrc('src/hooks/useSettingsFormState.ts')

  // 37. Clear action persists null start (uses saveChanges, not just updateBusiness)
  it('Clear action persists null start via saveChanges (not just local updateBusiness)', () => {
    // The Clear button builds a clearedBusiness override and calls saveChanges
    // to persist immediately through the canonical save path.
    const commentIdx = settingsSrc.indexOf('Clear Out of Office — ACTION that immediately persists')
    const clearSection = settingsSrc.substring(commentIdx, commentIdx + 2000)
    expect(clearSection).toContain('saveChanges(clearedBusiness)')
    expect(clearSection).toContain('out_of_office_start: null')
  })

  // 38. Clear action persists null end
  it('Clear action persists null end', () => {
    const commentIdx = settingsSrc.indexOf('Clear Out of Office — ACTION that immediately persists')
    const clearSection = settingsSrc.substring(commentIdx, commentIdx + 2000)
    expect(clearSection).toContain('out_of_office_end: null')
  })

  // 39. Out of Office becomes inactive (persisted)
  it('Clear action persists enabled=false via saveChanges', () => {
    const commentIdx = settingsSrc.indexOf('Clear Out of Office — ACTION that immediately persists')
    const clearSection = settingsSrc.substring(commentIdx, commentIdx + 2000)
    expect(clearSection).toContain('out_of_office_enabled: false')
  })

  // 1. Clear OOO persists null start (saveChanges override path)
  it('saveChanges accepts overrideBusiness for immediate persistence', () => {
    expect(hookSrc).toContain('saveChanges = useCallback(async (overrideBusiness?: Business)')
    expect(hookSrc).toContain('const businessToSave = overrideBusiness || state.business')
    expect(hookSrc).toContain('const savedBusiness = await onSaveBusiness(businessToSave)')
  })

  // 5. failed persistence does not falsely claim success
  it('failed persistence surfaces saveError (does not falsely claim success)', () => {
    // saveChanges sets saveError on catch, and only updates business/originalBusiness
    // on success (inside the try block after onSaveBusiness resolves).
    expect(hookSrc).toContain("saveError: error instanceof Error ? error.message : 'Failed to save settings'")
    // On success, hasUnsavedChanges is set to false; on error, isSaving is set to false
    // but business state is NOT updated with the failed values.
    const successIdx = hookSrc.indexOf('hasUnsavedChanges: false')
    expect(successIdx).toBeGreaterThan(-1)
  })

  it('saveChanges updates local state only after save succeeds (not before)', () => {
    // The setState that updates business/originalBusiness is inside the try block
    // after onSaveBusiness resolves. On error, only isSaving and saveError are set.
    const tryIdx = hookSrc.indexOf('setState(prev => ({ ...prev, isSaving: true, saveError: null }))')
    const successStateIdx = hookSrc.indexOf('originalBusiness: { ...savedBusiness }')
    expect(successStateIdx).toBeGreaterThan(tryIdx)
  })

  // 40. reusable message preserved (not cleared)
  it('reusable custom message is preserved (Clear does not touch out_of_office_message)', () => {
    const commentIdx = settingsSrc.indexOf('Clear Out of Office — ACTION that immediately persists')
    const clearSection = settingsSrc.substring(commentIdx, commentIdx + 2000)
    expect(clearSection).not.toContain('out_of_office_message: null')
    expect(clearSection).not.toContain('out_of_office_message:')
  })

  // 41. stale dates do not return on re-enable
  it('re-enabling will not restore previous dates (start/end are null until user sets new ones)', () => {
    // The clear sets start/end to null; re-enable only sets enabled=true
    // without restoring dates. The validation requires both dates when enabled.
    expect(settingsSrc).toContain('Out of Office requires both start and end dates')
  })

  // 42. unrelated automation settings untouched
  it('Automatic Follow-Ups section remains separate (untouched)', () => {
    expect(settingsSrc).toContain('Automatic Follow-Ups')
  })

  it('Clear button only shows when there is something to clear', () => {
    expect(settingsSrc).toContain('formBusiness.out_of_office_start || formBusiness.out_of_office_end || formBusiness.out_of_office_enabled')
  })

  it('Clear button is disabled while saving (isSaving)', () => {
    const commentIdx = settingsSrc.indexOf('Clear Out of Office — ACTION that immediately persists')
    const clearSection = settingsSrc.substring(commentIdx, commentIdx + 2500)
    expect(clearSection).toContain('disabled={isSaving}')
    expect(clearSection).toContain("disabled:opacity-50")
  })
})

describe('Batch 6 — Date helper / customer cards', () => {
  // 43. New Reminder empty/default does not show misleading Today helper
  it('DatePicker Today helper only shows when a date is selected (not on empty)', () => {
    const datePickerSrc = readSrc('src/components/ui/DatePicker.tsx')
    expect(datePickerSrc).toContain('!required && value &&')
  })

  // 44. selected meaningful date behavior remains correct
  it('DatePicker selectToday still works when date is selected', () => {
    const datePickerSrc = readSrc('src/components/ui/DatePicker.tsx')
    expect(datePickerSrc).toContain('selectToday')
  })

  // 45. customer canonical card structure remains unchanged from Batch 2
  it('canonical customer cards remain structurally present (AI Summary, Request History, Jobs, Reminders, Payments, Appointments, Internal Notes)', () => {
    const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(pageClientSrc).toContain('AI Summary - canonical card for ALL customer origins')
    expect(pageClientSrc).toContain('Request History - canonical card for ALL customer origins')
    expect(pageClientSrc).toContain('Jobs - actual job entities')
    expect(pageClientSrc).toContain('Reminders')
    expect(pageClientSrc).toContain('Payments')
    expect(pageClientSrc).toContain('Appointments')
    expect(pageClientSrc).toContain('Internal Notes')
  })

  it('no customer-level Schedule card in active canonical layout', () => {
    // renderWorkspaceSection is dead code (never called) — the active layout
    // uses the canonical cards at the bottom, which have no "Schedule" card.
    const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(pageClientSrc).toContain('const renderWorkspaceSection = () => {')
    // Verify it's never called
    const callMatches = pageClientSrc.match(/renderWorkspaceSection\(\)/g)
    expect(callMatches).toBeNull()
  })
})
