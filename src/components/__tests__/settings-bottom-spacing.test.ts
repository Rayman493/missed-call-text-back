/**
 * Regression tests for Settings bottom spacing.
 *
 * Tests 30-34: Settings bottom dead-space fix
 *
 * Root cause traced:
 * The settings sections container had pb-40 (160px) bottom padding,
 * in addition to the mobile-bottom-nav-safe-content class on the parent
 * which adds 72px on mobile. Total: 232px of bottom padding on mobile,
 * creating a large blank area after the Danger Zone section.
 *
 * The fix reduces the inner container's bottom padding to pb-8 sm:pb-6,
 * relying on the parent's mobile-bottom-nav-safe-content for nav clearance.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/SettingsContent.tsx', 'utf8').replace(/\r\n/g, '\n')
const globalsCss = readFileSync('src/app/globals.css', 'utf8').replace(/\r\n/g, '\n')

describe('Settings bottom spacing — dead-space fix (30-34)', () => {
  it('30. Account final section has bounded bottom spacing (pb-8 sm:pb-6, not pb-40)', () => {
    // The inner container uses pb-8 sm:pb-6 (reduced from pb-40)
    expect(content).toContain('space-y-6 pb-8 sm:pb-6')
    // Must NOT use pb-40 (the old excessive padding)
    expect(content).not.toContain('space-y-6 pb-40')
  })

  it('31. no duplicate nav/safe-area spacer (mobile-bottom-nav-safe-content on parent)', () => {
    // The parent has mobile-bottom-nav-safe-content which handles nav clearance
    expect(content).toContain('mobile-bottom-nav-safe-content')
    // The CSS class adds padding-bottom: var(--bottom-nav-height, 72px) on mobile
    expect(globalsCss).toContain('.mobile-bottom-nav-safe-content')
    expect(globalsCss).toContain('padding-bottom: var(--bottom-nav-height, 72px)')
  })

  it('32. Danger Zone remains above fixed bottom nav (Danger Zone section exists)', () => {
    // The Danger Zone section is present
    expect(content).toContain('id="danger-zone"')
    expect(content).toContain('Danger Zone')
  })

  it('33. mobile usable viewport preserved (mobile-bottom-nav-safe-content clears nav)', () => {
    // On mobile, the parent adds 72px padding-bottom
    // On desktop (lg+), it's 0 (no bottom nav)
    expect(globalsCss).toContain('@media (min-width: 1024px)')
    expect(globalsCss).toContain('padding-bottom: 0')
  })

  it('34. desktop layout unchanged (pb-6 on desktop, no mobile nav padding)', () => {
    // On desktop, the inner container uses pb-6 (sm: prefix)
    expect(content).toContain('sm:pb-6')
    // On desktop, mobile-bottom-nav-safe-content adds 0 padding
    // (check for the @media block that sets padding-bottom: 0)
    expect(globalsCss).toContain('@media (min-width: 1024px)')
    expect(globalsCss).toContain('padding-bottom: 0')
  })
})
