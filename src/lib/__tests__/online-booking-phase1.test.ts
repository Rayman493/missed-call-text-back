import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'

const read = (rel: string) => readFileSync(rel, 'utf8').replace(/\r\n/g, '\n')

import {
  generateAvailableSlots,
  isSlotAvailable,
  windowsFromBusinessHours,
  type WeeklyWindow,
} from '@/lib/booking/availability-core'
import { formatInTimeZone } from 'date-fns-tz'
import {
  generateContinuationToken,
  isValidContinuationToken,
} from '@/lib/booking/tokens'
import { slugifyBusinessName, normalizeSlug } from '@/lib/booking/settings'
import { normalizeSourceCounts } from '@/lib/lead-source-normalization'
import { getProvenanceLabel, getCustomerSourceInfoCanonical } from '@/lib/customer-source'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TZ = 'America/New_York'

const monFri: WeeklyWindow[] = [1, 2, 3, 4, 5].map(d => ({
  day_of_week: d,
  start_time: '09:00',
  end_time: '17:00',
}))

const baseInput = {
  timezone: TZ,
  windows: monFri,
  exceptions: [] as { start: Date; end: Date }[],
  busy: [] as { start: Date; end: Date }[],
  durationMin: 60,
  intervalMin: 60,
  minNoticeMin: 0,
  horizonDays: 30,
}

// 2026-03-02 is a Monday
const MONDAY = new Date('2026-03-02T14:00:00Z') // 9:00 AM ET

const startsOf = (slots: { start: string }[]) => slots.map(s => s.start)

/* ------------------------------------------------------------------ */
/*  Availability engine — pure core                                    */
/* ------------------------------------------------------------------ */

describe('generateAvailableSlots — weekly windows', () => {
  it('generates slots on an open weekday within booking hours', () => {
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY })
    expect(slots.length).toBeGreaterThan(0)
    // 9:00 AM ET on Monday 2026-03-02 = 14:00Z (EST, UTC-5)
    expect(startsOf(slots)).toContain('2026-03-02T14:00:00.000Z')
    // every slot is exactly durationMin
    for (const s of slots) {
      expect(new Date(s.end).getTime() - new Date(s.start).getTime()).toBe(60 * 60_000)
    }
  })

  it('produces no slots on a closed day (Sunday)', () => {
    // 2026-03-01 is a Sunday — start generation just before it
    const sundayMorning = new Date('2026-03-01T05:00:00Z')
    const slots = generateAvailableSlots({ ...baseInput, now: sundayMorning, horizonDays: 1 })
    const sundayStarts = slots.filter(s => s.start.startsWith('2026-03-01'))
    expect(sundayStarts).toHaveLength(0)
  })

  it('excludes slots that would end after closing time', () => {
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY })
    // Last valid start is 16:00 ET (21:00Z) → ends exactly at 17:00 close
    expect(startsOf(slots)).not.toContain('2026-03-02T21:30:00.000Z')
    for (const s of slots.filter(s => s.start.startsWith('2026-03-02'))) {
      expect(new Date(s.end).getTime()).toBeLessThanOrEqual(
        new Date('2026-03-02T22:00:00Z').getTime() // 17:00 ET
      )
    }
  })

  it('respects the booking horizon', () => {
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, horizonDays: 3 })
    // Horizon = business-local calendar days: slots may fill the horizon day,
    // but nothing beyond it. Max local date = today + 3 days.
    const maxLocal = formatInTimeZone(
      new Date(MONDAY.getTime() + 3 * 86_400_000), TZ, 'yyyy-MM-dd'
    )
    for (const s of slots) {
      const localDay = formatInTimeZone(new Date(s.start), TZ, 'yyyy-MM-dd')
      expect(localDay <= maxLocal).toBe(true)
    }
  })

  it('enforces minimum notice', () => {
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, minNoticeMin: 240 })
    // Earliest bookable = 13:00 ET = 18:00Z
    const earliest = Math.min(...slots.map(s => new Date(s.start).getTime()))
    expect(earliest).toBeGreaterThanOrEqual(MONDAY.getTime() + 240 * 60_000)
  })

  it('never generates slots in the past', () => {
    const evening = new Date('2026-03-03T02:00:00Z') // Monday 9PM ET
    const slots = generateAvailableSlots({ ...baseInput, now: evening })
    for (const s of slots) {
      expect(new Date(s.end).getTime()).toBeGreaterThan(evening.getTime())
    }
  })
})

