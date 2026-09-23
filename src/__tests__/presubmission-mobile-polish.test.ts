/**
 * Final pre-submission mobile/web polish batch (production 80458136).
 *
 * Locks the physical-QA fixes:
 *  - Inline modals portal to document.body (escape main's z-10 stacking context).
 *  - iOS native date/datetime inputs honor their styled box (no intrinsic
 *    min-width overflow); Android keeps its native affordance.
 *  - Settings deep links scroll via the measured sticky-header offset helper.
 *  - iOS conversation keyboard path re-anchors to true bottom (settle pin +
 *    late verification pass + keyboard-class observer), preserving history reads.
 *  - Google Calendar events name their management path; removed invite history
 *    is labelled clearly; Stripe handoffs clear Android's retained highlight;
 *    quote action grid disambiguates View vs Create invoice.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..', '..')
const src = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const slice = (text: string, marker: string, span = 3000) => {
  const i = text.indexOf(marker)
  expect(i, `marker ${marker}`).toBeGreaterThan(-1)
  return text.slice(i, i + span)
}

/* ------------------------------------------------------------------ */
/* A1/A2 — inline modals portal to document.body                        */
/* ------------------------------------------------------------------ */
describe('modal portals', () => {
  const MODALS = [
    'src/components/jobs/LeadPickerModal.tsx',
    'src/components/jobs/JobDetailsModal.tsx',
    'src/components/calendar/DayDetailModal.tsx',
    'src/components/calendar/AppointmentSmsModal.tsx',
    'src/components/payments/TapToPaySetupModal.tsx',
    'src/components/notifications/NotificationPermissionEducation.tsx',
    'src/components/BetaFeedbackModal.tsx',
    'src/components/HelpTroubleshootingModal.tsx',
    'src/components/TestCallFlowModal.tsx',
    'src/components/TestSetupModal.tsx',
    'src/components/BusinessPhoneModal.tsx',
  ]
  for (const file of MODALS) {
    it(`${file} portals to document.body`, () => {
      const s = src(file)
      expect(s).toContain('createPortal')
      expect(s).toContain('document.body')
    })
  }

  it('LeadPickerModal keeps scrollable-list + fixed header/footer contract', () => {
    const s = src('src/components/jobs/LeadPickerModal.tsx')
    expect(s).toContain('data-scroll-lock-allow')
    expect(s).toContain('flex-1 min-h-0 overflow-y-auto')
    expect(s).toContain('+ Create New Customer')
    // Header, search row and footer are all flex-shrink-0 — the list alone scrolls.
    const shrinks = s.match(/flex-shrink-0/g) ?? []
    expect(shrinks.length).toBeGreaterThanOrEqual(3)
  })
})

