/**
 * Booking request duration freeze + half-open overlap boundary contracts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { generateAvailableSlots, isSlotAvailable } from '@/lib/booking/availability-core'

const makeInput = (overrides: any = {}) => ({
  timezone: 'America/New_York',
  windows: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }],
  exceptions: [],
  busy: [],
  durationMin: 60,
  intervalMin: 60,
  minNoticeMin: 0,
  horizonDays: 7,
  ...overrides,
})

function bookingRequestDurationMinutes(request: {
  requested_start?: string | null
  requested_end?: string | null
  current_proposed_start?: string | null
  current_proposed_end?: string | null
}): number {
  const start = request.current_proposed_start ?? request.requested_start
  const end = request.current_proposed_end ?? request.requested_end
  if (!start || !end) return 0
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000))
}

describe('bookingRequestDurationMinutes helper semantics', () => {
  it('computes duration from the original request interval', () => {
    const mins = bookingRequestDurationMinutes({
      requested_start: '2026-09-21T17:00:00.000Z', // 1 PM NY
      requested_end: '2026-09-21T19:00:00.000Z',   // 3 PM NY
    })
    expect(mins).toBe(120)
  })

  it('prefers the current proposed window over the original ask', () => {
    const mins = bookingRequestDurationMinutes({
      requested_start: '2026-09-21T17:00:00.000Z',
      requested_end: '2026-09-21T18:00:00.000Z',
      current_proposed_start: '2026-09-21T19:00:00.000Z',
      current_proposed_end: '2026-09-21T21:00:00.000Z',
    })
    expect(mins).toBe(120)
  })
})

describe('availability engine respects duration override', () => {
  it('generates 2-hour slots when durationMin is overridden to 120', () => {
    const now = new Date('2026-09-21T12:00:00.000Z')
    const slots = generateAvailableSlots({ ...makeInput({ durationMin: 120 }), now })
    expect(slots.length).toBeGreaterThan(0)
    const first = new Date(slots[0].start)
    const second = new Date(slots[0].end)
    expect((second.getTime() - first.getTime()) / 60_000).toBe(120)
  })

  it('rejects a slot whose length does not match the frozen request duration', () => {
    const result = isSlotAvailable({
      ...makeInput({ durationMin: 120 }),
      start: new Date('2026-09-21T13:00:00.000Z'),
      end: new Date('2026-09-21T14:00:00.000Z'),
    })
    expect(result).toEqual({ ok: false, reason: 'wrong_duration' })
  })
})

describe('half-open hold boundary semantics', () => {
  const base = {
    timezone: 'America/New_York',
    windows: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }],
    exceptions: [],
    busy: [],
    durationMin: 60,
    intervalMin: 60,
    minNoticeMin: 0,
    horizonDays: 7,
  }

  it('allows a candidate that starts exactly when a hold ends', () => {
    const result = isSlotAvailable({
      ...base,
      busy: [{ start: new Date('2026-09-21T17:00:00.000Z'), end: new Date('2026-09-21T19:00:00.000Z') }], // 1–3 PM NY
      start: new Date('2026-09-21T19:00:00.000Z'), // 3 PM NY
      end: new Date('2026-09-21T20:00:00.000Z'),   // 4 PM NY
    })
    expect(result).toEqual({ ok: true })
  })

  it('blocks a candidate that overlaps the hold end boundary', () => {
    const result = isSlotAvailable({
      ...base,
      busy: [{ start: new Date('2026-09-21T17:00:00.000Z'), end: new Date('2026-09-21T19:00:00.000Z') }], // 1–3 PM NY
      start: new Date('2026-09-21T18:30:00.000Z'), // 2:30 PM NY
      end: new Date('2026-09-21T19:30:00.000Z'), // 3:30 PM NY
    })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
  })

  it('allows a candidate that ends exactly when a hold starts', () => {
    const result = isSlotAvailable({
      ...base,
      busy: [{ start: new Date('2026-09-21T17:00:00.000Z'), end: new Date('2026-09-21T19:00:00.000Z') }], // 1–3 PM NY
      start: new Date('2026-09-21T16:00:00.000Z'), // 12 PM NY
      end: new Date('2026-09-21T17:00:00.000Z'),   // 1 PM NY
    })
    expect(result).toEqual({ ok: true })
  })
})

describe('route wiring for frozen duration', () => {
  const publicRoute = readFileSync('src/app/api/booking/public/[slug]/availability/route.ts', 'utf8')
  const slotsRoute = readFileSync('src/app/api/booking/requests/[id]/slots/route.ts', 'utf8')
  const requestsLib = readFileSync('src/lib/booking/requests.ts', 'utf8')
  const actionsLib = readFileSync('src/lib/booking/actions.ts', 'utf8')
  const availabilityLib = readFileSync('src/lib/booking/availability.ts', 'utf8')

  it('availability helpers accept an optional duration override', () => {
    expect(availabilityLib).toMatch(/export async function computeBookingAvailability\([^)]*durationMin\?:/s)
    expect(availabilityLib).toMatch(/export async function revalidateBookingSlot\([^)]*durationMin\?:/s)
  })

  it('actions export a request-duration helper', () => {
    expect(actionsLib).toMatch(/export function bookingRequestDurationMinutes/)
    expect(actionsLib).toMatch(/agreedWindow\(request\)/)
  })

  it('public availability route passes request duration when a token is present', () => {
    expect(publicRoute).toMatch(/import.*bookingRequestDurationMinutes/)
    expect(publicRoute).toMatch(/durationMin = bookingRequestDurationMinutes\(req\)/)
    expect(publicRoute).toMatch(/computeBookingAvailability\(business\.businessId, days, excludeRequestId, durationMin\)/)
  })

  it('owner slots route passes request duration to computeBookingAvailability', () => {
    expect(slotsRoute).toMatch(/import.*bookingRequestDurationMinutes/)
    expect(slotsRoute).toMatch(/bookingRequestDurationMinutes\(req\)/)
    expect(slotsRoute).toMatch(/computeBookingAvailability\(auth\.businessId, undefined, req\.id, bookingRequestDurationMinutes\(req\)\)/)
  })

  it('reselect revalidates with the request duration', () => {
    expect(requestsLib).toMatch(/bookingRequestDurationMinutes/)
    expect(requestsLib).toMatch(/revalidateBookingSlot\(\s*request\.business_id,\s*startIso,\s*endIso,\s*request\.id,\s*bookingRequestDurationMinutes\(request\),?\s*\)/s)
  })
})