describe('generateAvailableSlots — busy windows and exceptions', () => {
  it('removes slots that overlap a busy window', () => {
    const busy = [{ start: new Date('2026-03-02T15:00:00Z'), end: new Date('2026-03-02T16:00:00Z') }] // 10–11 AM ET
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, busy })
    expect(startsOf(slots)).not.toContain('2026-03-02T15:00:00.000Z')
    // neighbors unaffected
    expect(startsOf(slots)).toContain('2026-03-02T14:00:00.000Z')
    expect(startsOf(slots)).toContain('2026-03-02T16:00:00.000Z')
  })

  it('allows back-to-back slots (end == next start is not a conflict)', () => {
    const busy = [{ start: new Date('2026-03-02T15:00:00Z'), end: new Date('2026-03-02T16:00:00Z') }]
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, busy })
    // 16:00Z start touches busy end — must remain available
    expect(startsOf(slots)).toContain('2026-03-02T16:00:00.000Z')
  })

  it('blocks a whole day with an all-day exception', () => {
    const exceptions = [
      { start: new Date('2026-03-03T05:00:00Z'), end: new Date('2026-03-04T05:00:00Z') }, // Tuesday local day
    ]
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, exceptions })
    expect(slots.filter(s => s.start.startsWith('2026-03-03'))).toHaveLength(0)
    // Monday unaffected
    expect(slots.filter(s => s.start.startsWith('2026-03-02')).length).toBeGreaterThan(0)
  })

  it('blocks only overlapping slots for a partial-day exception', () => {
    const exceptions = [
      { start: new Date('2026-03-02T14:00:00Z'), end: new Date('2026-03-02T17:00:00Z') }, // 9AM–12PM ET
    ]
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, exceptions })
    const mondayStarts = startsOf(slots.filter(s => s.start.startsWith('2026-03-02')))
    expect(mondayStarts).not.toContain('2026-03-02T14:00:00.000Z')
    expect(mondayStarts).not.toContain('2026-03-02T16:00:00.000Z')
    expect(mondayStarts).toContain('2026-03-02T17:00:00.000Z') // noon slot open
  })

  it('handles exceptions spanning multiple days', () => {
    const exceptions = [
      { start: new Date('2026-03-03T00:00:00Z'), end: new Date('2026-03-05T00:00:00Z') }, // Tue–Wed gone
    ]
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY, exceptions, horizonDays: 7 })
    expect(slots.filter(s => s.start.startsWith('2026-03-03'))).toHaveLength(0)
    expect(slots.filter(s => s.start.startsWith('2026-03-04'))).toHaveLength(0)
    expect(slots.filter(s => s.start.startsWith('2026-03-05')).length).toBeGreaterThan(0)
  })
})

describe('isSlotAvailable — canonical revalidation', () => {
  const input = { ...baseInput, now: MONDAY }

  it('accepts a valid slot', () => {
    const r = isSlotAvailable({ ...input, start: new Date('2026-03-04T15:00:00Z'), end: new Date('2026-03-04T16:00:00Z') })
    expect(r.ok).toBe(true)
  })

  it('rejects a slot overlapping busy time', () => {
    const busy = [{ start: new Date('2026-03-04T15:30:00Z'), end: new Date('2026-03-04T16:30:00Z') }]
    const r = isSlotAvailable({ ...input, busy, start: new Date('2026-03-04T15:00:00Z'), end: new Date('2026-03-04T16:00:00Z') })
    expect(r).toEqual({ ok: false, reason: 'conflict' })
  })

  it('rejects wrong duration', () => {
    const r = isSlotAvailable({ ...input, start: new Date('2026-03-04T15:00:00Z'), end: new Date('2026-03-04T15:30:00Z') })
    expect(r).toEqual({ ok: false, reason: 'wrong_duration' })
  })

  it('rejects a slot outside booking hours', () => {
    const r = isSlotAvailable({ ...input, start: new Date('2026-03-04T02:00:00Z'), end: new Date('2026-03-04T03:00:00Z') }) // 9PM ET
    expect(r).toEqual({ ok: false, reason: 'outside_hours' })
  })

  it('rejects a slot on a closed day', () => {
    const r = isSlotAvailable({ ...input, start: new Date('2026-03-08T15:00:00Z'), end: new Date('2026-03-08T16:00:00Z') }) // future Sunday
    expect(r).toEqual({ ok: false, reason: 'outside_hours' })
  })

  it('rejects a slot in the past', () => {
    const r = isSlotAvailable({ ...input, start: new Date('2026-03-02T13:00:00Z'), end: new Date('2026-03-02T14:00:00Z') })
    expect(r).toEqual({ ok: false, reason: 'past' })
  })

  it('rejects a slot inside minimum notice', () => {
    const soon = new Date(MONDAY.getTime() + 60 * 60_000)
    const r = isSlotAvailable({ ...input, minNoticeMin: 240, start: soon, end: new Date(soon.getTime() + 60 * 60_000) })
    expect(r).toEqual({ ok: false, reason: 'too_soon' })
  })
})

describe('timezone + DST handling', () => {
  it('generates correct UTC across the March DST transition', () => {
    // US spring-forward: 2026-03-08. Before: EST UTC-5 → 9AM = 14:00Z.
    // After: EDT UTC-4 → 9AM = 13:00Z.
    const before = generateAvailableSlots({
      ...baseInput, now: new Date('2026-03-06T10:00:00Z'), horizonDays: 1,
    })
    const fri6 = startsOf(before.filter(s => s.start.startsWith('2026-03-06')))
    expect(fri6[0]).toBe('2026-03-06T14:00:00.000Z') // 9AM EST

    const after = generateAvailableSlots({
      ...baseInput, now: new Date('2026-03-09T10:00:00Z'), horizonDays: 1,
    })
    const mon9 = startsOf(after.filter(s => s.start.startsWith('2026-03-09')))
    expect(mon9[0]).toBe('2026-03-09T13:00:00.000Z') // 9AM EDT — shifted one UTC hour
  })

  it('honors a different business timezone', () => {
    const slots = generateAvailableSlots({
      ...baseInput, timezone: 'America/Los_Angeles',
      now: new Date('2026-03-02T16:00:00Z'), horizonDays: 1,
    })
    const mondayStarts = startsOf(slots.filter(s => s.start.startsWith('2026-03-02')))
    // 9AM PT = 17:00Z (PST, UTC-8)
    expect(mondayStarts[0]).toBe('2026-03-02T17:00:00.000Z')
  })
})

