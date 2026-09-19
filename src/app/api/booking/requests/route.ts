import { NextResponse } from 'next/server'
import { getAuthedBusiness } from '@/lib/booking/api-auth'
import { bookingAdmin, getBookingSettingsBundle } from '@/lib/booking/settings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/requests?status=&limit=
 * Owner read model for the Schedule → Overview booking section.
 * Returns request list + per-status counts. Private surface — may include
 * customer snapshot fields the owner needs to act on the request.
 */
export async function GET(request: Request) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)

  const supabase = bookingAdmin()
  let query = supabase
    .from('booking_requests')
    .select(
      'id, status, customer_name, customer_phone, customer_email, customer_address, service, notes, requested_start, requested_end, current_proposed_start, current_proposed_end, timezone, hold_expires_at, lead_id, appointment_id, job_id, created_at',
      { count: 'exact' }
    )
    .eq('business_id', auth.businessId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data: requests, error, count } = await query
  if (error) {
    console.error('[BOOKING] request list failed:', error)
    return NextResponse.json({ error: 'Could not load booking requests' }, { status: 500 })
  }

  // Per-status counts for the overview card header.
  const { data: statusRows } = await supabase
    .from('booking_requests')
    .select('status')
    .eq('business_id', auth.businessId)
  const counts: Record<string, number> = {}
  for (const row of statusRows ?? []) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }

  // Lightweight booking settings summary so the card can surface the public
  // link / setup CTA without a second round-trip.
  let bookingEnabled = false
  let bookingUrl: string | null = null
  try {
    const { settings } = await getBookingSettingsBundle(auth.businessId)
    bookingEnabled = settings?.enabled ?? false
    bookingUrl = settings?.public_slug ? `/book/${settings.public_slug}` : null
  } catch {
    // Non-fatal — the request list is still usable.
  }

  return NextResponse.json({
    requests: requests ?? [],
    counts,
    total: count ?? 0,
    bookingEnabled,
    bookingUrl,
  })
}
