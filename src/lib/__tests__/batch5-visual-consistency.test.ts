/**
 * Batch 5 — Final Visual + Consistency Polish
 *
 * Tests for:
 * 1. Agenda existing actions preserved
 * 2. Batch 2 tap/scroll guards remain intact
 * 3. Desired customer card order exact (desktop + mobile)
 * 4. Customer action labels/options remain available
 * 5. Mobile public nav contains required 5 destinations exactly once
 * 6. Nav routes correct
 * 7. Callback-time icon present
 * 8. Notification actions preserved
 * 9. Attachment/composer behavior untouched
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('Batch 5 — Agenda actions preserved', () => {
  const agenda = readFileSync('src/components/schedule/TodayCommandCenter.tsx', 'utf8')

  it('Today section retains toggle, edit, and navigation actions', () => {
    expect(agenda).toContain('toggleTaskComplete')
    expect(agenda).toContain('onEditTask')
    expect(agenda).toContain('onNavigateTab')
  })

  it('Needs Attention retains toggle and edit actions', () => {
    expect(agenda).toContain('toggleTaskComplete')
    expect(agenda).toContain('onEditTask')
  })

  it('Reminders summary card navigates to reminders tab', () => {
    expect(agenda).toContain("onNavigateTab?.('reminders')")
  })

  it('Jobs summary card navigates to jobs tab', () => {
    expect(agenda).toContain("onNavigateTab?.('jobs')")
  })

  it('Appointments summary card navigates to appointments tab', () => {
    expect(agenda).toContain("onNavigateTab?.('appointments')")
  })

  it('Today card no longer forces oversized min-height', () => {
    // sm:min-h-[180px] was removed to make Today feel more list/timeline-like
    expect(agenda).not.toContain('sm:min-h-[180px]')
  })

  it('Reminders/Jobs/Appointments summary cards no longer force oversized min-height', () => {
    // sm:min-h-[110px] was removed from all three summary cards
    expect(agenda).not.toContain('sm:min-h-[110px]')
  })

  it('Summary cards use compact padding (p-3 not p-4)', () => {
    expect(agenda).toContain('rounded-xl p-3 hover:border-blue-300')
  })
})

describe('Batch 5 — Batch 2 tap/scroll guards remain intact', () => {
  const batch2 = readFileSync('src/lib/__tests__/batch2-gesture-ownership.test.ts', 'utf8')

  it('Batch 2 gesture ownership test file exists and has tests', () => {
    expect(batch2).toContain('describe')
    expect(batch2).toContain('tap')
    expect(batch2).toContain('scroll')
  })
})

describe('Batch 5 — Customer detail card order (desktop sidebar)', () => {
  const page = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('Desktop sidebar renders cards in exact desired order', () => {
    const titles = [
      'title="Previous Job Requests"',
      'title="Schedule"',
      'title="Jobs"',
      'title="Reminders"',
      'title="Payments"',
      'title="Appointments"',
      'title="Internal Notes"',
    ]

    const positions = titles.map(t => page.indexOf(t))
    // All must be present
    positions.forEach((pos, i) => {
      expect(pos, `Expected "${titles[i]}" to be present`).toBeGreaterThan(-1)
    })
    // Must be in ascending order
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i],
        `Expected "${titles[i]}" to appear after "${titles[i - 1]}"`
      ).toBeGreaterThan(positions[i - 1])
    }
  })

  it('Mobile workspace renders cards in exact desired order', () => {
    // Mobile uses uppercase tracking-wider spans, not SidebarSection title= props.
    // We check the order of the mobile section comments.
    const mobileMarkers = [
      'Previous Job Requests - prior AI/call intake records */',
      'Schedule - active/upcoming scheduled jobs only */',
      'Tasks */',
      'Payments */',
      'Appointments */',
      'Internal Notes */',
    ]

    // Find the mobile section start (after the AI Intake / VoicemailSummary area)
    const mobileStart = page.indexOf('Collapsible Sections - Below conversation')
    expect(mobileStart).toBeGreaterThan(-1)

    const mobileSection = page.substring(mobileStart)
    const positions = mobileMarkers.map(m => mobileSection.indexOf(m))
    positions.forEach((pos, i) => {
      expect(pos, `Expected mobile marker "${mobileMarkers[i]}" to be present`).toBeGreaterThan(-1)
    })
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i],
        `Expected mobile marker "${mobileMarkers[i]}" to appear after "${mobileMarkers[i - 1]}"`
      ).toBeGreaterThan(positions[i - 1])
    }
  })

  it('Jobs card appears after Schedule in mobile workspace', () => {
    const mobileStart = page.indexOf('Collapsible Sections - Below conversation')
    const mobileSection = page.substring(mobileStart)
    const schedulePos = mobileSection.indexOf('Schedule - active/upcoming scheduled jobs only */')
    const jobsPos = mobileSection.indexOf('uppercase tracking-wider">Jobs</span>')
    expect(schedulePos).toBeGreaterThan(-1)
    expect(jobsPos).toBeGreaterThan(-1)
    expect(jobsPos).toBeGreaterThan(schedulePos)
  })
})

