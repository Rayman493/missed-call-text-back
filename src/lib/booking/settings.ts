/**
 * Online Booking — settings storage + public-slug helpers (server-side).
 *
 * Uses the service-role client only; all public availability/request reads
 * funnel through these functions so RLS can stay owner-scoped.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { BookingException, BookingHoursRow, BookingSettings } from './types'

export function bookingAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const BOOKING_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,63}$/

export function slugifyBusinessName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return base.length >= 3 ? base : 'book'
}

export function normalizeSlug(input: string): string | null {
  const slug = input.trim().toLowerCase()
  return BOOKING_SLUG_PATTERN.test(slug) ? slug : null
}

export interface BookingSettingsBundle {
  settings: BookingSettings | null
  hours: BookingHoursRow[]
  exceptions: BookingException[]
}

/**
 * Full booking configuration for a business (owner or service context).
 * Throws on any read error — hours/exceptions are mandatory sources, and a
 * swallowed error would silently expose blocked time as bookable.
 */
export async function getBookingSettingsBundle(businessId: string): Promise<BookingSettingsBundle> {
  const supabase = bookingAdmin()
  const [settingsRes, hoursRes, exceptionsRes] = await Promise.all([
    supabase.from('booking_settings').select('*').eq('business_id', businessId).maybeSingle(),
    supabase.from('booking_hours').select('*').eq('business_id', businessId).order('day_of_week'),
    supabase.from('booking_exceptions').select('*').eq('business_id', businessId)
      .gte('end_at', new Date().toISOString())
      .order('start_at'),
  ])
  if (settingsRes.error) throw settingsRes.error
  if (hoursRes.error) throw hoursRes.error
  if (exceptionsRes.error) throw exceptionsRes.error
  return {
    settings: (settingsRes.data as BookingSettings | null) ?? null,
    hours: (hoursRes.data as BookingHoursRow[]) ?? [],
    exceptions: (exceptionsRes.data as BookingException[]) ?? [],
  }
}

export interface PublicBookingBusiness {
  businessId: string
  name: string
  logoUrl: string | null
  settings: BookingSettings
}

/**
 * Resolve a public slug to the minimal data a booking page may show.
 * Returns null when booking is disabled or the slug does not exist — the
 * public must not be able to distinguish the two cases.
 */
export async function getPublicBookingBusiness(slug: string): Promise<PublicBookingBusiness | null> {
  const normalized = normalizeSlug(slug)
  if (!normalized) return null

  const supabase = bookingAdmin()
  const { data: settings } = await supabase
    .from('booking_settings')
    .select('*')
    .eq('public_slug', normalized)
    .eq('enabled', true)
    .maybeSingle()

  if (!settings) return null

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name, logo_url, business_hours_start, business_hours_end, business_hours_timezone')
    .eq('id', settings.business_id)
    .maybeSingle()

  if (!business) return null

  return {
    businessId: business.id,
    name: business.name,
    logoUrl: business.logo_url ?? null,
    settings: settings as BookingSettings,
  }
}

/**
 * Allocate a unique public slug for a business — slugified name with a short
 * numeric suffix on collision.
 */
export async function allocatePublicSlug(businessName: string): Promise<string> {
  const supabase = bookingAdmin()
  const base = slugifyBusinessName(businessName)
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    const { data } = await supabase
      .from('booking_settings')
      .select('id')
      .eq('public_slug', candidate)
      .maybeSingle()
    if (!data) return candidate
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}
