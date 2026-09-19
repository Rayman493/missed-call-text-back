import { NextResponse } from 'next/server'
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit'
import { getPublicBookingBusiness } from '@/lib/booking/settings'

export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/public/[slug]
 * Public business profile for the booking page — safe fields only.
 * Disabled booking and unknown slugs are indistinguishable (404).
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

  return NextResponse.json({
    businessName: business.name,
    logoUrl: business.logoUrl,
    timezone: business.settings.timezone,
    defaultDurationMinutes: business.settings.default_duration_minutes,
    bookingWindowDays: business.settings.booking_window_days,
  })
}
