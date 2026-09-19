/**
 * Online Booking — server-side availability assembly.
 *
 * Loads the canonical busy sources, derives weekly windows, and delegates to
 * the pure engine in availability-core.ts.
 *
 * BUSY SOURCES (what actually blocks a public slot):
 *   1. jobs rows with scheduled_date + scheduled_time — canonical scheduled
 *      work; non-timed jobs are unscheduled work, not busy time.
 *   2. Google Calendar primary timed events — the canonical calendar; all-day
 *      events block the local day; holiday-calendar events are never loaded.
 *   3. Active booking_request holds (pending / business_proposed /
 *      customer_reselected, hold not expired) — prevent public pileups on a
 *      slot already requested by someone else, without reserving calendar
 *      time. The requesting customer's own hold is excluded when they pick a
 *      different time via their continuation link.
 *
 * tasks/reminders and meeting_records are NOT busy sources — reminders are
 * to-do items, not occupied time.
 */

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz'
import { getGoogleAccessToken } from '@/lib/google/token'
import { bookingAdmin, getBookingSettingsBundle } from './settings'
import {
  generateAvailableSlots,
  isSlotAvailable,
  windowsFromBusinessHours,
  type WeeklyWindow,
} from './availability-core'
import {
  ACTIVE_BOOKING_STATUSES,
  type AvailableSlot,
  type BookingSettings,
  type BusyWindow,
} from './types'

interface BusinessHoursRow {
  id: string
  business_hours_start: string | null
  business_hours_end: string | null
  business_hours_timezone: string | null
}

/** Weekly windows: booking_hours rows, else business-hours Mon–Fri fallback. */
export async function getEffectiveWeeklyWindows(
  businessId: string,
  settings: BookingSettings,
): Promise<{ windows: WeeklyWindow[]; business: BusinessHoursRow | null }> {
  const supabase = bookingAdmin()
  const [{ data: hoursRows }, { data: business }] = await Promise.all([
    supabase.from('booking_hours').select('day_of_week, start_time, end_time').eq('business_id', businessId),
    supabase.from('businesses')
      .select('id, business_hours_start, business_hours_end, business_hours_timezone')
      .eq('id', businessId)
      .maybeSingle(),
  ])

  if (hoursRows && hoursRows.length > 0) {
    return {
      windows: hoursRows.map(h => ({
        day_of_week: h.day_of_week,
        start_time: typeof h.start_time === 'string' ? h.start_time.slice(0, 5) : h.start_time,
        end_time: typeof h.end_time === 'string' ? h.end_time.slice(0, 5) : h.end_time,
      })),
      business: business as BusinessHoursRow | null,
    }
  }

  if (settings.use_business_hours && business) {
    return {
      windows: windowsFromBusinessHours(business.business_hours_start, business.business_hours_end),
      business: business as BusinessHoursRow | null,
    }
  }

  return { windows: [], business: business as BusinessHoursRow | null }
}

/**
 * Canonical busy windows for a UTC range — FAIL-CLOSED semantics.
 *
 * Source classification:
 *   A. MANDATORY LOCAL — jobs, booking_exceptions (caller), booking holds.
 *      A read failure means availability cannot be trusted → fail closed.
 *   B. UNCONFIGURED — Google Calendar with no integration row. Not an error;
 *      it simply contributes nothing.
 *   C. AUTHORITATIVE EXTERNAL — Google Calendar once connected. Token
 *      refresh failures, API errors, or network failures → fail closed.
 *      Showing slots as if the calendar were empty creates real double
 *      bookings, so no speculative availability is ever returned.
 */
export type BusyWindowsResult =
  | { ok: true; busy: BusyWindow[] }
  | { ok: false; reason: 'availability_unavailable' }

export async function getBookingBusyWindows(
  businessId: string,
  timezone: string,
  rangeStart: Date,
  rangeEnd: Date,
  excludeRequestId?: string,
): Promise<BusyWindowsResult> {
  const supabase = bookingAdmin()
  const busy: BusyWindow[] = []

  // --- 1. Jobs (canonical scheduled work) — MANDATORY local source --------
  const fromDate = formatInTimeZone(rangeStart, timezone, 'yyyy-MM-dd')
  const toDate = formatInTimeZone(rangeEnd, timezone, 'yyyy-MM-dd')
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('scheduled_date, scheduled_time, scheduled_end_time')
    .eq('business_id', businessId)
    .neq('status', 'cancelled')
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate)

  if (jobsError) {
    console.error('[BOOKING] availability fail-closed: jobs source unreadable', jobsError)
    return { ok: false, reason: 'availability_unavailable' }
  }
  for (const job of jobs ?? []) {
    if (!job.scheduled_time) continue // unscheduled work ≠ busy time
    const start = fromZonedTime(`${job.scheduled_date}T${job.scheduled_time}`, timezone)
    const end = job.scheduled_end_time
      ? fromZonedTime(`${job.scheduled_date}T${job.scheduled_end_time}`, timezone)
      : new Date(start.getTime() + 60 * 60_000) // no end → 1h block
    busy.push({ start, end })
  }

  // --- 2. Google Calendar — AUTHORITATIVE only when connected -------------
  try {
    const { accessToken } = await getGoogleAccessToken(businessId)
    const params = new URLSearchParams({
      timeMin: rangeStart.toISOString(),
      timeMax: rangeEnd.toISOString(),
      singleEvents: 'true',
      maxResults: '250',
      orderBy: 'startTime',
    })
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (!res.ok) {
      // Connected but unreadable — fail closed, never pretend it is empty.
      console.error('[BOOKING] availability fail-closed: google calendar read failed', res.status)
      return { ok: false, reason: 'availability_unavailable' }
    }
    const data = await res.json()
    for (const ev of data.items ?? []) {
      if (ev.status === 'cancelled') continue
      if (ev.start?.dateTime && ev.end?.dateTime) {
        busy.push({ start: new Date(ev.start.dateTime), end: new Date(ev.end.dateTime) })
      } else if (ev.start?.date && ev.end?.date) {
        // All-day event → block the whole local day (end date is exclusive).
        busy.push({
          start: fromZonedTime(`${ev.start.date}T00:00:00`, timezone),
          end: fromZonedTime(`${ev.end.date}T00:00:00`, timezone),
        })
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'google_integration_not_found') {
      // Not connected — Google is not an expected busy source. Continue.
    } else {
      console.error('[BOOKING] availability fail-closed: google access error', error)
      return { ok: false, reason: 'availability_unavailable' }
    }
  }

  // --- 3. Active booking-request holds — MANDATORY local source -----------
  const holdQuery = supabase
    .from('booking_requests')
    .select('id, requested_start, requested_end, current_proposed_start, current_proposed_end')
    .eq('business_id', businessId)
    .in('status', ACTIVE_BOOKING_STATUSES)
    .gt('hold_expires_at', new Date().toISOString())

  if (excludeRequestId) holdQuery.neq('id', excludeRequestId)
  const { data: holds, error: holdsError } = await holdQuery

  if (holdsError) {
    console.error('[BOOKING] availability fail-closed: holds source unreadable', holdsError)
    return { ok: false, reason: 'availability_unavailable' }
  }
  for (const hold of holds ?? []) {
    const s = hold.current_proposed_start ?? hold.requested_start
    const e = hold.current_proposed_end ?? hold.requested_end
    if (s && e) busy.push({ start: new Date(s), end: new Date(e) })
  }

  return { ok: true, busy }
}

