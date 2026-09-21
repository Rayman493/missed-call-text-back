/**
 * FINAL PRE-SUBMISSION BATCH 5 — shared mobile + UI consistency polish
 *
 * Contract-level coverage for the bounded polish items:
 *  - theme-aware html background (iOS safe-area gap root cause)
 *  - notification pressed-state clears on pointerleave (stuck highlight)
 *  - single-active nav highlight preserved
 *  - Help modal close target semantics
 *  - canonical intake field icons
 *  - billing footer loading/containment
 *  - settings input containment
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8')
const notifSrc = readFileSync(resolve(__dirname, '../app/dashboard/notifications/page.tsx'), 'utf8')
const navSrc = readFileSync(resolve(__dirname, '../components/BottomNavigation.tsx'), 'utf8')
const helpSrc = readFileSync(resolve(__dirname, '../components/HelpTroubleshootingModal.tsx'), 'utf8')
const aiCallSrc = readFileSync(resolve(__dirname, '../components/AICallDetails.tsx'), 'utf8')
const bookingSrc = readFileSync(resolve(__dirname, '../components/settings/OnlineBookingSection.tsx'), 'utf8')
const teamSrc = readFileSync(resolve(__dirname, '../components/settings/TeamAccessSection.tsx'), 'utf8')
const viewerSrc = readFileSync(resolve(__dirname, '../components/billing/BillingViewerModal.tsx'), 'utf8')
const customerSrc = readFileSync(resolve(__dirname, '../components/CustomerDetails.tsx'), 'utf8')

describe('iOS bottom safe-area (§5)', () => {
  it('html background follows the theme — no permanent dark seam in light mode', () => {
    expect(css).toMatch(/html\.light\s*\{[^}]*background-color:\s*#f8fafc/)
    expect(css).toMatch(/html\.dark\s*\{[^}]*background-color:\s*#020617/)
    expect(css).toMatch(/prefers-color-scheme:\s*light[\s\S]*?html:not\(\.dark\)[^}]*background-color:\s*#f8fafc/)
  })

  it('nav keeps its safe-area inset padding', () => {
    expect(navSrc).toContain('env(safe-area-inset-bottom)')
    expect(navSrc).toContain('fixed bottom-0')
  })
})

describe('mobile nav active state (§6)', () => {
  it('exactly one active source while a tap is in flight', () => {
    expect(navSrc).toContain('return pendingHref === item.href')
    expect(navSrc).toContain('if (isMoreMenuOpen)')
  })

  it('active treatment is accent-tinted, not a full-width pill', () => {
    expect(navSrc).toContain('text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15')
    expect(navSrc).not.toContain('rounded-full bg-blue-600')
  })
})

describe('notification press state (§7)', () => {
  it('pointerleave clears the pressed highlight and cancels the tap', () => {
    expect(notifSrc).toContain('onPointerLeave={handlePointerCancel}')
    const cancelBody = notifSrc.slice(notifSrc.indexOf('const handlePointerCancel'))
    expect(cancelBody).toContain('isTap = false')
    expect(cancelBody).toContain('setPressedNotificationId(null)')
  })

  it('click only fires when the gesture stayed a tap', () => {
    expect(notifSrc).toContain('pointerStateRef.current?.isTap')
    expect(notifSrc).toContain('MOVE_THRESHOLD')
  })
})

describe('help modal close + light mode (§4, §16)', () => {
  it('close button is a >=44px labeled target aligned in the header', () => {
    expect(helpSrc).toContain('aria-label="Close help modal"')
    expect(helpSrc).toMatch(/h-11 w-11/)
    expect(helpSrc).toContain('items-center justify-between')
  })

  it('modal surface uses theme tokens, not hardcoded dark', () => {
    expect(helpSrc).not.toContain('bg-slate-900 rounded-2xl')
    expect(helpSrc).toContain('bg-card rounded-2xl')
  })
})

describe('AI intake field icons (§8)', () => {
  it('Details uses FileText, time fields use Clock', () => {
    expect(aiCallSrc).toMatch(/<FileText[^/]*\/>\s*<span[^>]*>Details/)
    expect(aiCallSrc).toMatch(/<Clock[^/]*\/>\s*<span[^>]*>Desired Completion/)
    expect(aiCallSrc).toMatch(/<Clock[^/]*\/>\s*<span[^>]*>Preferred Callback/)
  })

  it('customer context uses the same canonical icons', () => {
    expect(customerSrc).toContain("'Reason for Calling', reasonForCalling, <MessageSquare")
    expect(customerSrc).toContain("'Details', details, <FileText")
    expect(customerSrc).toContain("'Desired Completion Time', desiredCompletionTime, <Clock")
    expect(customerSrc).toContain("'Preferred Callback Time', preferredCallbackTime, <Clock")
  })
})

describe('settings containment + team access consistency (§2, §3)', () => {
  it('shared booking inputs are min-w-0 so native date/time cannot overflow', () => {
    expect(bookingSrc).toContain("'min-w-0 rounded-lg border border-border/50")
  })

  it('team invite input matches canonical py-based control sizing', () => {
    expect(teamSrc).toContain('min-w-0 px-3 py-2.5')
    expect(teamSrc).not.toContain('h-10 px-3 rounded-lg')
  })
})

describe('billing document footer (§14)', () => {
  it('footer buttons keep usable mobile targets and loading states', () => {
    expect(viewerSrc).toContain('min-h-11')
    expect(viewerSrc).toContain('isDownloading')
    expect(viewerSrc).toContain('Preparing PDF…')
    expect(viewerSrc).toContain('disabled={isSending}')
  })
})