describe('public slot shape', () => {
  it('slots expose only { start, end } ISO strings', () => {
    const slots = generateAvailableSlots({ ...baseInput, now: MONDAY })
    for (const s of slots.slice(0, 20)) {
      expect(Object.keys(s).sort()).toEqual(['end', 'start'])
      expect(typeof s.start).toBe('string')
      expect(typeof s.end).toBe('string')
    }
  })
})

describe('windowsFromBusinessHours — business-hours fallback', () => {
  it('maps Mon–Fri windows from business hours', () => {
    const windows = windowsFromBusinessHours('08:00', '17:00')
    expect(windows).toHaveLength(5)
    expect(windows.map(w => w.day_of_week).sort()).toEqual([1, 2, 3, 4, 5])
    expect(windows[0]).toMatchObject({ start_time: '08:00', end_time: '17:00' })
  })

  it('returns no windows when business hours are unset', () => {
    expect(windowsFromBusinessHours(null, null)).toEqual([])
    expect(windowsFromBusinessHours('08:00', null)).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/*  Continuation tokens                                                */
/* ------------------------------------------------------------------ */

describe('continuation tokens', () => {
  it('generates 256-bit opaque tokens that pass the validator', () => {
    for (let i = 0; i < 50; i++) {
      const token = generateContinuationToken()
      expect(isValidContinuationToken(token)).toBe(true)
      expect(token.length).toBeGreaterThanOrEqual(40)
    }
  })

  it('generates unique tokens (no collisions across 1000 draws)', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateContinuationToken()))
    expect(tokens.size).toBe(1000)
  })

  it('rejects invalid tokens — short, sequential ids, garbage, empty', () => {
    for (const bad of ['', '1', '123', 'abc', 'aaaaa', 'request-42', '../../../etc/passwd', '<script>', 'a'.repeat(200)]) {
      expect(isValidContinuationToken(bad)).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  Public slug                                                        */
/* ------------------------------------------------------------------ */

describe('public booking slug', () => {
  it('slugifies business names into URL-safe slugs', () => {
    expect(slugifyBusinessName('Joe\'s Plumbing LLC')).toBe('joe-s-plumbing-llc')
    expect(slugifyBusinessName('  ACME  Services!! ')).toBe('acme-services')
    expect(slugifyBusinessName('Café René')).toBe('caf-ren')
  })

  it('rejects invalid slugs in normalizeSlug', () => {
    for (const bad of ['', 'ab', 'with space', 'with_underscore', '../traversal', '-leading', 'a'.repeat(100)]) {
      expect(normalizeSlug(bad)).toBeNull()
    }
    expect(normalizeSlug('joes-plumbing')).toBe('joes-plumbing')
    // Input is normalized to lowercase — uppercase input yields a valid slug
    expect(normalizeSlug('Joes-Plumbing')).toBe('joes-plumbing')
    expect(normalizeSlug('UPPER-CASE')).toBe('upper-case')
  })
})

/* ------------------------------------------------------------------ */
/*  Customer source — Booking badge                                    */
/* ------------------------------------------------------------------ */

describe('online_booking source normalization', () => {
  it('charts online_booking under the Booking category', () => {
    const result = normalizeSourceCounts({ online_booking: 3, manual: 2, ai_voice: 5 })
    const booking = result.chartData.find(d => d.name === 'Booking')
    expect(booking?.value).toBe(3)
    expect(result.chartData.find(d => d.name === 'Manually Added')?.value).toBe(2)
    expect(result.chartData.find(d => d.name === 'ReplyFlow Intake')?.value).toBe(5)
  })

  it('resolves provenance label "Booking" from every precedence tier', () => {
    expect(getProvenanceLabel({ source: 'online_booking' })).toBe('Booking')
    expect(getProvenanceLabel({ raw_metadata: { source: 'online_booking' } })).toBe('Booking')
    expect(getProvenanceLabel({ raw_metadata: { creation_source: 'online_booking' } })).toBe('Booking')
  })

  it('returns Booking source info for the customer card badge', () => {
    const info = getCustomerSourceInfoCanonical({ source: 'online_booking' })
    expect(info).toMatchObject({ type: 'booking', label: 'Booking' })
  })

  it('preserves existing source semantics (regression)', () => {
    expect(getProvenanceLabel({ source: 'manual' })).toBe('Manually Added')
    // Channel qualifier requires intake_sources metadata — canonical behavior
    expect(getProvenanceLabel({ source: 'ai_voice' })).toBe('ReplyFlow Intake')
    expect(getProvenanceLabel({ source: 'sms' })).toBe('ReplyFlow Intake')
    expect(getProvenanceLabel({ source: 'web' })).toBeNull()
    expect(getProvenanceLabel({ source: 'unknown' })).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  Migration contract (source scan)                                   */
/* ------------------------------------------------------------------ */

const migration = read('supabase/migrations/20260920000000_create_online_booking.sql')

describe('migration contract', () => {
  it('creates all five booking tables', () => {
    for (const table of ['booking_settings', 'booking_hours', 'booking_exceptions', 'booking_requests', 'booking_request_events']) {
      expect(migration).toContain(`create table if not exists public.${table}`)
    }
  })

  it('scopes every table to a business with cascade deletes', () => {
    const businessRefs = migration.match(/business_id uuid not null (unique )?references public\.businesses\(id\) on delete cascade/g)
    expect(businessRefs?.length).toBeGreaterThanOrEqual(5)
  })

  it('constrains request status to the closed state model', () => {
    expect(migration).toContain("'pending'")
    expect(migration).toContain("'business_proposed'")
    expect(migration).toContain("'customer_reselected'")
    expect(migration).toContain("'accepted'")
    expect(migration).toContain("'declined'")
    expect(migration).toContain("'cancelled'")
    expect(migration).toContain("'expired'")
  })

  it('prepares nullable conversion links that stay null in Phase 1', () => {
    // appointment_id is text: Google Calendar event ids are external strings,
    // not local uuids — there is no canonical appointments table to FK to.
    for (const col of ['lead_id uuid', 'appointment_id text', 'job_id uuid']) {
      expect(migration).toContain(col)
    }
  })

  it('enforces one settings row per business and unique continuation tokens', () => {
    expect(migration).toMatch(/business_id uuid not null unique references public\.businesses/)
    expect(migration).toContain('continuation_token text not null unique')
  })

  it('supports idempotent submits via a unique client_request_id', () => {
    expect(migration).toMatch(/booking_requests_client_request_unique|client_request_id[\s\S]*unique/)
  })

  it('widens the leads source constraint for online_booking', () => {
    expect(migration).toContain('online_booking')
    expect(migration).toMatch(/leads_source_check|source in \(/)
  })

  it('enables RLS with owner-scoped policies on every new table', () => {
    const rlsEnables = migration.match(/alter table public\.\w+ enable row level security/g)
    expect(rlsEnables?.length).toBe(5)
    const policies = migration.match(/create policy/gi)
    expect(policies?.length).toBeGreaterThanOrEqual(5)
    expect(migration).toContain('businesses')
    expect(migration).toContain('auth.uid()')
  })

  it('is additive — no destructive operations on existing tables', () => {
    expect(migration).not.toMatch(/drop table/i)
    // Dropping/replacing a CHECK constraint is additive-safe; dropping COLUMNS is not.
    expect(migration).not.toMatch(/alter table public\.(leads|jobs|calendar_events|conversations)[^;]*drop column/i)
    expect(migration).not.toMatch(/truncate/i)
  })
})

/* ------------------------------------------------------------------ */
/*  API contract (source scans)                                        */
/* ------------------------------------------------------------------ */

const availabilityRoute = read('src/app/api/booking/public/[slug]/availability/route.ts')
const requestsRoute = read('src/app/api/booking/public/[slug]/requests/route.ts')
const tokenRoute = read('src/app/api/booking/requests/by-token/[token]/route.ts')
const publicRoute = read('src/app/api/booking/public/[slug]/route.ts')
const requestLib = read('src/lib/booking/requests.ts')
const availabilityLib = read('src/lib/booking/availability.ts')
const settingsLib = read('src/lib/booking/settings.ts')

describe('public API contract — privacy', () => {
  it('every public route applies IP rate limiting', () => {
    for (const src of [availabilityRoute, requestsRoute, tokenRoute, publicRoute]) {
      expect(src).toContain('checkIpRateLimit')
      expect(src).toContain('getClientIp')
    }
  })

  it('availability response contains only slot {start,end} objects', () => {
    expect(availabilityRoute).toContain('slots: result.slots')
    // The route never queries or serializes busy sources or customer data
    expect(availabilityRoute).not.toMatch(/customer_name|\.from\('jobs'\)|\.from\('leads'\)/)
    expect(availabilityLib).toContain("reason: 'slot_unavailable'") // opaque public reason
  })

  it('slug lookup returns null for disabled booking — indistinguishable 404', () => {
    expect(publicRoute).toContain("'Booking page not found'")
    expect(settingsLib).toContain(".eq('enabled', true)")
    expect(settingsLib).toContain(".eq('public_slug', normalized)")
  })

  it('never exposes business_id or internal ids in public payloads', () => {
    expect(publicRoute).not.toContain('businessId:')
    expect(requestsRoute).not.toMatch(/request\.id|business_id/)
    expect(tokenRoute).not.toContain('business_id')
  })
})

describe('booking submission — pre-customer contract', () => {
  it('createBookingRequest writes only booking tables — never leads/jobs/appointments/conversations', () => {
    expect(requestLib).toContain(".from('booking_requests')")
    expect(requestLib).toContain(".from('booking_request_events')")
    expect(requestLib).not.toContain(".from('leads')")
    expect(requestLib).not.toContain(".from('jobs')")
    expect(requestLib).not.toContain(".from('calendar_events')")
    expect(requestLib).not.toContain(".from('conversations')")
    expect(requestLib).not.toContain('createLead')
    expect(requestLib).not.toContain('createJob')
  })

  it('keeps conversion link columns null at submission', () => {
    expect(requestLib).toContain('lead_id: null')
    expect(requestLib).toContain('appointment_id: null')
    expect(requestLib).toContain('job_id: null')
  })

  it('requires name + normalized phone, validates email shape', () => {
    expect(requestLib).toContain('customerName')
    expect(requestLib).toContain('normalizePhoneNumberForStorage')
    expect(requestLib).toMatch(/normalized_phone.*length.*10|< 10/)
  })

  it('revalidates the slot server-side before insert', () => {
    expect(requestLib).toContain('revalidateBookingSlot')
    // Validation happens BEFORE the insert call
    const revalIdx = requestLib.indexOf('revalidateBookingSlot(')
    const insertIdx = requestLib.indexOf(".from('booking_requests')\n    .insert")
    expect(revalIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(-1)
    expect(revalIdx).toBeLessThan(insertIdx)
  })

  it('handles idempotent replay on client_request_id', () => {
    expect(requestLib).toContain('client_request_id')
    expect(requestLib).toContain('alreadyExisted')
    expect(requestLib).toContain("'23505'") // unique-violation race path
  })

  it('records a created event in request history', () => {
    expect(requestLib).toContain("event_type: 'created'")
    expect(requestLib).toContain("actor: 'customer'")
    expect(requestLib).toContain("to_status: 'pending'")
  })
})

describe('busy sources — canonical semantics', () => {
  it('loads busy windows from jobs, Google Calendar, and active holds only', () => {
    expect(availabilityLib).toContain(".from('jobs')")
    expect(availabilityLib).toContain('getGoogleAccessToken')
    expect(availabilityLib).toContain(".from('booking_requests')")
    // Reminders/tasks and meeting_records are NOT busy sources
    expect(availabilityLib).not.toContain(".from('tasks')")
    expect(availabilityLib).not.toContain(".from('meeting_records')")
  })

  it('only counts timed jobs as busy — unscheduled jobs are not busy time', () => {
    expect(availabilityLib).toContain('job.scheduled_time')
  })

  it('holds apply only to active statuses with unexpired holds', () => {
    expect(availabilityLib).toContain('ACTIVE_BOOKING_STATUSES')
    expect(availabilityLib).toContain('hold_expires_at')
    expect(availabilityLib).toContain(".gt('hold_expires_at'")
  })

  it('excludes the requesting customer own hold during reselection', () => {
    expect(availabilityLib).toContain('excludeRequestId')
    expect(availabilityLib).toContain(".neq('id', excludeRequestId)")
  })
})

describe('continuation view — single-request scoping', () => {
  it('looks up by exact token only, never by id or enumeration', () => {
    expect(requestLib).toContain(".eq('continuation_token', token)")
    expect(requestLib).not.toContain(".eq('id', token)")
  })

  it('rejects malformed tokens before any query', () => {
    expect(requestLib).toContain('isValidContinuationToken(token)')
    const validateIdx = requestLib.indexOf('isValidContinuationToken(token)')
    const queryIdx = requestLib.indexOf(".from('booking_requests')", validateIdx)
    expect(validateIdx).toBeLessThan(queryIdx)
  })

  it('returns only the customer-visible field set', () => {
    const viewSelect = requestLib.match(/\.select\('([^']*)'\)\s*\.eq\('continuation_token'/)
    expect(viewSelect).toBeTruthy()
    const fields = viewSelect![1]
    expect(fields).not.toContain('continuation_token')
    expect(fields).not.toContain('client_request_id')
    expect(fields).not.toContain('customer_phone') // own phone not re-exposed
  })
})

/* ------------------------------------------------------------------ */
/*  Business surfaces (source scans)                                   */
/* ------------------------------------------------------------------ */

const settingsConfig = read('src/lib/settings-config.ts')
const settingsContent = read('src/components/SettingsContent.tsx')
const overviewCard = read('src/components/schedule/BookingRequestsCard.tsx')
const calendarPage = read('src/app/dashboard/calendar/page.tsx')
const settingsApi = read('src/app/api/booking/settings/route.ts')
const exceptionsApi = read('src/app/api/booking/exceptions/route.ts')
const requestsApi = read('src/app/api/booking/requests/route.ts')
const settingsSection = read('src/components/settings/OnlineBookingSection.tsx')

describe('business surfaces', () => {
  it('registers the Online Booking settings section', () => {
    expect(settingsConfig).toContain("id: 'online-booking'")
    expect(settingsContent).toContain('online-booking-divider')
    expect(settingsContent).toContain('OnlineBookingSection')
  })

  it('mounts the booking requests card in Schedule → Agenda (Overview)', () => {
    expect(calendarPage).toContain('BookingRequestsCard')
    expect(overviewCard).toContain('Booking Requests')
  })

  it('settings API is owner-scoped through the shared auth helper', () => {
    for (const src of [settingsApi, exceptionsApi, requestsApi]) {
      expect(src).toContain('getAuthedBusiness')
      expect(src).toContain('auth.businessId')
    }
  })

  it('settings PATCH validates bounded numeric fields', () => {
    expect(settingsApi).toContain('default_duration_minutes')
    expect(settingsApi).toMatch(/15.*480/)
    expect(settingsApi).toContain('booking_window_days')
  })

  it('enabling auto-allocates a public slug when missing', () => {
    expect(settingsApi).toContain('allocatePublicSlug')
  })

  it('owner request API exposes the customer snapshot needed to act', () => {
    expect(requestsApi).toContain('customer_name')
    expect(requestsApi).toContain('customer_phone')
    expect(requestsApi).toContain('requested_start')
  })
})

/* ------------------------------------------------------------------ */
/*  Public page (source scans)                                         */
/* ------------------------------------------------------------------ */

const bookPage = read('src/app/book/[slug]/page.tsx')
const bookClient = read('src/app/book/[slug]/PublicBookingClient.tsx')
const requestPage = read('src/app/book/[slug]/request/[token]/page.tsx')
const providersWrapper = read('src/components/ProvidersWrapper.tsx')

describe('public booking page', () => {
  it('renders customer-friendly language — no internal jargon', () => {
    const publicText = bookPage + bookClient
    expect(publicText).toContain('Request a time')
    expect(publicText).not.toMatch(/\blead\b|\bCRM\b|\bintake\b/i)
    expect(bookClient).not.toMatch(/appointment entity|job entity/i)
  })

  it('is excluded from indexing on the public surface', () => {
    expect(bookPage).toContain('index: false')
    expect(requestPage).toContain('index: false')
  })

  it('is classified as a public route for light providers', () => {
    expect(providersWrapper).toContain("'/book/'")
  })

  it('shows failure states for fetch errors, empty availability, and submit conflicts', () => {
    expect(bookClient).toContain('No times available')
    expect(bookClient).toContain('Try again')
    expect(bookClient).toContain('slotConflict')
  })

  it('generates one clientRequestId for idempotent submission', () => {
    expect(bookClient).toContain('clientRequestId')
    expect(bookClient).toContain('crypto.randomUUID()')
  })

  it('redirects to the continuation page on success — never claims confirmation', () => {
    expect(bookClient).toContain('/request/')
    expect(bookClient).toContain('request, not a confirmed appointment')
    expect(requestPage).toContain('Booking request sent')
  })

  it('continuation page renders per-status customer messaging', () => {
    expect(requestPage).toContain('STATUS_CONTENT')
    expect(requestPage).toContain('business_proposed:')
    expect(requestPage).toContain('accepted:')
    expect(requestPage).toContain('declined:')
  })
})

/* ------------------------------------------------------------------ */
/*  CORRECTION A — fail-closed availability                            */
/* ------------------------------------------------------------------ */

describe('fail-closed busy-source semantics', () => {
  it('mandatory local sources fail closed — jobs query error aborts', () => {
    const jobsIdx = availabilityLib.indexOf('jobsError')
    expect(availabilityLib).toContain('jobsError')
    expect(availabilityLib).toContain("reason: 'availability_unavailable'")
    // jobs error returns fail-closed BEFORE any slot emission
    const failIdx = availabilityLib.indexOf('availability_unavailable', jobsIdx)
    expect(failIdx).toBeGreaterThan(jobsIdx)
  })

  it('booking-request holds query error aborts fail-closed', () => {
    expect(availabilityLib).toContain('holdsError')
    const holdsIdx = availabilityLib.indexOf('holdsError')
    const failIdx = availabilityLib.indexOf('availability_unavailable', holdsIdx)
    expect(failIdx).toBeGreaterThan(holdsIdx)
  })

  it('unconnected Google is NOT an error — only connected failures fail closed', () => {
    expect(availabilityLib).toContain("'google_integration_not_found'")
    // The not-found branch is the ONLY tolerated Google error
    const notFoundIdx = availabilityLib.indexOf('google_integration_not_found')
    const catchIdx = availabilityLib.indexOf('catch (error)', availabilityLib.indexOf('getGoogleAccessToken'))
    expect(notFoundIdx).toBeGreaterThan(catchIdx)
    // Connected-but-unreadable → fail closed
    expect(availabilityLib).toContain('google calendar read failed')
    expect(availabilityLib).toContain('google access error')
  })

  it('non-ok Google API response fails closed — never pretends calendar is empty', () => {
    const resIdx = availabilityLib.indexOf('if (!res.ok)')
    const failIdx = availabilityLib.indexOf('availability_unavailable', resIdx)
    expect(failIdx).toBeGreaterThan(resIdx)
    expect(failIdx).toBeLessThan(availabilityLib.indexOf('const data = await res.json()'))
  })

  it('settings bundle read errors throw instead of silently exposing blocked time', () => {
    expect(settingsLib).toContain('throw settingsRes.error')
    expect(settingsLib).toContain('throw hoursRes.error')
    expect(settingsLib).toContain('throw exceptionsRes.error')
  })

  it('computeBookingAvailability propagates availability_unavailable', () => {
    expect(availabilityLib).toContain('busyResult.ok')
    expect(availabilityLib).toContain("reason: 'availability_unavailable'")
    // Bundle load failure also fails closed
    expect(availabilityLib).toContain('settings bundle unreadable')
  })

  it('public endpoint returns 503 availability_temporarily_unavailable — no speculative slots', () => {
    expect(availabilityRoute).toContain("'availability_temporarily_unavailable'")
    expect(availabilityRoute).toContain('status: 503')
    // Success payload contains only timezone + slots — degraded removed
    expect(availabilityRoute).not.toContain('degraded')
    // Never leaks Google/token internals
    expect(availabilityRoute).not.toMatch(/oauth|refresh_token|access_token|google_token/)
  })

  it('submit path fail-closes — availability_unavailable maps to retryable 503 before insert', () => {
    expect(requestLib).toContain("'availability_unavailable'")
    const unavailIdx = requestLib.indexOf('availability_unavailable')
    const insertIdx = requestLib.indexOf(".from('booking_requests')\n    .insert")
    expect(unavailIdx).toBeGreaterThan(-1)
    expect(unavailIdx).toBeLessThan(insertIdx)
    // 503 response → retryable, request NOT created
    expect(requestLib).toMatch(/status:\s*503[\s\S]{0,300}temporarily unavailable/)
  })

  it('revalidateBookingSlot fail-closes on busy load failure', () => {
    expect(availabilityLib).toContain('revalidate fail-closed')
    // busyResult checked before isSlotAvailable is ever invoked
    const busyCheck = availabilityLib.indexOf('if (!busyResult.ok)')
    const slotCheck = availabilityLib.indexOf('isSlotAvailable({', busyCheck)
    expect(busyCheck).toBeLessThan(slotCheck)
  })

  it('recovery is stateless — no terminal/sticky error stored', () => {
    // Every call re-reads sources fresh; nothing caches failure
    expect(availabilityLib).not.toMatch(/cache|memoize|stored.*error|permanent/i)
  })
})

/* ------------------------------------------------------------------ */
/*  CORRECTION B — same-request reselection                            */
/* ------------------------------------------------------------------ */

const reselectRoute = read('src/app/api/booking/requests/by-token/[token]/reselect/route.ts')
const reselectSection = read('src/app/book/[slug]/request/[token]/ReselectSection.tsx')

describe('same-request reselection', () => {
  it('reselectable statuses are exactly the active negotiation set', () => {
    expect(requestLib).toContain('RESELECTABLE_STATUSES')
    const statuses = requestLib.match(/RESELECTABLE_STATUSES[^=]*=\s*\[([\s\S]*?)\]/)
    expect(statuses).toBeTruthy()
    expect(statuses![1]).toContain("'pending'")
    expect(statuses![1]).toContain("'business_proposed'")
    expect(statuses![1]).toContain("'customer_reselected'")
    expect(statuses![1]).not.toContain("'accepted'")
    expect(statuses![1]).not.toContain("'declined'")
    expect(statuses![1]).not.toContain("'cancelled'")
    expect(statuses![1]).not.toContain("'expired'")
  })

  it('validates the token before anything else', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    const tokenIdx = fn.indexOf('isValidContinuationToken(token)')
    const queryIdx = fn.indexOf(".from('booking_requests')")
    expect(tokenIdx).toBeGreaterThan(-1)
    expect(tokenIdx).toBeLessThan(queryIdx)
  })

  it('binds the token to the business slug — cross-slug tokens rejected', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain('public_slug')
    expect(fn).toContain('settings.public_slug !== slug')
  })

  it('terminal statuses refuse reselection', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain('RESELECTABLE_STATUSES.includes(request.status)')
    expect(fn).toContain('can no longer be changed')
  })

  it('revalidates the new slot with own-hold exclusion and frozen duration', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain('revalidateBookingSlot(')
    expect(fn).toContain('request.business_id')
    expect(fn).toContain('startIso')
    expect(fn).toContain('endIso')
    expect(fn).toContain('request.id')
    expect(fn).toContain('bookingRequestDurationMinutes(request)')
    // own hold must NOT block the customer's own reselection
    expect(availabilityLib).toContain("neq('id', excludeRequestId)")
  })

  it('updates the SAME row — id and token never change', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain(".eq('id', request.id)")
    // The update payload never touches identity or original-ask fields
    const updateCall = fn.slice(fn.indexOf('.update({'), fn.indexOf('})', fn.indexOf('.update({')))
    expect(updateCall).not.toContain('continuation_token')
    expect(updateCall).not.toContain('customer_name')
    expect(updateCall).not.toContain('customer_phone')
    expect(updateCall).not.toContain('customer_email')
    expect(updateCall).not.toContain('requested_start:')
    expect(updateCall).not.toContain('requested_end:')
  })

  it('moves the hold to the new slot and refreshes expiry on the same row', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain('current_proposed_start: start.toISOString()')
    expect(fn).toContain('current_proposed_end: end.toISOString()')
    expect(fn).toContain('hold_expires_at')
    expect(fn).toContain('HOLD_MS')
    // Hold loader uses current_proposed ?? requested — the hold migrates
    expect(availabilityLib).toContain('hold.current_proposed_start ?? hold.requested_start')
  })

  it('transitions to customer_reselected and appends history on the same request', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain("status: 'customer_reselected'")
    expect(fn).toContain("event_type: 'time_selected'")
    expect(fn).toContain("actor: 'customer'")
    expect(fn).toContain('from_status: request.status')
    expect(fn).toContain('booking_request_id: request.id')
  })

  it('guards the update against concurrent terminal transitions', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain(".in('status', RESELECTABLE_STATUSES)")
    expect(fn).toContain('updated.length === 0')
  })

  it('idempotent repeat of the identical slot is a no-op', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    expect(fn).toContain('alreadyApplied: true')
    // Compares submitted slot against the live proposed/requested time
    expect(fn).toContain('request.current_proposed_start ?? request.requested_start')
    // No-op path returns BEFORE the update — no duplicate events
    const noopIdx = fn.indexOf('alreadyApplied: true')
    const updateIdx = fn.indexOf('.update({')
    expect(noopIdx).toBeLessThan(updateIdx)
  })

  it('never inserts a second booking request — reselect path has no request insert', () => {
    const fn = requestLib.slice(requestLib.indexOf('reselectBookingRequestTime'))
    // The only writes: row .update() + a single booking_request_events insert.
    expect(fn).not.toMatch(/\.from\('booking_requests'\)[\s\S]{0,80}?\.insert\(/)
    expect(fn.match(/\.from\('booking_request_events'\)/g)?.length).toBe(1)
  })

  it('reselect endpoint applies rate limiting and returns only a safe view', () => {
    expect(reselectRoute).toContain('checkIpRateLimit')
    expect(reselectRoute).toContain('getClientIp')
    expect(reselectRoute).toContain('proposedStart')
    expect(reselectRoute).not.toMatch(/customer_name|customer_phone|business_id|request\.id/)
  })

  it('continuation page offers in-place reselection for active statuses only', () => {
    expect(requestPage).toContain('ReselectSection')
    expect(requestPage).toContain('RESELECTABLE_STATUSES.includes(view.status)')
    expect(requestPage).toContain('token={token}')
    expect(requestPage).toContain('slug={view.businessSlug}')
  })

  it('generic /book/[slug] restart link is gated to terminal statuses only', () => {
    // Active requests must never be sent back through the fresh-submit path
    expect(requestPage).toContain('!RESELECTABLE_STATUSES.includes(view.status)')
    const linkSection = requestPage.slice(requestPage.indexOf('!RESELECTABLE_STATUSES'))
    expect(linkSection).toContain('Request a new time')
    // The active-status path uses the tokenized ReselectSection instead
    expect(requestPage).toContain('RESELECTABLE_STATUSES.includes(view.status) &&')
  })

  it('reselection UI never asks for identity fields again', () => {
    for (const field of ['customerName', 'name=', 'phone', 'email', 'address', 'autoComplete']) {
      expect(reselectSection).not.toContain(field)
    }
    expect(reselectSection).toContain('Choose another time')
  })

  it('reselection fetches availability with the token for own-hold exclusion', () => {
    expect(reselectSection).toContain('availability?token=')
    expect(availabilityRoute).toContain("searchParams.get('token')")
    expect(availabilityRoute).toContain('excludeRequestId')
  })

  it('reselection surfaces temporarily-unavailable and refreshes slots on 409', () => {
    expect(reselectSection).toContain('availability_temporarily_unavailable')
    expect(reselectSection).toContain('loadSlots()')
    expect(reselectSection).toContain('router.refresh()')
  })

  it('migration supports the reselection event + status', () => {
    expect(migration).toContain("'time_selected'")
    expect(migration).toContain("'customer_reselected'")
  })
})

/* ------------------------------------------------------------------ */
/*  Phase 1 invariants re-verified after corrections                    */
/* ------------------------------------------------------------------ */

describe('phase 1 invariants after corrections', () => {
  it('still never creates leads/jobs/appointments/conversations anywhere in booking', () => {
    for (const src of [requestLib, reselectRoute]) {
      expect(src).not.toContain(".from('leads')")
      expect(src).not.toContain(".from('jobs')")
      expect(src).not.toContain(".from('calendar_events')")
      expect(src).not.toContain(".from('conversations')")
    }
  })

  it('one negotiation remains one request — no second insert path exists', () => {
    // The ONLY insert into booking_requests lives in createBookingRequest
    const inserts = requestLib.match(/\.from\('booking_requests'\)[\s\S]{0,80}?\.insert\(/g)
    expect(inserts?.length).toBe(1)
  })

  it('booking requests card still renders one row per request', () => {
    expect(overviewCard).toContain('requests.map')
    expect(overviewCard).toContain('key={r.id}') // keyed by request id — one row per request
  })
})
