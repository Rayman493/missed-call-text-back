import { NextResponse } from 'next/server'
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit'
import { acceptProposedBookingTime } from '@/lib/booking/actions'
import { notifyBookingRequest } from '@/lib/booking/notify'

export const dynamic = 'force-dynamic'

const BODY_MAX_BYTES = 4_000

/**
 * POST /api/booking/requests/by-token/[token]/accept
 * Customer accepts the business-proposed time on the SAME request —
 * validates token + slug binding, revalidates the proposed slot
 * (fail-closed), then status → accepted on the same row with history.
 * Never creates a customer, job, appointment, or a second request.
 *
 * Body: { slug }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { success } = await checkIpRateLimit(getClientIp(request))
  if (!success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { token } = await params

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

  const slug = typeof body.slug === 'string' ? body.slug : ''
  const result = await acceptProposedBookingTime(token, slug)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  // Business-facing notification — the customer confirmed the suggested time.
  if (!result.alreadyApplied) {
    await notifyBookingRequest(result.businessId, result.requestId, 'customer_accepted', result.customerName)
  }

  return NextResponse.json({
    status: result.status,
    agreedStart: result.agreedStart,
    agreedEnd: result.agreedEnd,
    alreadyApplied: result.alreadyApplied,
  })
}
