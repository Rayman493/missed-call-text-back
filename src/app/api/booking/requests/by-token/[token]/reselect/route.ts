import { NextResponse } from 'next/server'
import { checkIpRateLimit, getClientIp } from '@/lib/rate-limit'
import { reselectBookingRequestTime } from '@/lib/booking/requests'

export const dynamic = 'force-dynamic'

const BODY_MAX_BYTES = 4_000

/**
 * POST /api/booking/requests/by-token/[token]/reselect
 * Same-request time reselection — updates the EXISTING request identified by
 * the opaque continuation token. Never creates a second booking request,
 * never touches customer identity fields, never exposes busy-source data.
 *
 * Body: { slug, start, end }
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
  const start = typeof body.start === 'string' ? body.start : ''
  const end = typeof body.end === 'string' ? body.end : ''

  const result = await reselectBookingRequestTime(token, slug, start, end)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  // Safe view only — no internal ids beyond what the URL already proves.
  return NextResponse.json({
    status: result.status,
    proposedStart: result.start,
    proposedEnd: result.end,
  })
}
