import { NextResponse } from 'next/server'
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit'
import { getPublicBookingRequest } from '@/lib/booking/requests'

export const dynamic = 'force-dynamic'

/**
 * GET /api/booking/requests/by-token/[token]
 * Public continuation lookup — the opaque token is the only credential.
 * Returns only the customer-visible request view; never internal ids,
 * business hours, exceptions, other requests, or calendar data.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { success } = await checkIpRateLimit(getClientIp(request))
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params
  const view = await getPublicBookingRequest(token)
  if (!view) {
    return NextResponse.json({ error: 'Booking request not found' }, { status: 404 })
  }

  return NextResponse.json(view)
}