describe('Batch 5 — Customer action labels/options remain available', () => {
  const page = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('Action menu has Create Job', () => {
    expect(page).toContain('Create Job')
  })

  it('Action menu has Add Reminder', () => {
    expect(page).toContain('Add Reminder')
  })

  it('Action menu has Request Payment', () => {
    expect(page).toContain('Request Payment')
  })

  it('Action menu has Schedule Appointment', () => {
    expect(page).toContain('Schedule Appointment')
  })

  it('Action menu has Internal Note', () => {
    expect(page).toContain('Internal Note')
  })

  it('Action menu has Messaging & Availability', () => {
    expect(page).toContain('Messaging & Availability')
  })

  it('Action menu has Refresh', () => {
    expect(page).toMatch(/Refresh/)
  })
})

describe('Batch 5 — Mobile public nav contains required 5 destinations exactly once', () => {
  const drawer = readFileSync('src/components/MobileDrawer.tsx', 'utf8')

  // The logged-out (public) mobile menu section starts after the isLoggedIn check
  // We need to count occurrences in the logged-out section only.
  // The logged-out section is the second branch of the ternary.

  it('Pricing appears in mobile drawer', () => {
    const matches = drawer.match(/href="\/pricing"/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(1)
  })

  it('FAQ appears in mobile drawer', () => {
    const matches = drawer.match(/href="\/faq"/g)
    expect(matches).not.toBeNull()
    expect(matches!.length).toBeGreaterThanOrEqual(1)
  })

  it('Privacy Policy appears in mobile drawer', () => {
    expect(drawer).toContain('Privacy Policy')
    expect(drawer).toContain('href="/privacy"')
  })

  it('Terms of Service appears in mobile drawer', () => {
    expect(drawer).toContain('Terms of Service')
    expect(drawer).toContain('href="/terms"')
  })

  it('Compliance appears in mobile drawer', () => {
    expect(drawer).toContain('Compliance')
    expect(drawer).toContain('href="/compliance"')
  })

  it('Each legal destination appears exactly once in the logged-out section', () => {
    // The logged-out section is after the last "isLoggedIn ? (" pattern.
    // We isolate the logged-out branch by finding the second occurrence of
    // the nav link pattern.
    const pricingMatches = drawer.match(/href="\/pricing"[^>]*>\s*\n\s*Pricing/g)
    expect(pricingMatches).not.toBeNull()
    // Pricing appears in both logged-in and logged-out sections, so >= 2 is OK
    // But we need exactly 1 in the logged-out section.
    // The logged-out section starts at the else branch.
    const loggedOutStart = drawer.indexOf("// Logged out navigation")
    expect(loggedOutStart).toBeGreaterThan(-1)
    const loggedOutSection = drawer.substring(loggedOutStart)

    const loggedOutPricing = loggedOutSection.match(/href="\/pricing"/g)
    expect(loggedOutPricing).not.toBeNull()
    expect(loggedOutPricing!.length).toBe(1)

    const loggedOutFaq = loggedOutSection.match(/href="\/faq"/g)
    expect(loggedOutFaq).not.toBeNull()
    expect(loggedOutFaq!.length).toBe(1)

    const loggedOutPrivacy = loggedOutSection.match(/href="\/privacy"/g)
    expect(loggedOutPrivacy).not.toBeNull()
    expect(loggedOutPrivacy!.length).toBe(1)

    const loggedOutTerms = loggedOutSection.match(/href="\/terms"/g)
    expect(loggedOutTerms).not.toBeNull()
    expect(loggedOutTerms!.length).toBe(1)

    const loggedOutCompliance = loggedOutSection.match(/href="\/compliance"/g)
    expect(loggedOutCompliance).not.toBeNull()
    expect(loggedOutCompliance!.length).toBe(1)
  })
})

describe('Batch 5 — Nav routes correct', () => {
  const drawer = readFileSync('src/components/MobileDrawer.tsx', 'utf8')

  it('Pricing routes to /pricing', () => {
    expect(drawer).toContain('href="/pricing"')
  })

  it('FAQ routes to /faq', () => {
    expect(drawer).toContain('href="/faq"')
  })

  it('Privacy Policy routes to /privacy', () => {
    expect(drawer).toContain('href="/privacy"')
  })

  it('Terms of Service routes to /terms', () => {
    expect(drawer).toContain('href="/terms"')
  })

  it('Compliance routes to /compliance', () => {
    expect(drawer).toContain('href="/compliance"')
  })

  it('Menu closes after navigation (handleNavClick calls onClose)', () => {
    expect(drawer).toContain('const handleNavClick = () => {')
    expect(drawer).toMatch(/handleNavClick[\s\S]*onClose\(\)/)
  })
})

describe('Batch 5 — Callback-time icon present', () => {
  const details = readFileSync('src/components/CustomerDetails.tsx', 'utf8')

  it('Preferred Callback Time has a Clock icon', () => {
    expect(details).toContain('Preferred Callback Time')
    // The Clock icon should be rendered alongside the field
    expect(details).toMatch(/Clock[^]*Preferred Callback Time|Preferred Callback Time[^]*Clock/)
  })

  it('Clock icon uses muted-foreground styling consistent with other fields', () => {
    expect(details).toContain('Clock className="w-4 h-4 text-muted-foreground"')
  })
})

describe('Batch 5 — Notification actions preserved', () => {
  const notifications = readFileSync('src/app/dashboard/notifications/page.tsx', 'utf8')

  it('Mark all as read action exists', () => {
    expect(notifications).toContain('handleMarkAllAsRead')
    expect(notifications).toContain('Mark all as read')
  })

  it('Clear all action exists', () => {
    expect(notifications).toContain('handleClearAll')
    expect(notifications).toContain('Clear all')
  })

  it('Mark as read (individual) action exists', () => {
    expect(notifications).toContain('handleMarkAsRead')
  })

  it('Delete notification action exists', () => {
    expect(notifications).toContain('handleDeleteNotification')
  })

  it('Mark all as read and Clear all are in the header row (not a separate subtitle row)', () => {
    // The header row should contain both the title and the action buttons
    // The actions should be in a div with ml-auto (top-right placement at all breakpoints)
    expect(notifications).toContain('ml-auto')
  })

  it('Mark all as read uses compact utility styling', () => {
    expect(notifications).toMatch(/Mark all as read/)
    // Should use compact padding (px-2.5 py-1 text-xs)
    expect(notifications).toContain('px-2.5 py-1 text-xs font-medium')
  })

  it('Clear all uses compact secondary/destructive styling', () => {
    expect(notifications).toMatch(/Clear all/)
    // Should have border (secondary action)
    expect(notifications).toContain('border border-slate-200 dark:border-slate-700')
  })

  it('Notification list tap/scroll gesture guards remain intact', () => {
    expect(notifications).toContain('pointerStateRef')
    expect(notifications).toContain('isTapGesture')
    expect(notifications).toContain('MOVE_THRESHOLD')
    expect(notifications).toContain('touch-pan-y')
  })
})

describe('Batch 5 — Attachment/composer behavior untouched', () => {
  const sheet = readFileSync('src/components/conversation/AttachmentActionSheet.tsx', 'utf8')
  const composer = readFileSync('src/components/MobileConversationComposer.tsx', 'utf8')

  it('Attachment sheet retains equal row visual weight (h-14 rows)', () => {
    expect(sheet).toContain('h-14')
  })

  it('Attachment sheet retains balanced spacing (space-y-1)', () => {
    expect(sheet).toContain('space-y-1')
  })

  it('Composer retains subtle focus ring (no heavy blue halo)', () => {
    // Focus ring should use low opacity (ring-primary/10)
    expect(composer).toContain('focus:ring-primary/10')
  })

  it('Composer Send remains strongest action (bg-blue-600)', () => {
    expect(composer).toContain('bg-blue-600')
  })

  it('Composer textarea uses focus:outline-none (no heavy halo)', () => {
    expect(composer).toContain('focus:outline-none')
  })

  it('Composer paperclip/text spacing uses gap-2', () => {
    expect(composer).toContain('gap-2')
  })
})

describe('Batch 5 — Customer header compactness + hit targets', () => {
  const page = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('Action buttons have 44px mobile hit target (h-11 w-11)', () => {
    // The button wrapper is h-11 w-11 (44px) for mobile touch compliance
    expect(page).toContain('h-11 w-11 inline-flex items-center justify-center')
  })

  it('Action button visual treatment stays compact (h-8 w-8 inner span)', () => {
    // The inner span provides the 32px visual hover area
    expect(page).toContain('h-8 w-8 inline-flex items-center justify-center rounded-lg group-hover:bg-muted/50')
  })

  it('Action icons use consistent icon weight (w-4 h-4)', () => {
    // Pencil icon
    expect(page).toContain('<Pencil className="w-4 h-4" />')
  })

  it('Status dropdown is inline with phone (not on a separate line)', () => {
    // The status dropdown should be in the same flex container as the phone
    expect(page).toContain('flex items-center gap-1.5 flex-wrap')
  })

  it('Action icons have consistent gap (gap-0.5)', () => {
    expect(page).toContain('flex items-center gap-0.5 flex-shrink-0')
  })

  it('Action buttons use group hover for hit-area/visual separation', () => {
    expect(page).toContain('group h-11 w-11')
  })
})

describe('Batch 5 — LeadStatusDropdown hit targets', () => {
  const dropdown = readFileSync('src/components/LeadStatusDropdown.tsx', 'utf8')

  it('Status trigger has >=44px effective mobile hit target (inset-[-10px] pseudo-element)', () => {
    // Touch target is achieved via inset-[-10px] pseudo-element, not min-h-[44px]
    expect(dropdown).toContain('inset-[-10px]')
  })

  it('Status trigger visual pill remains compact (inner span with sizeClasses)', () => {
    // The inner span retains the compact px-2 py-0.5 text-xs visual treatment
    expect(dropdown).toContain('px-2 py-0.5 text-xs max-w-[140px]')
    // The inner span has the visual border/bg, not the button
    expect(dropdown).toContain('border border-border dark:border-border/50 rounded-lg')
  })

  it('Status trigger uses group pattern for hit-area/visual separation', () => {
    expect(dropdown).toContain('group relative')
    expect(dropdown).toContain('group-data-[state=open]:ring-2')
  })

  it('Status menu options have >=44px mobile hit target (min-h-[44px])', () => {
    expect(dropdown).toContain('min-h-[44px] group')
  })

  it('Status menu options do NOT use old 40px min-height', () => {
    expect(dropdown).not.toContain('min-h-[40px]')
  })

  it('Batch 2 gesture protection remains on trigger (pointer handlers)', () => {
    expect(dropdown).toContain('handlePointerDown')
    expect(dropdown).toContain('handlePointerMove')
    expect(dropdown).toContain('handlePointerUp')
    expect(dropdown).toContain('shouldPreventMenuOpen')
    expect(dropdown).toContain('hasMovedBeyondThreshold')
  })

  it('Desktop visual density preserved (sizeClasses still sm/md/lg)', () => {
    expect(dropdown).toContain("sm: 'px-2 py-0.5 text-xs max-w-[140px]'")
    expect(dropdown).toContain("md: 'px-2.5 py-0.5 text-xs max-w-[160px]'")
    expect(dropdown).toContain("lg: 'px-3 py-1 text-sm max-w-[180px]'")
  })

  it('Chevron rotation on open preserved (group-data-[state=open]:rotate-180)', () => {
    expect(dropdown).toContain('group-data-[state=open]:rotate-180')
  })

  it('Customer header layout structurally unchanged (status inline with phone)', () => {
    const page = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
    expect(page).toContain('flex items-center gap-1.5 flex-wrap')
    // Status dropdown still rendered inside the phone/status flex container
    expect(page).toContain('LeadStatusDropdown')
  })
})

describe('Batch 5 — renderWorkspaceSection runtime usage', () => {
  const page = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

  it('renderWorkspaceSection is defined in page-client', () => {
    expect(page).toContain('const renderWorkspaceSection = () => {')
  })

  it('renderWorkspaceSection has NO call site (dead code)', () => {
    // The function is defined but never invoked. Search for any invocation
    // pattern: {renderWorkspaceSection}, renderWorkspaceSection(), renderWorkspaceSection }
    const callPatterns = [
      /\{renderWorkspaceSection\b/,
      /renderWorkspaceSection\(\)/,
      /renderWorkspaceSection\s*\}/,
    ]
    callPatterns.forEach(pattern => {
      // Remove the definition line first, then check for calls
      const withoutDef = page.replace('const renderWorkspaceSection = () => {', '')
      const matches = withoutDef.match(pattern)
      expect(matches, `Expected no call site for renderWorkspaceSection, found: ${matches}`).toBeNull()
    })
  })

  it('renderWorkspaceSection is not exported or passed as prop', () => {
    // Verify it's not assigned to a variable or passed elsewhere
    const withoutDef = page.replace('const renderWorkspaceSection = () => {', '')
    expect(withoutDef).not.toContain('renderWorkspaceSection')
  })
})

describe('Batch 5 — Notifications mobile alignment', () => {
  const notifications = readFileSync('src/app/dashboard/notifications/page.tsx', 'utf8')

  it('Header uses flex-row (not flex-col) for title + actions on mobile', () => {
    // Should NOT use flex-col md:flex-row — should be flex-row at all breakpoints
    expect(notifications).toContain('flex flex-row flex-wrap items-center gap-3')
  })

  it('Actions use ml-auto (not md:ml-auto) for mobile right alignment', () => {
    expect(notifications).toContain('ml-auto')
    expect(notifications).not.toContain('md:ml-auto')
  })

  it('Title container does not have md-only margin', () => {
    // The old code had mb-1 md:mb-0 — should be removed for mobile-first layout
    expect(notifications).not.toContain('mb-1 md:mb-0')
  })

  it('Actions container is right-aligned at all breakpoints', () => {
    expect(notifications).toContain('flex items-center gap-2 shrink-0 ml-auto')
  })
})
