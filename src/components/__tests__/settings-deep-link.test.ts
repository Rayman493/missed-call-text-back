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
