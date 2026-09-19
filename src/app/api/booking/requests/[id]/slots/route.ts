import { NextResponse } from 'next/server'
import { formatInTimeZone } from 'date-fns-tz'
import { getAuthedBusiness } from '@/lib/booking/api-auth'
import { bookingAdmin } from '@/lib/booking/settings'
import { computeBookingAvailability } from '@/lib/booking/availability'
import { bookingRequestDurationMinutes } from '@/lib/booking/actions'

export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/requests/[id]/slots
 * Owner-side slot picker for "Suggest New Time" — the SAME availability
 * engine as the public page, with this request's own hold excluded so the
 * business can move the negotiation without blocking itself.
 * Returns safe slot data only — never busy-source details.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const { data: req } = await bookingAdmin()
    .from('booking_requests')
    .select('id, requested_start, requested_end, current_proposed_start, current_proposed_end, timezone')
    .eq('id', id)
    .eq('business_id', auth.businessId)
    .maybeSingle()
  if (!req) return NextResponse.json({ error: 'Booking request not found' }, { status: 404 })

  const result = await computeBookingAvailability(auth.businessId, undefined, req.id, bookingRequestDurationMinutes(req))
  if (!result.ok) {
    if (result.reason === 'availability_unavailable') {
      return NextResponse.json({ error: 'availability_temporarily_unavailable' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Online booking is not enabled' }, { status: 409 })
  }

  // Anchor the picker at the negotiation's current date: the proposed slot
  // if one is in play, otherwise the customer's original requested date.
  // Days earlier than the anchor are dropped so the picker opens near the
  // relevant date instead of weeks of prior slots. The full engine contract
  // (horizon, min notice, holds, conflicts, duration) is unchanged.
  const anchorIso = req.current_proposed_start ?? req.requested_start
  const anchor = anchorIso ? new Date(anchorIso) : null
  let slots = result.slots
  if (anchor && anchor.getTime() > Date.now()) {
    const tz = req.timezone || result.timezone
    const anchorDay = formatInTimeZone(anchor, tz, 'yyyy-MM-dd')
    slots = result.slots.filter(
      (s) => formatInTimeZone(new Date(s.start), tz, 'yyyy-MM-dd') >= anchorDay
    )
  }

  return NextResponse.json({ timezone: result.timezone, slots })
}
