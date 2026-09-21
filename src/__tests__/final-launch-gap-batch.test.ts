import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const calendarPage = readFileSync('src/app/dashboard/calendar/page.tsx', 'utf8')
const bookingModal = readFileSync('src/components/schedule/BookingRequestDetailModal.tsx', 'utf8')
const recentActivity = readFileSync('src/components/RecentActivityCard.tsx', 'utf8')
const leadPage = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
const voicemailPage = readFileSync('src/app/dashboard/personal-voicemail/page.tsx', 'utf8')
const voicemailPlayer = readFileSync('src/components/PersonalVoicemailPlayer.tsx', 'utf8')
const settingsContent = readFileSync('src/components/SettingsContent.tsx', 'utf8')
const ignoredContactIdRoute = readFileSync('src/app/api/ignored-contacts/[id]/route.ts', 'utf8')
const pushDelivery = readFileSync('src/lib/push-delivery.ts', 'utf8')
const utils = readFileSync('src/lib/utils.ts', 'utf8')
const messageStatusRoute = readFileSync('src/app/api/twilio/message-status/route.ts', 'utf8')

// ---------------------------------------------------------------------------
// ISSUE 1 — Booking → created Job reconciles without refresh
// ---------------------------------------------------------------------------
describe('Issue 1 — Jobs realtime reconciliation', () => {
  it('subscribes to postgres_changes on the jobs table', () => {
    expect(calendarPage).toContain("table: 'jobs'")
    expect(calendarPage).toContain('postgres_changes')
  })

  it('guards realtime payloads by business_id', () => {
    expect(calendarPage).toContain('row?.business_id !== businessId')
  })

  it('debounces refetch through the canonical fetchJobs', () => {
    expect(calendarPage).toContain('jobsRealtimeDebounceRef')
    expect(calendarPage).toContain('fetchJobs()')
  })

  it('resolves realtime auth before subscribing (RLS boundary)', () => {
    expect(calendarPage).toContain('realtime.setAuth')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 2 — View Job actually navigates
// ---------------------------------------------------------------------------
describe('Issue 2 — View Job / View Appointment navigation', () => {
  it('View Job navigates to the exact job on the jobs tab', () => {
    expect(bookingModal).toContain("navigateFromModal(`/dashboard/calendar?tab=jobs&job=${detail.job_id}`)")
  })

  it('View Appointment navigates to the exact event on the appointments tab', () => {
    expect(bookingModal).toContain("navigateFromModal(`/dashboard/calendar?tab=appointments&event=${detail.appointment_id}`)")
  })

  it('calendar page syncs ?tab= on same-page navigation (not just mount)', () => {
    const tabSync = calendarPage.indexOf("searchParams?.get('tab')")
    expect(tabSync).toBeGreaterThan(-1)
    // The sync must live in an effect that re-runs on searchParams change,
    // not only inside the useState initializer.
    const effectRegion = calendarPage.substring(tabSync - 500, tabSync + 800)
    expect(effectRegion).toContain('useEffect')
    expect(calendarPage).toContain('setScheduleTab((prev) => (prev === tabParam ? prev : tabParam))')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 3 — Booking Accept green pill
// ---------------------------------------------------------------------------
describe('Issue 3 — Accept button styling', () => {
  it('Accept uses the green success pill treatment', () => {
    const acceptIdx = bookingModal.indexOf("runAction('accept')")
    expect(acceptIdx).toBeGreaterThan(-1)
    const region = bookingModal.substring(acceptIdx, acceptIdx + 400)
    expect(region).toContain('rounded-full')
    expect(region).toContain('bg-emerald-600')
    expect(region).toContain('hover:bg-emerald-700')
  })

  it('Accept stays disabled while any action is in-flight', () => {
    expect(bookingModal).toContain('disabled={busy !== null}')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 4 — Appointments status pill parity with Jobs
// ---------------------------------------------------------------------------
describe('Issue 4 — Appointment status pills', () => {
  it('Scheduled pill uses the stronger blue treatment', () => {
    expect(calendarPage).toContain('bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 whitespace-nowrap font-semibold')
  })

  it('Completed pill uses the stronger green treatment', () => {
    expect(calendarPage).toContain('bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 whitespace-nowrap font-semibold')
  })

  it('Past pill uses the stronger amber treatment', () => {
    expect(calendarPage).toContain('bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 whitespace-nowrap font-semibold')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 5 — RecentActivity query repairs
// ---------------------------------------------------------------------------
describe('Issue 5 — RecentActivityCard query repairs', () => {
  it('uses explicit !lead_id FK for payment_requests embed (PGRST201)', () => {
    expect(recentActivity).toContain('payment_requests!lead_id(')
    expect(recentActivity).toContain('leads!lead_id(')
  })

  it('uses contact_name, not the stale leads.name column', () => {
    expect(recentActivity).toContain('contact_name')
    expect(recentActivity).not.toContain('caller_phone, name')
    expect(recentActivity).not.toContain('lead?.name')
    expect(recentActivity).not.toContain('lead.name')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 6 — RecentActivity partial failure resilience
// ---------------------------------------------------------------------------
describe('Issue 6 — RecentActivity partial failure resilience', () => {
  it('tracks per-source query errors', () => {
    expect(recentActivity).toContain('hadQueryError = true')
  })

  it('shows full error only when no trustworthy result exists', () => {
    expect(recentActivity).toContain('setLoadFailed(hadQueryError && sortedEvents.length === 0)')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 7 — Node.contains guard
// ---------------------------------------------------------------------------
describe('Issue 7 — isDomNode guard', () => {
  it('isDomNode is defined in lib/utils', () => {
    expect(utils).toContain('isDomNode')
  })

  it('calendar overflow click-outside guards before contains()', () => {
    const region = calendarPage.substring(calendarPage.indexOf('isClickInsideDesktopButton') - 400)
    expect(calendarPage).toContain('isDomNode(target)')
    expect(region).toContain('isDomNode(target)')
  })
})

// ---------------------------------------------------------------------------
// ISSUES 8-9 — Conversation keyboard bottom anchor
// ---------------------------------------------------------------------------
describe('Issues 8-9 — Keyboard settle re-anchor', () => {
  it('defines a bounded settle delay', () => {
    expect(leadPage).toContain('KEYBOARD_SETTLE_DELAY_MS')
  })

  it('re-pins to true bottom after the keyboard settle, gated on follow intent', () => {
    const fnIdx = leadPage.indexOf('scheduleKeyboardSettlePin')
    expect(fnIdx).toBeGreaterThan(-1)
    const body = leadPage.substring(fnIdx, fnIdx + 1200)
    expect(body).toContain('followLatestRef.current')
    expect(body).toContain('scrollToTrueBottom')
    expect(body).toContain('isContainerNearBottom')
  })

  it('settles on composer focus and blur (open/close cycles)', () => {
    expect(leadPage).toContain("scheduleKeyboardSettlePin('composer-focus')")
    expect(leadPage).toContain("scheduleKeyboardSettlePin('composer-blur')")
    expect(leadPage).toContain("scheduleKeyboardSettlePin('visual-viewport-resize')")
  })

  it('clears the settle timer on cleanup', () => {
    expect(leadPage).toContain('window.clearTimeout(keyboardSettleTimerRef.current)')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 10 — Voicemail delete toast
// ---------------------------------------------------------------------------
describe('Issue 10 — Voicemail delete toast', () => {
  it('shows success toast only after authoritative delete success', () => {
    const idx = voicemailPage.indexOf('Voicemail deleted')
    expect(idx).toBeGreaterThan(-1)
    const region = voicemailPage.substring(idx - 600, idx + 100)
    expect(region).toContain('response.ok')
    expect(region).toContain('setVoicemails')
  })

  it('shows an error toast on failure and keeps the voicemail', () => {
    expect(voicemailPage).toContain('delete voicemail. Please try again')
  })

  it('disables delete while in-flight', () => {
    expect(voicemailPage).toContain('disabled={deletingId === voicemail.id}')
  })

  it('renders the canonical ToastContainer', () => {
    expect(voicemailPage).toContain('ToastContainer')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 11 — Voicemail left highlight removed
// ---------------------------------------------------------------------------
describe('Issue 11 — Voicemail highlight', () => {
  it('no duplicate blue left-edge highlight (New pill is canonical)', () => {
    expect(voicemailPage).not.toContain('border-l-4 border-l-blue-500')
  })

  it('New pill still communicates unread state', () => {
    expect(voicemailPage).toContain('!voicemail.listened_at')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 13 — Voicemail seek thumb affordance
// ---------------------------------------------------------------------------
describe('Issue 13 — Seek bar thumb', () => {
  it('progress range has a visible slider thumb', () => {
    const idx = voicemailPlayer.indexOf('Voicemail playback position')
    expect(idx).toBeGreaterThan(-1)
    const region = voicemailPlayer.substring(idx - 1500, idx)
    expect(region).toContain('::-webkit-slider-thumb')
    expect(region).toContain('::-moz-range-thumb')
    expect(region).toContain('rounded-full')
  })
})

// ---------------------------------------------------------------------------
// ISSUES 14-15 — Personal contact label edit
// ---------------------------------------------------------------------------
describe('Issues 14-15 — Personal contact edit', () => {
  it('PATCH route updates only the label', () => {
    expect(ignoredContactIdRoute).toContain('export async function PATCH')
    expect(ignoredContactIdRoute).toContain('.update({ label })')
    expect(ignoredContactIdRoute).not.toContain('phone_number: body')
  })

  it('PATCH is business-scoped and 404s on foreign/missing rows', () => {
    expect(ignoredContactIdRoute).toContain(".eq('business_id', business.id)")
    expect(ignoredContactIdRoute).toContain("'Ignored contact not found'")
  })

  it('edit modal prefills the existing label', () => {
    expect(settingsContent).toContain('setEditLabel(contact.label ||')
    expect(settingsContent).toContain('Edit Personal Contact')
  })

  it('failure keeps modal open with visible error', () => {
    expect(settingsContent).toContain('editContactError')
    const fnIdx = settingsContent.indexOf('handleUpdateIgnoredContact')
    const body = settingsContent.substring(fnIdx, fnIdx + 2500)
    expect(body).toContain('setEditContactError')
    expect(body).not.toContain('setIgnoredContacts(prev =>\n        prev.filter')
  })

  it('local state reconciles from the persisted record, not the form value', () => {
    expect(settingsContent).toContain('data.ignoredContact.id')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 16 — Push delivery observability
// ---------------------------------------------------------------------------
describe('Issue 16 — Push delivery audit', () => {
  it('logs per-token failure classification', () => {
    expect(pushDelivery).toContain('tokenFailures')
    expect(pushDelivery).toContain('errorCode')
    expect(pushDelivery).toContain('permanent')
  })
})

// ---------------------------------------------------------------------------
// ISSUE 17 — Twilio callback handling verified correct
// ---------------------------------------------------------------------------
describe('Issue 17 — Twilio message-status callback', () => {
  it('checks system_sms before warning on missing sid', () => {
    const sysIdx = messageStatusRoute.indexOf("from('system_sms')")
    const warnIdx = messageStatusRoute.indexOf('message not found for sid')
    expect(sysIdx).toBeGreaterThan(-1)
    expect(warnIdx).toBeGreaterThan(sysIdx)
  })

  it('returns 200 for orphan sids (no retry storm)', () => {
    const warnIdx = messageStatusRoute.indexOf('message not found for sid')
    const region = messageStatusRoute.substring(warnIdx, warnIdx + 200)
    expect(region).toContain("status: 200")
  })
})