/* ------------------------------------------------------------------ */
/* A4 — iOS date/time inputs + sticky settings offset                   */
/* ------------------------------------------------------------------ */
describe('settings inputs + sticky offset', () => {
  const css = src('src/app/globals.css')
  const settings = src('src/components/SettingsContent.tsx')

  it('removes the iOS intrinsic min-width on native date/time inputs only', () => {
    const block = slice(css, '@supports (-webkit-touch-callout: inherit)', 500)
    expect(block).toContain("input[type='date']")
    expect(block).toContain("input[type='time']")
    expect(block).toContain("input[type='datetime-local']")
    expect(block).toContain('-webkit-appearance: none')
  })

  it('keeps the invisible Android picker affordance in a 44px side slot', () => {
    const block = slice(css, '.hide-native-picker::-webkit-calendar-picker-indicator', 400)
    expect(block).toContain('width: 44px')
    expect(block).toContain('opacity: 0')
    expect(css).toContain('.booking-exception-date::-webkit-calendar-picker-indicator')
  })

  it('routes every section scroll through the measured offset helper', () => {
    const raw = settings.match(/scrollIntoView\(\{\s*behavior:\s*'smooth',\s*block:\s*'start'\s*\}\)/g) ?? []
    expect(raw, 'raw scrollIntoView block-start bypasses must be gone').toHaveLength(0)
    const helper = slice(settings, 'scrollElementBelowTabs = useCallback', 1400)
    expect(helper).toContain('settingsTabsContainerRef.current?.offsetHeight')
    expect(helper).toContain('BREATHING_ROOM_GAP')
    expect(helper).toContain('prefers-reduced-motion')
    const uses = settings.match(/scrollElementBelowTabs(Ref\.current)?\(/g) ?? []
    expect(uses.length).toBeGreaterThanOrEqual(4)
  })
})

/* ------------------------------------------------------------------ */
/* B5 — iOS conversation keyboard bottom anchoring                      */
/* ------------------------------------------------------------------ */
describe('conversation keyboard anchoring', () => {
  const s = src('src/app/dashboard/leads/[id]/page-client.tsx')

  it('settle pin writes absolute bottom unconditionally when following latest', () => {
    const block = slice(s, 'scheduleKeyboardSettlePin = useCallback', 2400)
    expect(block).not.toContain('if (isContainerNearBottom(container)) return')
    expect(block).toContain('scrollToTrueBottom(container)')
  })

  it('runs one bounded late verification pass for iOS animation tails', () => {
    const block = slice(s, 'scheduleKeyboardSettlePin = useCallback', 2400)
    expect(block).toContain('keyboard-settle-pin-late')
    // Late pass still gates on following-latest + near-bottom — history reads preserved.
    expect(block).toContain('!followLatestRef.current')
    expect(block).toContain('isContainerNearBottom(c)')
  })

  it('keyboard body-class changes drive both remeasure and bottom reconcile', () => {
    const block = slice(s, 'navVarObserver', 1400)
    expect(block).toContain('scheduleMobileCardHeight')
    expect(block).toContain("reconcileConversationBottom('keyboard-class-change')")
    expect(block).toContain("scheduleKeyboardSettlePin('keyboard-class-change')")
  })

  it('floors the mobile card at ~160px so the composer stays above the keyboard', () => {
    expect(s).toContain('card.style.height = `${Math.max(160, available)}px`')
    expect(s).not.toContain('Math.max(220')
  })

  it('measures the card against visualViewport height + offsetTop', () => {
    const block = slice(s, 'const visibleBottom', 800)
    expect(block).toContain('vv?.height ?? window.innerHeight')
    expect(block).toContain('vv?.offsetTop ?? 0')
    expect(block).toContain('getBoundingClientRect().top')
  })
})

/* ------------------------------------------------------------------ */
/* C6 — appointment ownership + customer loading                        */
/* ------------------------------------------------------------------ */
describe('appointment details', () => {
  const s = src('src/components/calendar/EventDetailsModal.tsx')
  const select = src('src/components/customers/SearchableCustomerSelect.tsx')

  it('labels the Google Calendar action for externally managed events', () => {
    expect(s).toContain('Manage in Google Calendar')
    expect(s).toContain('managed in Google Calendar')
    expect(s).toContain('edit or delete it there')
  })

  it('keeps the ReplyFlow-owned Edit/Delete actions', () => {
    expect(s).toContain('isReplyFlowOwned && !isJobEvent')
    expect(s).toContain('handleEditClick')
  })

  it('shows a loading label instead of "No customer" while resolving', () => {
    const block = slice(select, 'hasValue && !selectedCustomer && isLoading', 300)
    expect(block).toContain("'Loading…'")
    const display = slice(select, 'getDisplayText(selectedCustomer)', -0 + 0)
    expect(select).toContain('getDisplayText(selectedCustomer)')
  })
})

/* ------------------------------------------------------------------ */
/* C7 — job details customer row                                        */
/* ------------------------------------------------------------------ */
describe('job details customer row', () => {
  const s = src('src/components/jobs/JobDetailsModal.tsx')

  it('renders customer name and phone together on one inline row', () => {
    const block = slice(s, 'job.customer_name || job.customer_phone', 900)
    expect(block).toContain('job.customer_name || lead?.name')
    expect(block).toContain('tel:${job.customer_phone}')
  })

  it('renders the service address exactly once', () => {
    const blocks = s.match(/job\.service_address && \(/g) ?? []
    expect(blocks.length).toBe(1)
  })
})

/* ------------------------------------------------------------------ */
/* C8 — team access removed history                                     */
/* ------------------------------------------------------------------ */
describe('team access history', () => {
  const s = src('src/components/settings/TeamAccessSection.tsx')

  it('labels consumed invites as Access removed with an explanation', () => {
    expect(s).toContain("'Access removed'")
    expect(s).toContain('sign-in was revoked')
    expect(s).toContain('Invite history')
  })

  it('keeps other invite statuses untouched', () => {
    expect(s).toContain("inv.status === 'accepted' ? 'Access removed' : inv.status")
  })
})

/* ------------------------------------------------------------------ */
/* C9 — payments polish                                                 */
/* ------------------------------------------------------------------ */
describe('payments polish', () => {
  const page = src('src/app/dashboard/payments/page.tsx')
  const bar = src('src/components/payments/PaymentActionBar.tsx')
  const editModal = src('src/components/payments/PaymentEditModal.tsx')
  const docs = src('src/components/billing/BillingDocumentList.tsx')

  it('renders the Stripe fee notice as a compact chip', () => {
    expect(page).toContain('rounded-full')
    expect(page).toContain('Stripe processing fees apply')
    expect(page).toContain('See exact fees in Stripe')
    // Long paragraph form is gone.
    expect(page).not.toContain('View your exact fees and net earnings')
  })

  it('clears the retained button highlight before external Stripe handoffs', () => {
    expect(page).toContain('e.currentTarget.blur(); handleManageStripeDashboard()')
    expect(bar).toContain('blurAfterClick: true')
    expect(bar).toContain('e.currentTarget.blur()')
    expect(editModal).toContain('e.currentTarget.blur()')
    expect(editModal).toContain('onManageInStripe?.()')
  })

  it('disambiguates View invoice from Create invoice on quotes', () => {
    expect(docs).toContain("'View Inv.'")
    expect(docs).toContain("'New Inv.'")
    expect(docs).toContain('View invoice created from this quote')
    expect(docs).toContain('Create invoice from this quote')
  })
})
