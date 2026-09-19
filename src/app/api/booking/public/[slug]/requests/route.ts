import { NextResponse } from 'next/server'
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit'
import { getPublicBookingBusiness } from '@/lib/booking/settings'
import { createBookingRequest } from '@/lib/booking/requests'

export const dynamic = 'force-dynamic'

const BODY_MAX_BYTES = 16_000

/**
 * POST /api/booking/public/[slug]/requests
 * Creates exactly ONE booking request (pre-customer). Never creates a lead,
 * job, appointment, or conversation. Idempotent via clientRequestId.
 */
export async function POST(
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

  // Reject oversized payloads before parsing.
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > BODY_MAX_BYTES) {
    return NextResponse.json({ error: 'Request too large' }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const result = await createBookingRequest({
    businessId: business.businessId,
    customerName: typeof body.customerName === 'string' ? body.customerName : '',
    phone: typeof body.phone === 'string' ? body.phone : '',
    email: typeof body.email === 'string' ? body.email : null,
    address: typeof body.address === 'string' ? body.address : null,
    service: typeof body.service === 'string' ? body.service : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    requestedStart: typeof body.start === 'string' ? body.start : '',
    requestedEnd: typeof body.end === 'string' ? body.end : '',
    timezone: business.settings.timezone,
    clientRequestId: typeof body.clientRequestId === 'string' ? body.clientRequestId : null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Return only what the continuation page needs — no internal ids.
  return NextResponse.json({
    token: result.token,
    status: result.request.status,
    requestedStart: result.request.requested_start,
    requestedEnd: result.request.requested_end,
  })
}
