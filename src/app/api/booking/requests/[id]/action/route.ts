import { NextResponse } from 'next/server'
import { getAuthedBusiness } from '@/lib/booking/api-auth'
import { bookingAdmin } from '@/lib/booking/settings'
import {
  acceptBookingRequest,
  rejectBookingRequest,
  proposeBookingRequestTime,
} from '@/lib/booking/actions'
import {
  createAppointmentForBookingRequest,
  createJobForBookingRequest,
} from '@/lib/booking/conversion'
import {
  sendBookingProposalSms,
  sendBookingConfirmationSms,
  sendBookingDeclinedSms,
} from '@/lib/booking/sms'
import { notifyBookingRequest } from '@/lib/booking/notify'
import type { BookingRequest } from '@/lib/booking/types'

export const dynamic = 'force-dynamic'

const BODY_MAX_BYTES = 4_000

type ActionName =
  | 'accept'
  | 'reject'
  | 'propose'
  | 'resend-proposal'
  | 'create-appointment'
  | 'create-job'

async function getSlug(businessId: string): Promise<string | null> {
  const { data } = await bookingAdmin()
    .from('booking_settings')
    .select('public_slug')
    .eq('business_id', businessId)
    .maybeSingle()
  return data?.public_slug ?? null
}

/**
 * POST /api/booking/requests/[id]/action
 * Owner-side booking actions. Body: { action, start?, end? }.
 *
 * Ordering contract: the booking state transitions FIRST; SMS + notification
 * side effects run after persistence so a delivery failure can never roll
 * back or corrupt the negotiation.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthedBusiness(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params

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

  const action = body.action as ActionName

  switch (action) {
    case 'accept': {
      const result = await acceptBookingRequest(auth.businessId, id)
      if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })

      let smsSent: boolean | null = null
      if (!result.alreadyApplied && result.sms === 'confirmation') {
        const sms = await sendBookingConfirmationSms(result.request, result.agreedStart!)
        smsSent = sms.sent
      }
      return NextResponse.json({
        status: result.status,
        agreedStart: result.agreedStart,
        agreedEnd: result.agreedEnd,
        alreadyApplied: result.alreadyApplied,
        smsSent,
      })
    }

    case 'reject': {
      const result = await rejectBookingRequest(auth.businessId, id)
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

      let smsSent: boolean | null = null
      if (!result.alreadyApplied && result.sms === 'declined') {
        const slug = await getSlug(auth.businessId)
        if (slug) {
          const sms = await sendBookingDeclinedSms(result.request, slug)
          smsSent = sms.sent
        }
      }
      return NextResponse.json({
        status: result.status,
        alreadyApplied: result.alreadyApplied,
        smsSent,
      })
    }

    case 'propose': {
      const start = typeof body.start === 'string' ? body.start : ''
      const end = typeof body.end === 'string' ? body.end : ''
      const result = await proposeBookingRequestTime(auth.businessId, id, start, end)
      if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })

      // Persisted proposal first, SMS second — a send failure leaves the
      // proposal intact and surfaces as a resendable delivery state.
      let smsSent: boolean | null = null
      if (!result.alreadyApplied && result.sms === 'proposal') {
        const slug = await getSlug(auth.businessId)
        if (slug) {
          const sms = await sendBookingProposalSms(result.request as BookingRequest, slug, result.agreedStart!)
          smsSent = sms.sent
        }
      }
      return NextResponse.json({
        status: result.status,
        agreedStart: result.agreedStart,
        agreedEnd: result.agreedEnd,
        alreadyApplied: result.alreadyApplied,
        smsSent,
      })
    }

    case 'resend-proposal': {
      // Safe resend: state untouched, no new history event besides the SMS
      // delivery record — the proposal itself is never duplicated.
      const { data: req } = await bookingAdmin()
        .from('booking_requests')
        .select('id, business_id, status, normalized_phone, customer_phone, timezone, continuation_token, current_proposed_start')
        .eq('id', id)
        .eq('business_id', auth.businessId)
        .maybeSingle()
      if (!req) return NextResponse.json({ error: 'Booking request not found' }, { status: 404 })
      if (req.status !== 'business_proposed' || !req.current_proposed_start) {
        return NextResponse.json({ error: 'There is no suggested time to resend.' }, { status: 409 })
      }
      const slug = await getSlug(auth.businessId)
      if (!slug) return NextResponse.json({ error: 'Booking page is not available.' }, { status: 409 })
      const sms = await sendBookingProposalSms(req as BookingRequest, slug, req.current_proposed_start)
      return NextResponse.json({ status: req.status, smsSent: sms.sent })
    }

    case 'create-appointment': {
      const result = await createAppointmentForBookingRequest(auth.businessId, id)
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code, leadId: result.leadId ?? null }, { status: result.status })
      }
      return NextResponse.json({
        kind: 'appointment',
        recordId: result.recordId,
        leadId: result.leadId,
        alreadyCreated: result.alreadyCreated,
      })
    }

    case 'create-job': {
      const result = await createJobForBookingRequest(auth.businessId, id)
      if (!result.ok) {
        return NextResponse.json({ error: result.error, code: result.code, leadId: result.leadId ?? null }, { status: result.status })
      }
      return NextResponse.json({
        kind: 'job',
        recordId: result.recordId,
        leadId: result.leadId,
        alreadyCreated: result.alreadyCreated,
      })
    }

    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
