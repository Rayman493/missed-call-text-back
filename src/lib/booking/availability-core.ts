/**
 * Online Booking — pure slot-generation core.
 *
 * Everything here is a pure function over plain inputs so the engine can be
 * unit-tested without Supabase. The data-loading wrapper lives in
 * availability.ts.
 *
 * Model:
 *   recurring weekly booking hours (local wall-clock windows)
 *   MINUS manual availability exceptions
 *   MINUS canonical busy windows (jobs, Google events, active booking holds)
 *   MINUS minimum-notice / past cutoff
 *   = public bookable slots
 *
 * Public contract: callers receive ONLY {start,end} instants — no busy-source
 * details, no titles, no names. Why a slot is unavailable is never revealed.
 */

import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import type { AvailableSlot, BookingHoursRow, BusyWindow } from './types'

export interface WeeklyWindow {
  day_of_week: number // 0 = Sunday … 6 = Saturday
  start_time: string // 'HH:mm'
  end_time: string // 'HH:mm'
}

export interface SlotEngineInput {
  /** IANA timezone that wall-clock hours are interpreted in. */
  timezone: string
  /** Recurring weekly windows (booking_hours rows or derived). */
  windows: WeeklyWindow[]
  /** Manual one-off blocks (booking_exceptions rows) as concrete instants. */
  exceptions: BusyWindow[]
  /** Canonical busy windows (jobs + Google events + active holds). */
  busy: BusyWindow[]
  durationMin: number
  intervalMin: number
  minNoticeMin: number
  /** How many days ahead (inclusive of today) to generate, max bound. */
  horizonDays: number
  /** Reference instant (injectable for tests). */
  now?: Date
  /** Optional range override — restrict generation to these local dates. */
  fromDate?: Date
  toDate?: Date
}

const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd

/** Local YYYY-MM-DD for an instant inside the business timezone. */
export function localDateKey(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd')
}

/** Enumerate local dates (YYYY-MM-DD) covered by the engine range. */
function eachLocalDate(start: Date, end: Date, timezone: string): string[] {
  const days: string[] = []
  const cursor = toZonedTime(start, timezone)
  cursor.setHours(0, 0, 0, 0)
  const last = toZonedTime(end, timezone)
  last.setHours(0, 0, 0, 0)
  while (cursor <= last) {
    days.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Generate public bookable slots.
 * Slots are candidate start times stepping `intervalMin` within each weekly
 * window; a candidate is emitted only when its full `durationMin` fits inside
 * the window, clears the notice cutoff, and overlaps no busy/exception window.
 */
export function generateAvailableSlots(input: SlotEngineInput): AvailableSlot[] {
  const {
    timezone,
    windows,
    exceptions,
    busy,
    durationMin,
    intervalMin,
    minNoticeMin,
    horizonDays,
    fromDate,
    toDate,
  } = input

  if (durationMin <= 0 || intervalMin <= 0) return []

  const now = input.now ?? new Date()
  const earliest = new Date(now.getTime() + minNoticeMin * 60_000)
  const rangeStart = fromDate ?? now
  const rangeEnd = toDate ?? new Date(now.getTime() + horizonDays * 86_400_000)

  const windowsByDay = new Map<number, WeeklyWindow[]>()
  for (const w of windows) {
    const list = windowsByDay.get(w.day_of_week) ?? []
    list.push(w)
    windowsByDay.set(w.day_of_week, list)
  }

  const allBusy = [...busy, ...exceptions]
  const slots: AvailableSlot[] = []

  for (const dateKey of eachLocalDate(rangeStart, rangeEnd, timezone)) {
    // Reconstruct the local date inside the business timezone so getDay()
    // answers the *business-local* weekday, not the server's.
    const localNoon = fromZonedTime(`${dateKey}T12:00:00`, timezone)
    const weekday = toZonedTime(localNoon, timezone).getDay()
    const dayWindows = windowsByDay.get(weekday)
    if (!dayWindows) continue

    for (const w of dayWindows) {
      const windowStart = fromZonedTime(`${dateKey}T${w.start_time}:00`, timezone)
      const windowEnd = fromZonedTime(`${dateKey}T${w.end_time}:00`, timezone)

      for (
        let cursor = new Date(windowStart);
        cursor.getTime() + durationMin * 60_000 <= windowEnd.getTime();
        cursor = new Date(cursor.getTime() + intervalMin * 60_000)
      ) {
        const slotStart = cursor
        const slotEnd = new Date(cursor.getTime() + durationMin * 60_000)

        if (slotEnd <= earliest) continue

        const blocked = allBusy.some(b => overlaps(slotStart, slotEnd, b.start, b.end))
        if (blocked) continue

        slots.push({ start: slotStart.toISOString(), end: slotEnd.toISOString() })
      }
    }
  }

  slots.sort((a, b) => a.start.localeCompare(b.start))
  return slots
}

/**
 * Check one concrete slot against the same rules — the canonical revalidation
 * used at submit/accept time so an availability snapshot can never be trusted.
 * Returns the reason code on failure (never the busy source detail).
 */
export function isSlotAvailable(input: SlotEngineInput & { start: Date; end: Date }):
  | { ok: true }
  | { ok: false; reason: 'outside_hours' | 'conflict' | 'too_soon' | 'past' | 'wrong_duration' } {
  const { start, end, durationMin, minNoticeMin, timezone, windows, exceptions, busy } = input
  const now = input.now ?? new Date()

  if (!(start < end)) return { ok: false, reason: 'wrong_duration' }
  if (end.getTime() - start.getTime() !== durationMin * 60_000) {
    return { ok: false, reason: 'wrong_duration' }
  }
  if (end <= now) return { ok: false, reason: 'past' }
  if (start < new Date(now.getTime() + minNoticeMin * 60_000)) {
    return { ok: false, reason: 'too_soon' }
  }

  // Must fit inside a weekly window on the business-local weekday.
  const dateKey = localDateKey(start, timezone)
  const localNoon = fromZonedTime(`${dateKey}T12:00:00`, timezone)
  const weekday = toZonedTime(localNoon, timezone).getDay()
  const dayWindows = windows.filter(w => w.day_of_week === weekday)
  const fits = dayWindows.some(w => {
    const windowStart = fromZonedTime(`${dateKey}T${w.start_time}:00`, timezone)
    const windowEnd = fromZonedTime(`${dateKey}T${w.end_time}:00`, timezone)
    return start >= windowStart && end <= windowEnd
  })
  if (!fits) return { ok: false, reason: 'outside_hours' }

  const allBusy = [...busy, ...exceptions]
  if (allBusy.some(b => overlaps(start, end, b.start, b.end))) {
    return { ok: false, reason: 'conflict' }
  }

  return { ok: true }
}

/**
 * Derive weekly windows from businesses.business_hours_* columns when the
 * business opts into "use business hours" (Mon–Fri only, matching the
 * existing business-hours semantics in business-availability-sms.ts).
 */
export function windowsFromBusinessHours(
  start: string | null,
  end: string | null
): WeeklyWindow[] {
  if (!start || !end) return []
  return [1, 2, 3, 4, 5].map(day => ({ day_of_week: day, start_time: start, end_time: end }))
}

export type { BookingHoursRow }
