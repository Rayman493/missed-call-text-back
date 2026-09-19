/**
 * Regression tests for Settings deep-link navigation.
 *
 * Tests 8-21: Settings section deep-link contract
 *
 * Root cause traced:
 * The hash handler's generic fallback used requestAnimationFrame which
 * could run before async-rendered sections were in the DOM. It also
 * didn't call setActiveSection for section hashes, so the tab wouldn't
 * highlight. The fix adds a canonical section deep-link handler that:
 * 1. Sets the active section immediately
 * 2. Uses MutationObserver to wait for the divider to render
 * 3. Scrolls exactly once via scrollToSection
 * 4. Cleans up the observer
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const settingsContent = readFileSync('src/components/SettingsContent.tsx', 'utf8').replace(/\r\n/g, '\n')
const pageClient = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')
const settingsConfig = readFileSync('src/lib/settings-config.ts', 'utf8').replace(/\r\n/g, '\n')

describe('Settings deep-link navigation — canonical mechanism (8-21)', () => {
  it('8. customer Messaging & Availability navigates to Automation (hash-based)', () => {
    expect(pageClient).toContain("window.location.href = '/dashboard/settings#automation'")
  })

  it('9. Automation section becomes active (setActiveSection in canonical handler)', () => {
    // The canonical handler calls setActiveSection(hash) for section hashes
    expect(settingsContent).toContain('setActiveSection(hash)')
    // The canonical handler checks if hash is a known section ID
    expect(settingsContent).toContain('sectionIds.includes(hash)')
  })

  it('10. Instant Response target is reached when available (id="instant-response")', () => {
    // The Instant Response section has a stable ID for deep-link targeting
    expect(settingsContent).toContain('id="instant-response"')
  })

  it('11. no hardcoded numeric scrollY dependency (uses scrollToSection with divider)', () => {
    // The canonical handler uses scrollToSection which targets the divider
    // and calculates offset dynamically — no hardcoded scrollY
    expect(settingsContent).toContain('scrollToSectionRef.current(hash)')
    // Must NOT use hardcoded window.scrollTo with numeric values in the canonical block
    // The canonical block is identified by "sectionIds.includes(hash)"
    const canonicalStart = settingsContent.indexOf('sectionIds.includes(hash)')
    expect(canonicalStart).toBeGreaterThan(-1)
    const canonicalBlock = settingsContent.slice(canonicalStart, canonicalStart + 800)
    expect(canonicalBlock).not.toMatch(/window\.scrollTo\(\s*\{?\s*top:\s*\d+/)
  })

  it('12. async target waits for render then scrolls once (MutationObserver)', () => {
    // The canonical handler uses MutationObserver to wait for async rendering
    expect(settingsContent).toContain('MutationObserver')
    expect(settingsContent).toContain('sectionObserverRef')
    // Only scrolls once (pendingSectionRef tracks and clears)
    expect(settingsContent).toContain('pendingSectionRef.current = null')
  })

  it('13. destination does not repeatedly re-scroll on unrelated renders (pendingSectionRef guard)', () => {
    // The pendingSectionRef prevents repeated scrolling
    expect(settingsContent).toContain('pendingSectionRef.current !== hash')
    // Observer is disconnected after successful scroll
    expect(settingsContent).toContain('sectionObserverRef.current.disconnect()')
  })

  it('14. Back navigation remains intact (window.location.href, not replaceState)', () => {
    // The customer quick action uses window.location.href which adds a
    // new history entry (not replaceState), so Back works naturally
    expect(pageClient).toContain('window.location.href = ')
    // The Settings page uses replaceState only for tab clicks, not deep links
    expect(settingsContent).toContain('window.history.replaceState')
  })

  // Test all section deep links
  const sections = [
    { id: 'automation', label: 'Automation' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'payments', label: 'Payments' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'account', label: 'Account' },
    { id: 'business-address', label: 'Business Address' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'general', label: 'Communication' }, // general section contains communication
  ]

  sections.forEach(({ id, label }) => {
    it(`${label} deep link still works (section ID "${id}" in settingsSections)`, () => {
      // Each section ID must be in the canonical settingsSections
      expect(settingsConfig).toContain(`id: '${id}'`)
      // Each section must have a divider element for scrolling
      expect(settingsContent).toContain(`id="${id}-divider"`)
    })
  })
})

describe('Settings deep-link — canonical divider anchor + settle correction', () => {
  const backToTop = readFileSync('src/components/settings/BackToTopButton.tsx', 'utf8').replace(/\r\n/g, '\n')

  it('scrollToSection anchors to the section divider (true section start) before the card', () => {
    const fnStart = settingsContent.indexOf('const scrollToSection = useCallback')
    const fnBlock = settingsContent.slice(fnStart, fnStart + 800)
    const dividerIdx = fnBlock.indexOf('`${sectionId}-divider`')
    const cardIdx = fnBlock.indexOf('document.getElementById(sectionId)')
    expect(dividerIdx).toBeGreaterThan(-1)
    expect(cardIdx).toBeGreaterThan(-1)
    expect(dividerIdx).toBeLessThan(cardIdx)
  })

  it('?section= path prefers the divider anchor and starts a bounded drift watch', () => {
    expect(settingsContent).toContain('getElementById(`${section}-divider`) ?? document.getElementById(section)')
    expect(settingsContent).toContain('watchDeepLinkAnchor(section)')
    expect(settingsContent).toContain('watchDeepLinkAnchor(hash)')
  })

  it('drift watch re-snaps only on document-space anchor movement (>8px) inside a bounded window', () => {
    expect(settingsContent).toContain('deepLinkAnchorTopRef')
    expect(settingsContent).toMatch(/Math\.abs\(top - deepLinkAnchorTopRef\.current\) > 8/)
    expect(settingsContent).toMatch(/setTimeout\(stopDeepLinkWatch, \d+\)/)
    expect(settingsContent).toContain('stopDeepLinkWatch()')
    // User scrolls never trigger corrections — drift compares
    // getBoundingClientRect().top + window.scrollY, not scrollY alone.
    expect(settingsContent).toContain('getBoundingClientRect().top + window.scrollY')
  })

  it('every canonical section has a divider anchor including online-booking', () => {
    expect(settingsConfig).toContain("id: 'online-booking'")
    expect(settingsContent).toContain('id="online-booking-divider"')
    expect(settingsContent).toContain('id="online-booking"')
  })

  it('Back to top sits in the viewport gutter on desktop, never overlapping the 1200px content column', () => {
    // Content column is max-w-[1200px] centered → edge at 50%-600px.
    // Icon-only pill (~56px) below 2xl, labeled pill (~124px) at 2xl+.
    expect(backToTop).toContain('lg:right-[max(1.5rem,calc(50%-664px))]')
    expect(backToTop).toContain('2xl:right-[max(1.5rem,calc(50%-732px))]')
    // The broken calc that pinned the button inside the card must be gone.
    expect(backToTop).not.toContain('calc(50%-700px)')
    // Label only appears where the gutter provably fits the wider pill.
    expect(backToTop).toContain('hidden 2xl:inline')
    // Mobile/tablet edge inset preserved.
    expect(backToTop).toContain('right-4 sm:right-6')
    // Stays fixed to the viewport and above content.
    expect(backToTop).toContain('fixed')
    expect(backToTop).toContain('z-40')
  })
})
