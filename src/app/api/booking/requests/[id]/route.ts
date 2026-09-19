import { NextResponse } from 'next/server'
import { getAuthedBusiness } from '@/lib/booking/api-auth'
import { bookingAdmin } from '@/lib/booking/settings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/requests/[id]
 * Owner detail for the Schedule → Overview management surface: the request
 * plus its negotiation history. Private surface — never reachable publicly.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const supabase = bookingAdmin()

  const { data: req, error } = await supabase
    .from('booking_requests')
    .select(
      'id, status, customer_name, customer_phone, normalized_phone, customer_email, customer_address, service, notes, requested_start, requested_end, current_proposed_start, current_proposed_end, timezone, hold_expires_at, lead_id, appointment_id, job_id, created_at, updated_at'
    )
    .eq('id', id)
    .eq('business_id', auth.businessId)
    .maybeSingle()

  if (error) {
    console.error('[BOOKING] request detail failed:', error)
    return NextResponse.json({ error: 'Could not load the booking request' }, { status: 500 })
  }
  if (!req) return NextResponse.json({ error: 'Booking request not found' }, { status: 404 })

  const { data: events } = await supabase
    .from('booking_request_events')
    .select('id, event_type, actor, from_status, to_status, start_at, end_at, note, created_at')
    .eq('booking_request_id', req.id)
    .order('created_at', { ascending: true })

  // Slug is needed for the public booking link in decline/proposal UX.
  const { data: settings } = await supabase
    .from('booking_settings')
    .select('public_slug, timezone, default_duration_minutes')
    .eq('business_id', auth.businessId)
    .maybeSingle()

  return NextResponse.json({
    ...req,
    events: events ?? [],
    bookingSlug: settings?.public_slug ?? null,
    settingsTimezone: settings?.timezone ?? req.timezone,
    durationMinutes: settings?.default_duration_minutes ?? null,
  })
}
