/**
 * Booking core UX + realtime + navigation stabilization contracts.
 * Low-brittleness source assertions — no pixel/screenshot checks.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const read = (p: string) => readFileSync(p, 'utf8')
const modal = read('src/components/schedule/BookingRequestDetailModal.tsx')
const card = read('src/components/schedule/BookingRequestsCard.tsx')
const slotsRoute = read('src/app/api/booking/requests/[id]/slots/route.ts')
const sms = read('src/lib/booking/sms.ts')

describe('modal information hierarchy', () => {
  it('orders sections Customer → Request → Time → Actions → History', () => {
    const customerIdx = modal.indexOf('>Customer</p>')
    const requestIdx = modal.indexOf('>Request</p>')
    const actionsIdx = modal.indexOf('>Actions</p>')
    const historyIdx = modal.indexOf('>History</p>')
    expect(customerIdx).toBeGreaterThan(-1)
    expect(requestIdx).toBeGreaterThan(customerIdx)
    expect(actionsIdx).toBeGreaterThan(requestIdx)
    expect(historyIdx).toBeGreaterThan(actionsIdx)
    // Time block sits between Request and Actions (the rounded time card).
    const timeIdx = modal.indexOf('EEEE, MMM d')
    expect(timeIdx).toBeGreaterThan(requestIdx)
    expect(timeIdx).toBeLessThan(actionsIdx)
  })

  it('shows one status presentation per state — no duplicate Accepted/converted badges', () => {
    // Pill suppressed once converted (outcome block owns that state).
    expect(modal).toMatch(/\{status && !converted && \(/)
    expect(modal).toMatch(/STATUS_LABEL\[status\]/)
    expect(modal).not.toMatch(/Created as \$\{detail\?\.job_id \? 'Job' : 'Appointment'\}`/)
    // The time card no longer repeats an "Accepted" heading.
    expect(modal).not.toMatch(/uppercase tracking-wide text-emerald-600/)
  })
})

describe('action button hierarchy', () => {
  it('keeps Accept as the primary CTA', () => {
    expect(modal).toMatch(/bg-primary-600[^`]*\{busy === 'accept' \? 'Accepting…' : 'Accept'\}/)
  })

  it('renders Send suggested time as a real full-width primary button', () => {
    expect(modal).toMatch(/w-full rounded-lg bg-primary-600[^`]*\{busy === 'propose' \? 'Sending…' : 'Send suggested time'\}/)
  })

  it('keeps Reject visually destructive', () => {
    expect(modal).toMatch(/border-red-200[^`]*text-red-600/)
  })

  it('disables all actions while an async action is in flight', () => {
    const disabledCount = (modal.match(/disabled=\{busy !== null\}/g) ?? []).length
    expect(disabledCount).toBeGreaterThanOrEqual(6)
  })

  it('stacks actions vertically on mobile and wraps on desktop', () => {
    expect(modal).toMatch(/flex flex-col gap-2 sm:flex-row sm:flex-wrap/)
  })
})

describe('View Customer / View Job / View Appointment navigation', () => {
  it('navigates BEFORE closing so an unmount cannot cancel the route push', () => {
    const pushes = modal.match(/router\.push\(`\/dashboard\/leads\/\$\{detail\.lead_id\}`\)\s*\n?\s*onClose\(\)/g) ?? []
    expect(pushes.length).toBeGreaterThanOrEqual(3)
    // No close-then-push ordering remains anywhere.
    expect(modal).not.toMatch(/onClose\(\)\s*\n?\s*router\.push/)
  })

  it('keeps canonical destinations', () => {
    expect(modal).toMatch(/\/dashboard\/leads\/\$\{detail\.lead_id\}/)
    expect(modal).toMatch(/\/dashboard\/calendar\?tab=jobs/)
    expect(modal).toMatch(/\/dashboard\/calendar\?tab=appointments/)
  })
})

describe('request list affordance + header separation', () => {
  it('renders each request as an inset, full-card button with a chevron cue', () => {
    expect(card).toMatch(/cursor-pointer items-center justify-between gap-3 rounded-xl border border-border\/40/)
    expect(card).toMatch(/ChevronRight/)
    expect(card).toMatch(/active:bg-primary-100\/60/)
    expect(card).toMatch(/focus-visible:ring-2/)
  })

  it('separates the section header from the request list', () => {
    expect(card).toMatch(/border-b border-border\/40 pb-2\.5/)
    expect(card).toMatch(/mt-3 mb-3 space-y-2/)
  })

  it('keeps the pending count badge in the header', () => {
    expect(card).toMatch(/\{pendingCount\} pending/)
  })
})

describe('suggest-new-time initial date anchoring', () => {
  it('anchors availability at the proposed-or-requested date', () => {
    expect(slotsRoute).toMatch(/const anchorIso = req\.current_proposed_start \?\? req\.requested_start/)
    expect(slotsRoute).toMatch(/anchor\.getTime\(\) > Date\.now\(\)/)
    expect(slotsRoute).toMatch(/formatInTimeZone\(anchor, tz, 'yyyy-MM-dd'\)/)
    expect(slotsRoute).toMatch(/formatInTimeZone\(new Date\(s\.start\), tz, 'yyyy-MM-dd'\) >= anchorDay/)
  })

  it('still runs the full availability engine (horizon/notice/holds/conflicts)', () => {
    expect(slotsRoute).toMatch(/computeBookingAvailability\(auth\.businessId, undefined, req\.id\)/)
  })
})

describe('booking realtime contracts', () => {
  it('list and modal resolve realtime auth before subscribing', () => {
    for (const src of [card, modal]) {
      const setAuthIdx = src.indexOf('realtime.setAuth')
      const subscribeIdx = src.indexOf('channel.subscribe(')
      expect(setAuthIdx).toBeGreaterThan(-1)
      expect(setAuthIdx).toBeLessThan(subscribeIdx)
      expect(src).toMatch(/supabase\.auth\.getSession\(\)/)
    }
  })

  it('uses unfiltered bindings with client-side business/request guards', () => {
    expect(card).not.toMatch(/filter: `business_id=eq/)
    expect(card).toMatch(/row\?\.business_id !== businessId/)
    expect(modal).not.toMatch(/filter: `id=eq/)
    expect(modal).toMatch(/row\?\.id !== requestId/)
  })

  it('refreshes silently — no loading flash that would unmount the modal', () => {
    expect(card).toMatch(/load\(\{ silent: true \}\)/)
    expect(card).toMatch(/if \(!opts\?\.silent\) setLoading\(true\)/)
    expect(card).toMatch(/onRefresh=\{silentLoad\}/)
  })

  it('recovers a dead channel with a bounded recreation window and foreground reconcile', () => {
    for (const src of [card, modal]) {
      expect(src).toMatch(/CHANNEL_ERROR/)
      expect(src).toMatch(/TIMED_OUT/)
      expect(src).toMatch(/recoveryAttemptsRef\.current < 3/)
      expect(src).toMatch(/setRealtimeGeneration/)
      expect(src).toMatch(/visibilitychange/)
      expect(src).toMatch(/'online', reconcile/)
    }
  })
})

describe('conversion transition stays in place', () => {
  it('keeps the modal mounted through create actions (silent parent refresh)', () => {
    // runAction → refresh → onRefresh(silentLoad) → no parent loading unmount.
    expect(modal).toMatch(/setPicking\(false\)/)
    expect(modal).toMatch(/refresh\(\)/)
    expect(card).toMatch(/onRefresh=\{silentLoad\}/)
  })

  it('shows the conversion outcome in place with a View action', () => {
    expect(modal).toMatch(/Created as \{detail\.appointment_id \? 'Appointment' : 'Job'\}/)
    expect(modal).toMatch(/status === 'accepted' && !converted/)
  })
})

describe('decline SMS copy', () => {
  it('uses friendly intentional wording with business name, requested time phrase, and rebook link', () => {
    expect(sms).toMatch(/can’t accommodate your requested time for \$\{timePhrase\}/)
    expect(sms).toMatch(/You’re welcome to choose another time here:/)
    expect(sms).not.toMatch(/couldn't confirm/)
    expect(sms).not.toMatch(/rejected/)
  })
})
