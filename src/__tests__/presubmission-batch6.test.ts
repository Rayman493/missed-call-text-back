/**
 * FINAL PRE-SUBMISSION BATCH 6 — web closeout
 *
 * Contract-level coverage for the three bounded closeout items:
 *
 * A. Schedule → Appointments pencil opens the canonical Edit Appointment
 *    form directly (mode 'edit'), while the card still opens the summary
 *    (mode 'details'). The pencil stops propagation so it cannot also
 *    trigger the card click. Edit state resets when the modal reopens in
 *    a non-edit mode so a mid-edit close can't leak stale edit state.
 *
 * B. Email-change UI synchronization: updateUser now supplies
 *    emailRedirectTo → /auth/email-change so the Supabase confirmation
 *    link lands on a dedicated page that verifies the token, refreshes
 *    the session (propagating the new email to Settings, the account
 *    dropdown and the pending banner via the shared auth context) and
 *    renders honest states for every case — confirmed, pending second
 *    confirmation, signed-out/cross-browser, and expired/used link.
 *
 * C. Homepage Online Booking visibility (copy-only): hero paragraph
 *    mentions online bookings, and the scheduling step of the five-step
 *    illustration is retitled "Scheduling & Online Booking" in both the
 *    desktop and mobile layouts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const calendarPageSrc = readFileSync(resolve(__dirname, '../app/dashboard/calendar/page.tsx'), 'utf8')
const detailsModalSrc = readFileSync(resolve(__dirname, '../components/calendar/EventDetailsModal.tsx'), 'utf8')
const settingsSrc = readFileSync(resolve(__dirname, '../components/SettingsContent.tsx'), 'utf8')
const emailChangeSrc = readFileSync(resolve(__dirname, '../app/auth/email-change/page.tsx'), 'utf8')
const homepageSrc = readFileSync(resolve(__dirname, '../app/(public)/page.tsx'), 'utf8')
const notificationsSrc = readFileSync(resolve(__dirname, '../app/dashboard/notifications/page.tsx'), 'utf8')
const leadPickerSrc = readFileSync(resolve(__dirname, '../components/jobs/LeadPickerModal.tsx'), 'utf8')
const billingEditorSrc = readFileSync(resolve(__dirname, '../components/billing/BillingEditorModal.tsx'), 'utf8')
const businessGraphSrc = readFileSync(resolve(__dirname, '../components/analytics/BusinessActivityGraph.tsx'), 'utf8')

// ---------------------------------------------------------------------------
// A. Appointment pencil opens Edit directly
// ---------------------------------------------------------------------------
describe('Batch A — appointment pencil opens the canonical edit form', () => {
  it('MeetingsTab exposes a dedicated onEditEvent prop separate from card click', () => {
    expect(calendarPageSrc).toMatch(/onEditEvent:\s*\(event:\s*CalendarEvent\)\s*=>\s*void/)
    expect(calendarPageSrc).toMatch(/onOpenEvent[^=]*=>\s*void|onOpenEvent\?:\s*\(/)
  })

  it('pencil click calls onEditEvent with stopPropagation (never reaches the card)', () => {
    // The pencil's click AND keyboard handlers both stop propagation.
    expect(calendarPageSrc).toContain("onClick={(e) => { e.stopPropagation(); onEditEvent(ev) }}")
    expect(calendarPageSrc).toMatch(/onKeyDown=\{\(e\)\s*=>\s*\{\s*if \(e\.key === 'Enter' \|\| e\.key === ' '\)[^}]*e\.stopPropagation\(\);\s*onEditEvent\(ev\)/)
  })

  it('pencil path opens the modal in edit mode; card path still opens details', () => {
    // Edit entry (pencil):
    expect(calendarPageSrc).toMatch(/onEditEvent=\{\(event\)\s*=>\s*\{[^}]*setSelectedEvent\(event\)[^}]*setEventDetailsMode\('edit'\)[^}]*setIsEventDetailsOpen\(true\)/)
    // Card/summary entry still uses details mode somewhere in the page:
    expect(calendarPageSrc).toContain("setEventDetailsMode('details')")
  })

  it('delete affordance remains a separate stopPropagation handler', () => {
    expect(calendarPageSrc).toContain("onClick={(e) => { e.stopPropagation(); onDeleteAppointment(ev) }}")
  })

  it('EventDetailsModal supports an edit mode that enters isEditing', () => {
    expect(detailsModalSrc).toContain("'details' | 'add-location' | 'edit'")
    expect(detailsModalSrc).toMatch(/mode === 'edit'[\s\S]{0,120}setIsEditing\(true\)/)
  })

  it('reopening the modal in a non-edit mode clears stale edit state', () => {
    // The mode effect must reset isEditing on details/add-location opens so a
    // modal closed mid-edit cannot resurrect the form on the next open.
    expect(detailsModalSrc).toMatch(/\}\s*else\s*\{\s*setIsEditing\(false\)/)
  })

  it('event changes clear every optional draft field before populating the selected appointment', () => {
    const initialization = detailsModalSrc.slice(
      detailsModalSrc.indexOf('// Initialize form state when event changes'),
      detailsModalSrc.indexOf('// Enter edit mode when opened via the pencil'),
    )
    for (const reset of [
      "setEditedNotes('')",
      "setEditedStartDate('')",
      "setEditedStartTime('')",
      "setEditedEndTime('')",
    ]) {
      expect(initialization).toContain(reset)
    }
    expect(initialization).toContain('setEditedSummary(event.summary)')
    expect(initialization).toContain("setEditedDescription(event.description || '')")
    expect(initialization).toContain("setEditedLocation(event.location || '')")
  })

  it('ignores stale meeting metadata when appointment selection changes', () => {
    const metadataEffect = detailsModalSrc.slice(
      detailsModalSrc.indexOf('// Load meeting metadata on open'),
      detailsModalSrc.indexOf('if (!isOpen || !event) return null'),
    )
    expect(metadataEffect).toContain('let cancelled = false')
    expect(metadataEffect).toContain('if (cancelled) return')
    expect(metadataEffect).toContain('return () => { cancelled = true }')
    expect(metadataEffect).toContain("setEditedNotes(rec.notes || '')")
    expect(metadataEffect).toContain("setEditedNotes('')")
  })
})

// ---------------------------------------------------------------------------
// B. Email-change UI synchronization
// ---------------------------------------------------------------------------
describe('Batch B — email-change confirmation lands on a syncing page', () => {
  it('updateUser supplies emailRedirectTo → /auth/email-change on initial change', () => {
    const emailCalls = settingsSrc.split('updateUser(').slice(1).filter(c => c.slice(0, 120).includes('email:'))
    expect(emailCalls.length).toBe(2) // initial change + resend (password change needs none)
    emailCalls.forEach(c => expect(c.slice(0, 400)).toContain('/auth/email-change'))
  })

  it('confirmation page verifies token_hash via verifyOtp(email_change)', () => {
    expect(emailChangeSrc).toMatch(/verifyOtp\(\{\s*token_hash:[^}]*type:\s*'email_change'\s*\}\)/)
  })

  it('confirmation page refreshes the session so shared auth context updates immediately', () => {
    // refreshSession() is what propagates the new email to the JWT →
    // AuthContext user → Settings display + account dropdown + pending banner.
    expect(emailChangeSrc).toContain('refreshSession()')
    // getUser() is the authoritative server read used for the displayed result.
    expect(emailChangeSrc).toContain('getUser()')
  })

  it('handles every terminal state without false success', () => {
    for (const state of ['confirmed', 'confirmed_signed_out', 'pending_other_inbox', 'error', 'verifying']) {
      expect(emailChangeSrc).toContain(`'${state}'`)
    }
    // Expired/used links surface the error state, never success.
    expect(emailChangeSrc).toMatch(/errorParam[\s\S]{0,60}setState\('error'\)/)
    // new_email still set → honest pending state, not a success claim.
    expect(emailChangeSrc).toMatch(/user\.new_email[\s\S]{0,120}setState\('pending_other_inbox'\)/)
    // No session (cross-browser / signed out) → sign-in guidance.
    expect(emailChangeSrc).toMatch(/error: userError[\s\S]*?setState\('confirmed_signed_out'\)|!user[\s\S]{0,80}setState\('confirmed_signed_out'\)/)
  })

  it('PKCE code exchange failure is non-fatal (cross-browser verify still resolves)', () => {
    expect(emailChangeSrc).toMatch(/exchangeCodeForSession\(code\)\.catch\(/)
  })

  it('existing pending-change cancel flow is untouched', () => {
    expect(settingsSrc).toContain("fetch('/api/account/cancel-email-change'")
  })
})

// ---------------------------------------------------------------------------
// C. Homepage Online Booking copy
// ---------------------------------------------------------------------------
describe('Batch C — homepage Online Booking visibility (copy only)', () => {
  it('hero paragraph mentions online bookings alongside calls, scheduling and payments', () => {
    expect(homepageSrc).toContain(
      'Capture customer details from missed calls, accept online bookings, manage conversations, schedule work, send quotes and invoices, and get paid'
    )
  })

  it('five-step scheduling step is retitled in both desktop and mobile layouts', () => {
    const occurrences = homepageSrc.match(/Scheduling &amp; Online Booking/g) || []
    expect(occurrences.length).toBe(2) // desktop card + mobile card
    expect(homepageSrc).toContain('Let customers book online or schedule appointments yourself')
    expect(homepageSrc).toContain('Customers book online, or you schedule it')
  })

  it('headline, CTA and step count are unchanged', () => {
    expect(homepageSrc).toContain('From First Call to Final Payment')
    // Still exactly five steps — no sixth step added.
    expect(homepageSrc).toContain('Missed Call')
    expect(homepageSrc).toContain('AI Answers')
    expect(homepageSrc).toContain('Lead Captured')
    expect(homepageSrc).toContain('Get Paid')
  })

  it('orders hero description, pricing, checkmarks, then dashboard CTA', () => {
    const hero = homepageSrc.slice(homepageSrc.indexOf('<section'), homepageSrc.indexOf('</section>'))
    const description = hero.indexOf('Capture customer details from missed calls')
    const pricing = hero.indexOf('14-day free trial • $59/month after • Cancel anytime')
    const checkmarks = hero.indexOf('Capture More Leads')
    const cta = hero.indexOf('<HomepageCTA variant="hero" showPricing={false} />')
    expect(description).toBeLessThan(pricing)
    expect(pricing).toBeLessThan(checkmarks)
    expect(checkmarks).toBeLessThan(cta)
  })
})

describe('Remaining web closeout contracts', () => {
  it('closes Job Details before opening Edit Job', () => {
    expect(calendarPageSrc).toMatch(/onEdit=\{\(job\)\s*=>\s*\{\s*setIsJobDetailsOpen\(false\);[^}]*setEditingJob\(job\)[^}]*setIsJobComposerOpen\(true\)/)
  })

  it('protects notification scrolling and offers a safe-area-aware Back to top control', () => {
    expect(notificationsSrc).toContain('touch-pan-y')
    expect(notificationsSrc).toContain('overscroll-x-none')
    expect(notificationsSrc).toContain('aria-label="Back to top"')
    expect(notificationsSrc).toContain("window.scrollTo({ top: 0, behavior: 'smooth' })")
    expect(notificationsSrc).toContain('env(safe-area-inset-bottom)')
  })

  it('keeps the payment customer picker scroll isolated on iOS', () => {
    expect(leadPickerSrc).toContain('overflow-y-auto overscroll-contain')
    expect(leadPickerSrc).toContain('data-scroll-lock-allow')
    expect(leadPickerSrc).toContain("WebkitOverflowScrolling: 'touch'")
  })

  it('keeps graph selection switchable with subtle point highlighting', () => {
    expect(businessGraphSrc).toContain('toggleDatum')
    expect(businessGraphSrc).toContain('setSelectedDatum')
    expect(businessGraphSrc).toContain('activeDot={{ r: CHART_STYLES.activeDotRadius')
  })

  it('keeps quote and invoice footer actions spaced and safe-area aware', () => {
    expect(billingEditorSrc).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(billingEditorSrc).toContain('gap-1.5 sm:gap-2')
  })
})
