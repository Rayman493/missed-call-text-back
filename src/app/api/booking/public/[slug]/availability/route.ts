import { NextResponse } from 'next/server'
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit'
import { getPublicBookingBusiness, bookingAdmin } from '@/lib/booking/settings'
import { computeBookingAvailability } from '@/lib/booking/availability'
import { isValidContinuationToken } from '@/lib/booking/tokens'

export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/public/[slug]/availability?days=N&token=T
 * Returns ONLY { start, end } slot objects — never busy-source details,
 * event titles, customer data, or internal ids.
 *
 * `token` (optional): a valid continuation token for THIS business hides that
 * request's own hold, so an existing requester can re-pick a time for the
 * same request without their held slot appearing unavailable.
 *
 * Fail-closed: when an authoritative busy source (a connected Google
 * Calendar, or a mandatory local source) cannot be read, this returns
 * 503 { error: 'availability_temporarily_unavailable' } — never speculative
 * slots.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { success } = await checkIpRateLimit(getClientIp(request))
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { slug } = await params
  const business = await getPublicBookingBusiness(slug)
  if (!business) {
    return NextResponse.json({ error: 'Booking page not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const daysParam = Number(url.searchParams.get('days'))
  const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 60) : undefined

  // Optional own-hold exclusion for same-request reselection.
  let excludeRequestId: string | undefined
  const token = url.searchParams.get('token')
  if (token && isValidContinuationToken(token)) {
    const { data: req } = await bookingAdmin()
      .from('booking_requests')
      .select('id')
      .eq('continuation_token', token)
      .eq('business_id', business.businessId)
      .maybeSingle()
    if (req) excludeRequestId = req.id
  }

  try {
    const result = await computeBookingAvailability(business.businessId, days, excludeRequestId)
    if (!result.ok) {
      if (result.reason === 'booking_disabled') {
        return NextResponse.json({ error: 'Booking page not found' }, { status: 404 })
      }
      // Authoritative busy source unreadable — fail closed, no slots.
      return NextResponse.json(
        { error: 'availability_temporarily_unavailable' },
        { status: 503 }
      )
    }
    return NextResponse.json({
      timezone: result.timezone,
      slots: result.slots, // [{start, end}] — nothing else
    })
  } catch (error) {
    console.error('[BOOKING] availability failed:', error)
    return NextResponse.json(
      { error: 'availability_temporarily_unavailable' },
      { status: 503 }
    )
  }
}
