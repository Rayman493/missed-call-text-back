import { describe, it, expect } from 'vitest'
import { generateAvailableSlots, isSlotAvailable, windowsFromBusinessHours } from '../availability-core'
import type { SlotEngineInput } from '../availability-core'

describe('availability-core slot generation', () => {
  const makeInput = (overrides: Partial<SlotEngineInput> = {}): SlotEngineInput => ({
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

  it('creates slots from configured business/custom hours', () => {
    const monday = new Date('2026-09-21T12:00:00.000Z') // Monday in NY is around 08:00
    const slots = generateAvailableSlots({ ...makeInput(), now: monday })
    expect(slots.length).toBeGreaterThan(0)
    // Monday windows: 09:00–17:00 NY = 13:00–21:00 UTC
    expect(slots[0].start).toBe('2026-09-21T13:00:00.000Z')
  })

  it('creates slots from custom booking hours', () => {
    const tuesday = new Date('2026-09-22T12:00:00.000Z')
    const slots = generateAvailableSlots({
      ...makeInput({
        windows: [{ day_of_week: 2, start_time: '10:00', end_time: '12:00' }],
      }),
      now: tuesday,
    })
    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].start).toBe('2026-09-22T14:00:00.000Z')
  })

  it('returns zero slots when no usable hours exist', () => {
    const now = new Date('2026-09-21T12:00:00.000Z')
    const slots = generateAvailableSlots({ ...makeInput({ windows: [] }), now })
    expect(slots).toEqual([])
  })

  it('removes slots inside the minimum-notice window', () => {
    const now = new Date('2026-09-21T13:00:00.000Z') // 09:00 NY
    const slots = generateAvailableSlots({
      ...makeInput({ minNoticeMin: 120 }),
      now,
    })
    // The 09:00 window is open now, but anything before now + 2h is excluded.
    expect(slots[0].start).toBe('2026-09-21T15:00:00.000Z') // 11:00 NY
  })

  it('limits generation to the booking window horizon', () => {
    const now = new Date('2026-09-21T12:00:00.000Z')
    const slots = generateAvailableSlots({ ...makeInput({ horizonDays: 1 }), now })
    expect(slots.length).toBeGreaterThan(0)
    // No slots beyond next day
    const last = new Date(slots[slots.length - 1].start)
    expect((last.getTime() - now.getTime()) / 86_400_000).toBeLessThanOrEqual(2)
  })

  it('blocks slots that overlap with jobs and active holds', () => {
    const now = new Date('2026-09-21T12:00:00.000Z')
    const slots = generateAvailableSlots({
      ...makeInput(),
      busy: [{ start: new Date('2026-09-21T15:00:00.000Z'), end: new Date('2026-09-21T16:00:00.000Z') }],
      now,
    })
    // 15:00–16:00 UTC slot (11 AM NY) should be removed.
    expect(slots.some(s => s.start === '2026-09-21T15:00:00.000Z')).toBe(false)
  })

  it('keeps slot availability stable across timezone America/New_York', () => {
    const now = new Date('2026-09-21T12:00:00.000Z')
    const slots = generateAvailableSlots({ ...makeInput({ timezone: 'America/New_York' }), now })
    const starts = slots.map(s => s.start)
    expect(starts).toContain('2026-09-21T13:00:00.000Z') // 09:00 NY
  })
})

describe('windowsFromBusinessHours adapter', () => {
  it('returns windows for Mon–Fri when start and end are present', () => {
    expect(windowsFromBusinessHours('09:00', '17:00')).toHaveLength(5)
    expect(windowsFromBusinessHours('09:00', '17:00')[0]).toEqual({ day_of_week: 1, start_time: '09:00', end_time: '17:00' })
  })

  it('returns no windows when start or end is missing', () => {
    expect(windowsFromBusinessHours(null, '17:00')).toEqual([])
    expect(windowsFromBusinessHours('09:00', null)).toEqual([])
    expect(windowsFromBusinessHours(null, null)).toEqual([])
  })
})

