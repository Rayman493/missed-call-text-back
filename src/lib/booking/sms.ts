/**
 * Online Booking — Phase 2 customer SMS.
 *
 * Every send goes through the canonical outbound path (sendSms in
 * lib/twilio.ts): business canonical number, sender-pool verification,
 * number-readiness gating, simulated-mode support, and system_sms
 * persistence (booking customers are pre-conversion — no lead_id yet).
 *
 * ORDERING CONTRACT: callers persist the booking state FIRST, then send.
 * A delivery failure records an sms_failed history event and returns the
 * outcome — it never rolls back the booking transition and never
 * duplicates history on resend (the proposal event was already written).
 */

import { formatInTimeZone } from 'date-fns-tz'
import { sendSms } from '@/lib/twilio'
import { bookingAdmin } from './settings'
import type { BookingRequest } from './types'

/** Business fields the canonical SMS path requires. */
const BUSINESS_SMS_FIELDS =
  'id, name, twilio_phone_number, twilio_phone_number_sid, twilio_messaging_service_sid, provisioning_status'

async function getBusinessForSms(businessId: string) {
  const { data } = await bookingAdmin()
    .from('businesses')
    .select(BUSINESS_SMS_FIELDS)
    .eq('id', businessId)
    .maybeSingle()
  return data
}

type BusinessForSms = Awaited<ReturnType<typeof getBusinessForSms>>

function publicUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://www.replyflowhq.com'
  return `${base}${path}`
}

function formatSlot(startIso: string, timezone: string): string {
  return formatInTimeZone(new Date(startIso), timezone, "EEE, MMM d 'at' h:mm a")
}

async function recordSmsEvent(
  request: Pick<BookingRequest, 'id' | 'business_id'>,
  kind: 'sms_sent' | 'sms_failed',
  note: string,
): Promise<void> {
  const { error } = await bookingAdmin().from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: request.business_id,
    event_type: kind,
    actor: 'system',
    from_status: null,
    to_status: null,
    note,
  })
  if (error) console.error('[BOOKING] sms event append failed:', error)
}

export interface BookingSmsResult {
  sent: boolean
  sid: string | null
  reason: string | null
}

async function send(
  request: Pick<BookingRequest, 'id' | 'business_id' | 'normalized_phone' | 'customer_phone'>,
  body: string,
  source: string,
  business?: BusinessForSms,
): Promise<BookingSmsResult> {
  const loaded = business ?? (await getBusinessForSms(request.business_id))
  const phone = request.normalized_phone ?? request.customer_phone
  if (!loaded || !phone) {
    const reason = !loaded ? 'business_not_found' : 'no_customer_phone'
    await recordSmsEvent(request, 'sms_failed', `${source}:${reason}`)
    return { sent: false, sid: null, reason }
  }

  const result = await sendSms(loaded, phone, body, {
    source,
    skipBusinessAvailabilityAppend: true,
  })

  if (result?.sid) {
    await recordSmsEvent(request, 'sms_sent', `${source}:${result.sid}`)
    return { sent: true, sid: result.sid, reason: null }
  }

  const reason = result?.reason ?? 'send_failed'
  await recordSmsEvent(request, 'sms_failed', `${source}:${reason}`)
  return { sent: false, sid: null, reason }
}

/** "[Business] suggested a new time … Review or choose another: <link>" */
export async function sendBookingProposalSms(
  request: Pick<BookingRequest, 'id' | 'business_id' | 'normalized_phone' | 'customer_phone' | 'timezone' | 'continuation_token'>,
  slug: string,
  proposedStartIso: string,
): Promise<BookingSmsResult> {
  const business = await getBusinessForSms(request.business_id)
  const businessName = business?.name ?? 'The business'
  const body =
    `${businessName} suggested a new time for your booking: ${formatSlot(proposedStartIso, request.timezone)}. ` +
    `Review or choose another time: ${publicUrl(`/book/${slug}/request/${request.continuation_token}`)}`
  return send(request, body, 'booking_proposal', business ?? undefined)
}

/** "[Business] confirmed your booking for <time>." — no entity jargon. */
export async function sendBookingConfirmationSms(
  request: Pick<BookingRequest, 'id' | 'business_id' | 'normalized_phone' | 'customer_phone' | 'timezone'>,
  agreedStartIso: string,
): Promise<BookingSmsResult> {
  const business = await getBusinessForSms(request.business_id)
  const businessName = business?.name ?? 'The business'
  const body = `${businessName} confirmed your booking for ${formatSlot(agreedStartIso, request.timezone)}.`
  return send(request, body, 'booking_confirmation', business ?? undefined)
}

/** "[Business] can't accommodate your requested time for <time>. Choose another: <link>" */
export async function sendBookingDeclinedSms(
  request: Pick<BookingRequest, 'id' | 'business_id' | 'normalized_phone' | 'customer_phone' | 'requested_start' | 'timezone'>,
  slug: string,
): Promise<BookingSmsResult> {
  const business = await getBusinessForSms(request.business_id)
  const businessName = business?.name ?? 'The business'
  const timePhrase =
    request.requested_start && request.timezone
      ? formatSlot(request.requested_start, request.timezone)
      : 'your requested time'
  const body =
    `${businessName} can’t accommodate your requested time for ${timePhrase}. ` +
    `You’re welcome to choose another time here: ${publicUrl(`/book/${slug}`)}`
  return send(request, body, 'booking_declined', business ?? undefined)
}