export type ComputeAvailabilityResult =
  | { ok: true; slots: AvailableSlot[]; timezone: string }
  | { ok: false; reason: 'booking_disabled' | 'availability_unavailable' }

/** Public availability for a business over the next `days` days.
 * `excludeRequestId` hides that request's own hold — used when an existing
 * requester is picking a different time for the SAME request. */
export async function computeBookingAvailability(
  businessId: string,
  days?: number,
  excludeRequestId?: string,
): Promise<ComputeAvailabilityResult> {
  let bundle
  try {
    bundle = await getBookingSettingsBundle(businessId)
  } catch (error) {
    // Settings/hours/exceptions are mandatory local sources — fail closed.
    console.error('[BOOKING] availability fail-closed: settings bundle unreadable', error)
    return { ok: false, reason: 'availability_unavailable' }
  }
  const { settings, exceptions } = bundle
  if (!settings?.enabled) return { ok: false, reason: 'booking_disabled' }

  const { windows } = await getEffectiveWeeklyWindows(businessId, settings)
  const timezone = settings.timezone
  const now = new Date()
  const horizon = Math.min(days ?? settings.booking_window_days, settings.booking_window_days)
  const rangeEnd = new Date(now.getTime() + horizon * 86_400_000)

  const busyResult = await getBookingBusyWindows(businessId, timezone, now, rangeEnd, excludeRequestId)
  if (!busyResult.ok) return { ok: false, reason: 'availability_unavailable' }

  const slots = generateAvailableSlots({
    timezone,
    windows,
    exceptions: exceptions.map(e => ({ start: new Date(e.start_at), end: new Date(e.end_at) })),
    busy: busyResult.busy,
    durationMin: settings.default_duration_minutes,
    intervalMin: settings.slot_interval_minutes,
    minNoticeMin: settings.min_notice_minutes,
    horizonDays: horizon,
    now,
  })

  return { ok: true, slots, timezone }
}

/**
 * Canonical slot revalidation — MUST be called by every submit/accept flow.
 * Never trusts a previously-rendered availability snapshot.
 *
 * `excludeRequestId` lets a customer's own active hold not block their own
 * reselection.
 */
export async function revalidateBookingSlot(
  businessId: string,
  startIso: string,
  endIso: string,
  excludeRequestId?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  let bundle
  try {
    bundle = await getBookingSettingsBundle(businessId)
  } catch (error) {
    console.error('[BOOKING] revalidate fail-closed: settings bundle unreadable', error)
    return { ok: false, reason: 'availability_unavailable' }
  }
  const { settings, exceptions } = bundle
  if (!settings?.enabled) return { ok: false, reason: 'booking_disabled' }

  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, reason: 'invalid_time' }
  }

  const { windows } = await getEffectiveWeeklyWindows(businessId, settings)
  const timezone = settings.timezone

  // Load busy for the slot's local day (pad ±1 day for edge safety).
  const rangeStart = new Date(start.getTime() - 86_400_000)
  const rangeEnd = new Date(end.getTime() + 86_400_000)
  const busyResult = await getBookingBusyWindows(businessId, timezone, rangeStart, rangeEnd, excludeRequestId)
  if (!busyResult.ok) {
    // Required busy data could not be verified — refuse rather than risk a
    // double booking. Callers surface a retryable error.
    return { ok: false, reason: 'availability_unavailable' }
  }

  const result = isSlotAvailable({
    timezone,
    windows,
    exceptions: exceptions.map(e => ({ start: new Date(e.start_at), end: new Date(e.end_at) })),
    busy: busyResult.busy,
    durationMin: settings.default_duration_minutes,
    intervalMin: settings.slot_interval_minutes,
    minNoticeMin: settings.min_notice_minutes,
    horizonDays: settings.booking_window_days,
    start,
    end,
  })

  if (!result.ok) {
    // Never expose which busy source blocked — only that it is unavailable.
    return { ok: false, reason: 'slot_unavailable' }
  }
  return { ok: true }
}