describe('isSlotAvailable revalidation', () => {
  const base = {
    timezone: 'America/New_York',
    windows: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00' }],
    exceptions: [],
    busy: [],
    durationMin: 60,
    intervalMin: 60,
    minNoticeMin: 0,
    horizonDays: 7,
  } as const

  it('approves a slot inside configured hours', () => {
    const result = isSlotAvailable({ ...base, start: new Date('2026-09-21T13:00:00.000Z'), end: new Date('2026-09-21T14:00:00.000Z') })
    expect(result).toEqual({ ok: true })
  })

  it('rejects a slot blocked by a hold', () => {
    const result = isSlotAvailable({
      ...base,
      busy: [{ start: new Date('2026-09-21T13:15:00.000Z'), end: new Date('2026-09-21T13:45:00.000Z') }],
      start: new Date('2026-09-21T13:00:00.000Z'),
      end: new Date('2026-09-21T14:00:00.000Z'),
    })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
  })

  it('rejects a slot before the minimum-notice cutoff', () => {
    const now = new Date('2026-09-21T13:00:00.000Z')
    const result = isSlotAvailable({
      ...base,
      minNoticeMin: 120,
      start: new Date('2026-09-21T13:30:00.000Z'),
      end: new Date('2026-09-21T14:30:00.000Z'),
      now,
    })
    expect(result).toEqual({ ok: false, reason: 'too_soon' })
  })

  it('rejects a 2-hour slot that would exceed closing time at 5:00 PM', () => {
    const result = isSlotAvailable({
      ...base,
      durationMin: 120,
      start: new Date('2026-09-21T20:00:00.000Z'), // 4:00 PM NY
      end: new Date('2026-09-21T22:00:00.000Z'),   // 6:00 PM NY
    })
    expect(result).toEqual({ ok: false, reason: 'outside_hours' })
  })

  it('approves a 2-hour slot that fits entirely inside business hours', () => {
    const result = isSlotAvailable({
      ...base,
      durationMin: 120,
      start: new Date('2026-09-21T19:00:00.000Z'), // 3:00 PM NY
      end: new Date('2026-09-21T21:00:00.000Z'),   // 5:00 PM NY
    })
    expect(result).toEqual({ ok: true })
  })

  it('allows a candidate that only touches the end boundary of a hold (half-open)', () => {
    const result = isSlotAvailable({
      ...base,
      durationMin: 60,
      busy: [{ start: new Date('2026-09-21T17:00:00.000Z'), end: new Date('2026-09-21T19:00:00.000Z') }], // 1–3 PM NY
      start: new Date('2026-09-21T19:00:00.000Z'), // 3:00 PM NY
      end: new Date('2026-09-21T20:00:00.000Z'),   // 4:00 PM NY
    })
    expect(result).toEqual({ ok: true })
  })

  it('blocks a candidate that overlaps the end boundary of a hold', () => {
    const result = isSlotAvailable({
      ...base,
      durationMin: 60,
      busy: [{ start: new Date('2026-09-21T17:00:00.000Z'), end: new Date('2026-09-21T19:00:00.000Z') }], // 1–3 PM NY
      start: new Date('2026-09-21T18:30:00.000Z'), // 2:30 PM NY
      end: new Date('2026-09-21T19:30:00.000Z'),   // 3:30 PM NY
    })
    expect(result).toEqual({ ok: false, reason: 'conflict' })
  })

  it('allows a candidate that only touches the start boundary of a hold', () => {
    const result = isSlotAvailable({
      ...base,
      durationMin: 60,
      busy: [{ start: new Date('2026-09-21T17:00:00.000Z'), end: new Date('2026-09-21T19:00:00.000Z') }], // 1–3 PM NY
      start: new Date('2026-09-21T16:00:00.000Z'), // 12:00 PM NY
      end: new Date('2026-09-21T17:00:00.000Z'),   // 1:00 PM NY
    })
    expect(result).toEqual({ ok: true })
  })
})
