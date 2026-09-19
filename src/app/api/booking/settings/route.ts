import { NextResponse } from 'next/server'
import { getAuthedBusiness } from '@/lib/booking/api-auth'
import { getBookingSettingsBundle, bookingAdmin, allocatePublicSlug, normalizeSlug } from '@/lib/booking/settings'
import type { BookingSettings } from '@/lib/booking/types'

export const dynamic = 'force-dynamic'

const DAYS = [0, 1, 2, 3, 4, 5, 6]
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/
const DEFAULTS = {
  enabled: false,
  timezone: 'America/New_York',
  default_duration_minutes: 60,
  slot_interval_minutes: 30,
  min_notice_minutes: 240,
  booking_window_days: 30,
  use_business_hours: true,
}

/**
 * GET /api/booking/settings — owner view: settings + hours + exceptions +
 * business-hours reference + shareable URL.
 */
export async function GET(request: Request) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = bookingAdmin()
  let bundle
  let business: { name: string | null; timezone: string | null; business_hours_start: string | null; business_hours_end: string | null; business_hours_timezone: string | null } | null = null
  try {
    const [b, biz] = await Promise.all([
      getBookingSettingsBundle(auth.businessId),
      supabase
        .from('businesses')
        .select('name, timezone, business_hours_start, business_hours_end, business_hours_timezone')
        .eq('id', auth.businessId)
        .maybeSingle(),
    ])
    bundle = b
    business = biz.data
  } catch (error) {
    console.error('[BOOKING] settings load failed:', error)
    return NextResponse.json({ error: 'Could not load booking settings' }, { status: 500 })
  }
  const { settings, hours, exceptions } = bundle

  const resolvedSettings = settings ?? {
    ...DEFAULTS,
    timezone: business?.timezone ?? business?.business_hours_timezone ?? DEFAULTS.timezone,
    public_slug: null,
  }

  return NextResponse.json({
    settings: resolvedSettings,
    hours,
    exceptions,
    businessName: business?.name ?? '',
    businessHours: {
      start: business?.business_hours_start ?? null,
      end: business?.business_hours_end ?? null,
      timezone: business?.business_hours_timezone ?? null,
    },
    bookingUrl: resolvedSettings.public_slug
      ? `/book/${resolvedSettings.public_slug}`
      : null,
  })
}

/**
 * PATCH /api/booking/settings — upsert settings and/or replace weekly hours.
 * Body: { settings?: {...}, hours?: [{day_of_week, start_time, end_time}] }
 * `hours` present (even as []) replaces the whole week.
 */
export async function PATCH(request: Request) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { settings?: Record<string, unknown>; hours?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = bookingAdmin()

  // --- Validate + build settings patch -------------------------------------
  const allowed = new Set([
    'enabled', 'timezone', 'default_duration_minutes', 'slot_interval_minutes',
    'min_notice_minutes', 'booking_window_days', 'use_business_hours', 'public_slug',
  ])
  const patch: Partial<BookingSettings> = {}
  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      if (!allowed.has(key)) continue
      switch (key) {
        case 'enabled':
        case 'use_business_hours':
          if (typeof value !== 'boolean') return badRequest(`${key} must be a boolean`)
          patch[key] = value
          break
        case 'timezone':
          if (typeof value !== 'string' || !value.trim()) return badRequest('Invalid timezone')
          try { new Intl.DateTimeFormat('en-US', { timeZone: value }) } catch {
            return badRequest('Invalid timezone')
          }
          patch.timezone = value
          break
        case 'default_duration_minutes':
          if (!Number.isInteger(value) || (value as number) < 15 || (value as number) > 480) {
            return badRequest('Duration must be 15–480 minutes')
          }
          patch.default_duration_minutes = value as number
          break
        case 'slot_interval_minutes':
          if (!Number.isInteger(value) || (value as number) < 5 || (value as number) > 120) {
            return badRequest('Slot interval must be 5–120 minutes')
          }
          patch.slot_interval_minutes = value as number
          break
        case 'min_notice_minutes':
          if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 4320) {
            return badRequest('Minimum notice must be 0–4320 minutes')
          }
          patch.min_notice_minutes = value as number
          break
        case 'booking_window_days':
          if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 365) {
            return badRequest('Booking window must be 1–365 days')
          }
          patch.booking_window_days = value as number
          break
        case 'public_slug': {
          const slug = normalizeSlug(String(value))
          if (!slug) return badRequest('Booking link may only use lowercase letters, numbers, and hyphens')
          patch.public_slug = slug
          break
        }
      }
    }
  }

  // --- Validate weekly hours (full replacement semantics) -------------------
  let hoursRows: { day_of_week: number; start_time: string; end_time: string }[] | null = null
  if (body.hours !== undefined) {
    if (!Array.isArray(body.hours)) return badRequest('hours must be an array')
    hoursRows = []
    for (const row of body.hours as { day_of_week?: unknown; start_time?: unknown; end_time?: unknown }[]) {
      const day = Number(row.day_of_week)
      const start = typeof row.start_time === 'string' ? row.start_time.slice(0, 5) : ''
      const end = typeof row.end_time === 'string' ? row.end_time.slice(0, 5) : ''
      if (!DAYS.includes(day) || !TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || start >= end) {
        return badRequest('Each open day needs a valid start and end time')
      }
      hoursRows.push({ day_of_week: day, start_time: start, end_time: end })
    }
  }

  // --- Enabling requires a slug — allocate from business name if missing ----
  if (patch.enabled === true) {
    const { data: current } = await supabase
      .from('booking_settings')
      .select('public_slug')
      .eq('business_id', auth.businessId)
      .maybeSingle()
    if (!patch.public_slug && !current?.public_slug) {
      const { data: business } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', auth.businessId)
        .maybeSingle()
      patch.public_slug = await allocatePublicSlug(business?.name ?? 'book')
    }
  }

  // --- Upsert settings -------------------------------------------------------
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from('booking_settings')
      .upsert(
        { business_id: auth.businessId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: 'business_id' }
      )
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'That booking link is already taken' }, { status: 409 })
      }
      console.error('[BOOKING] settings upsert failed:', error)
      return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
    }
  }

  // --- Replace weekly hours ---------------------------------------------------
  if (hoursRows !== null) {
    const { error: deleteError } = await supabase
      .from('booking_hours')
      .delete()
      .eq('business_id', auth.businessId)
    if (deleteError) {
      console.error('[BOOKING] hours delete failed:', deleteError)
      return NextResponse.json({ error: 'Could not save hours' }, { status: 500 })
    }
    if (hoursRows.length > 0) {
      const { error: insertError } = await supabase
        .from('booking_hours')
        .insert(hoursRows.map(r => ({ business_id: auth.businessId, ...r })))
      if (insertError) {
        console.error('[BOOKING] hours insert failed:', insertError)
        return NextResponse.json({ error: 'Could not save hours' }, { status: 500 })
      }
    }
  }

  return GET(request)
}

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}
