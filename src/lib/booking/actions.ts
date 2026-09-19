/**
 * Online Booking — Phase 2 negotiation actions.
 *
 * One negotiation = one booking_request. Every action below mutates the SAME
 * row (same id, same continuation_token), moves the hold, and appends
 * booking_request_events history. No action here creates customers, jobs,
 * or appointments — conversion lives in conversion.ts.
 *
 * Status model (unchanged):
 *   pending / customer_reselected  → business may accept, propose, reject
 *   business_proposed              → waiting on customer; business may
 *                                    re-propose or reject
 *   accepted                       → terminal negotiation; converts via
 *                                    Create Appointment XOR Create Job
 *   declined / cancelled / expired → terminal, read-only
 */

import { bookingAdmin } from './settings'
import { revalidateBookingSlot } from './availability'
import { isValidContinuationToken } from './tokens'
import type { BookingRequest, BookingRequestStatus } from './types'
import type { EnsureLeadResult } from './customer-resolution'

const HOLD_MS = 48 * 60 * 60_000

/** Statuses where the business may still act on the negotiation. */
export const BUSINESS_NEGOTIATING_STATUSES: BookingRequestStatus[] = [
  'pending',
  'customer_reselected',
  'business_proposed',
]

/** Statuses from which the business may ACCEPT the live time. */
const ACCEPTABLE_STATUSES: BookingRequestStatus[] = ['pending', 'customer_reselected']

/** Terminal statuses — no mutation allowed. */
const TERMINAL_STATUSES: BookingRequestStatus[] = ['accepted', 'declined', 'cancelled', 'expired']

export type BookingActionResult =
  | {
      ok: true
      alreadyApplied: boolean
      status: BookingRequestStatus
      agreedStart: string | null
      agreedEnd: string | null
      request: BookingRequest
      /** Whether the caller should send the customer SMS for this action. */
      sms: 'none' | 'confirmation' | 'proposal' | 'declined'
    }
  | { ok: false; status: number; error: string; code?: string }

/** The live negotiated window — proposal wins over the original ask. */
export function agreedWindow(request: Pick<BookingRequest, 'requested_start' | 'requested_end' | 'current_proposed_start' | 'current_proposed_end'>): { start: string; end: string } {
  return {
    start: request.current_proposed_start ?? request.requested_start,
    end: request.current_proposed_end ?? request.requested_end,
  }
}

/** Stable duration of an existing booking request in minutes. */
export function bookingRequestDurationMinutes(
  request: Pick<BookingRequest, 'requested_start' | 'requested_end' | 'current_proposed_start' | 'current_proposed_end'>,
): number {
  const { start, end } = agreedWindow(request)
  if (!start || !end) return 0
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(0, Math.round(ms / 60_000))
}

async function resolveBookingCustomer(request: BookingRequest): Promise<EnsureLeadResult> {
  // Dynamic import keeps the server-only customer-resolution module out of
  // the module-load graph for lightweight tests that only import helpers.
  const { ensureLeadForBookingRequest } = await import('./customer-resolution')
  return ensureLeadForBookingRequest(request)
}

async function loadOwnedRequest(businessId: string, requestId: string): Promise<BookingRequest | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(requestId)) return null
  const { data } = await bookingAdmin()
    .from('booking_requests')
    .select('*')
    .eq('id', requestId)
    .eq('business_id', businessId)
    .maybeSingle()
  return (data as BookingRequest | null) ?? null
}

async function appendEvent(
  request: Pick<BookingRequest, 'id' | 'business_id' | 'status'>,
  event: {
    type: string
    actor: 'customer' | 'business' | 'system'
    fromStatus: string | null
    toStatus: string | null
    startAt?: string | null
    endAt?: string | null
    note?: string | null
  },
): Promise<void> {
  const supabase = bookingAdmin()
  const { error } = await supabase.from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: request.business_id,
    event_type: event.type,
    actor: event.actor,
    from_status: event.fromStatus,
    to_status: event.toStatus,
    start_at: event.startAt ?? null,
    end_at: event.endAt ?? null,
    note: event.note ?? null,
  })
  if (error) console.error('[BOOKING] event append failed:', error)
}

/**
 * Business accepts the live negotiated time. Fails closed on unreadable
 * availability, refuses when the slot is gone, and is idempotent on retry.
 * Hold semantics: the agreed window stays held until agreed end — 'accepted'
 * is inside ACTIVE_BOOKING_STATUSES, so the slot remains blocked until the
 * Job/Appointment conversion supersedes it (no double-booking gap).
 */
export async function acceptBookingRequest(
  businessId: string,
  requestId: string,
): Promise<BookingActionResult> {
  const request = await loadOwnedRequest(businessId, requestId)
  if (!request) return { ok: false, status: 404, error: 'Booking request not found' }

  if (request.status === 'accepted') {
    const { start, end } = agreedWindow(request)
    if (!request.lead_id) {
      // A prior acceptance succeeded but customer linking failed or was lost;
      // reconcile the canonical customer now before reporting success.
      const lead = await resolveBookingCustomer(request)
      if (!lead.ok) return { ok: false, status: lead.status, error: lead.error }
    }
    return { ok: true, alreadyApplied: true, status: request.status, agreedStart: start, agreedEnd: end, request, sms: 'none' }
  }
  if (!ACCEPTABLE_STATUSES.includes(request.status)) {
    return {
      ok: false,
      status: 409,
      error: TERMINAL_STATUSES.includes(request.status)
        ? 'This request is already closed.'
        : 'Waiting for the customer to respond — accept is available after they pick a time.',
    }
  }

  const { start, end } = agreedWindow(request)
  const slot = await revalidateBookingSlot(businessId, start, end, request.id)
  if (!slot.ok) {
    if (slot.reason === 'availability_unavailable') {
      return { ok: false, status: 503, error: 'Availability is temporarily unavailable. Please try again shortly.', code: 'availability_unavailable' }
    }
    return {
      ok: false,
      status: 409,
      error: 'That time is no longer available. Suggest another time.',
      code: 'slot_unavailable',
    }
  }

  const supabase = bookingAdmin()
  const { data: updated, error: updateError } = await supabase
    .from('booking_requests')
    .update({
      status: 'accepted',
      // The agreed window stays reserved until it happens or is converted —
      // the hold self-releases at the agreed end so it can never go stale.
      hold_expires_at: end,
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .in('status', ACCEPTABLE_STATUSES) // race guard
    .select('id')

  if (updateError) {
    console.error('[BOOKING] accept update failed:', updateError)
    return { ok: false, status: 500, error: 'Could not accept this request. Please try again.' }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, status: 409, error: 'This request changed while you were deciding. Please refresh.' }
  }

  await appendEvent(request, {
    type: 'accepted',
    actor: 'business',
    fromStatus: request.status,
    toStatus: 'accepted',
    startAt: start,
    endAt: end,
  })

  // Acceptance creates the canonical customer immediately. Failure here rolls
  // the action back to the caller so the business knows the request was not
  // finalized.
  const lead = await resolveBookingCustomer({ ...request, status: 'accepted' })
  if (!lead.ok) {
    return { ok: false, status: lead.status, error: lead.error }
  }

  return {
    ok: true,
    alreadyApplied: false,
    status: 'accepted',
    agreedStart: start,
    agreedEnd: end,
    request: { ...request, status: 'accepted' },
    sms: 'confirmation',
  }
}

/**
 * Business rejects the request. Releases the hold immediately; terminal.
 * Idempotent on retry. SMS state is reported separately — never rolled back.
 */
export async function rejectBookingRequest(
  businessId: string,
  requestId: string,
): Promise<BookingActionResult> {
  const request = await loadOwnedRequest(businessId, requestId)
  if (!request) return { ok: false, status: 404, error: 'Booking request not found' }

  if (request.status === 'declined') {
    return { ok: true, alreadyApplied: true, status: request.status, agreedStart: null, agreedEnd: null, request, sms: 'none' }
  }
  if (TERMINAL_STATUSES.includes(request.status)) {
    return { ok: false, status: 409, error: 'This request is already closed.' }
  }

  const supabase = bookingAdmin()
  const { data: updated, error: updateError } = await supabase
    .from('booking_requests')
    .update({
      status: 'declined',
      hold_expires_at: new Date().toISOString(), // release hold now
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .in('status', BUSINESS_NEGOTIATING_STATUSES) // race guard
    .select('id')

  if (updateError) {
    console.error('[BOOKING] reject update failed:', updateError)
    return { ok: false, status: 500, error: 'Could not decline this request. Please try again.' }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, status: 409, error: 'This request changed while you were deciding. Please refresh.' }
  }

  await appendEvent(request, {
    type: 'declined',
    actor: 'business',
    fromStatus: request.status,
    toStatus: 'declined',
  })

  return {
    ok: true,
    alreadyApplied: false,
    status: 'declined',
    agreedStart: null,
    agreedEnd: null,
    request: { ...request, status: 'declined' },
    sms: 'declined',
  }
}

/**
 * Business suggests a different time on the SAME request. Revalidates the
 * slot with the request's own hold excluded, then moves current_proposed_*,
 * status → business_proposed, and the 48h hold — same row, same token.
 * Idempotent: proposing the identical live proposal is a no-op (no second
 * event, no duplicate SMS trigger).
 */
export async function proposeBookingRequestTime(
  businessId: string,
  requestId: string,
  startIso: string,
  endIso: string,
): Promise<BookingActionResult> {
  const request = await loadOwnedRequest(businessId, requestId)
  if (!request) return { ok: false, status: 404, error: 'Booking request not found' }

  if (!BUSINESS_NEGOTIATING_STATUSES.includes(request.status)) {
    return {
      ok: false,
      status: 409,
      error: 'This request is already closed — a new time can no longer be suggested.',
    }
  }

  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(start < end)) {
    return { ok: false, status: 400, error: 'Please choose a valid time.' }
  }

  // Idempotent replay: identical proposal already live → no-op.
  const liveStart = request.current_proposed_start
  const liveEnd = request.current_proposed_end
  if (
    request.status === 'business_proposed' &&
    liveStart === start.toISOString() &&
    liveEnd === end.toISOString()
  ) {
    return { ok: true, alreadyApplied: true, status: request.status, agreedStart: liveStart, agreedEnd: liveEnd, request, sms: 'none' }
  }

  const slot = await revalidateBookingSlot(businessId, startIso, endIso, request.id, bookingRequestDurationMinutes(request))
  if (!slot.ok) {
    if (slot.reason === 'availability_unavailable') {
      return { ok: false, status: 503, error: 'Availability is temporarily unavailable. Please try again shortly.', code: 'availability_unavailable' }
    }
    return { ok: false, status: 409, error: 'That time is no longer available. Please pick another slot.', code: 'slot_unavailable' }
  }

  const supabase = bookingAdmin()
  const { data: updated, error: updateError } = await supabase
    .from('booking_requests')
    .update({
      current_proposed_start: start.toISOString(),
      current_proposed_end: end.toISOString(),
      status: 'business_proposed',
      hold_expires_at: new Date(Date.now() + HOLD_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .in('status', BUSINESS_NEGOTIATING_STATUSES) // race guard
    .select('id')

  if (updateError) {
    console.error('[BOOKING] propose update failed:', updateError)
    return { ok: false, status: 500, error: 'Could not suggest that time. Please try again.' }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, status: 409, error: 'This request changed while you were deciding. Please refresh.' }
  }

  await appendEvent(request, {
    type: 'time_proposed',
    actor: 'business',
    fromStatus: request.status,
    toStatus: 'business_proposed',
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  })

  return {
    ok: true,
    alreadyApplied: false,
    status: 'business_proposed',
    agreedStart: start.toISOString(),
    agreedEnd: end.toISOString(),
    request: { ...request, status: 'business_proposed', current_proposed_start: start.toISOString(), current_proposed_end: end.toISOString() },
    sms: 'proposal',
  }
}

export type CustomerAcceptResult =
  | { ok: true; alreadyApplied: boolean; status: BookingRequestStatus; agreedStart: string; agreedEnd: string; businessId: string; requestId: string; customerName: string }
  | { ok: false; status: number; error: string; code?: string }

/**
 * Customer accepts the business-proposed time on their token-identified
 * request. Token + slug binding, status gate, fail-closed revalidation of the
 * PROPOSED slot (own hold excluded), then status → accepted on the same row.
 * Idempotent on retry.
 */
export async function acceptProposedBookingTime(
  token: string,
  slug: string,
): Promise<CustomerAcceptResult> {
  if (!isValidContinuationToken(token)) {
    return { ok: false, status: 404, error: 'Booking request not found' }
  }

  const supabase = bookingAdmin()
  const { data: request } = await supabase
    .from('booking_requests')
    .select('*')
    .eq('continuation_token', token)
    .maybeSingle()
  if (!request) return { ok: false, status: 404, error: 'Booking request not found' }

  const { data: settings } = await supabase
    .from('booking_settings')
    .select('public_slug')
    .eq('business_id', request.business_id)
    .maybeSingle()
  if (!settings?.public_slug || settings.public_slug !== slug) {
    return { ok: false, status: 404, error: 'Booking request not found' }
  }

  if (request.status === 'accepted') {
    const { start, end } = agreedWindow(request)
    if (!request.lead_id) {
      const lead = await resolveBookingCustomer(request)
      if (!lead.ok) return { ok: false, status: lead.status, error: lead.error }
    }
    return { ok: true, alreadyApplied: true, status: request.status, agreedStart: start, agreedEnd: end, businessId: request.business_id, requestId: request.id, customerName: request.customer_name }
  }
  if (request.status !== 'business_proposed' || !request.current_proposed_start || !request.current_proposed_end) {
    return {
      ok: false,
      status: 409,
      error: TERMINAL_STATUSES.includes(request.status)
        ? 'This request is already closed.'
        : 'There is no suggested time to accept yet.',
    }
  }

  const start = request.current_proposed_start
  const end = request.current_proposed_end
  const slot = await revalidateBookingSlot(request.business_id, start, end, request.id, bookingRequestDurationMinutes(request))
  if (!slot.ok) {
    if (slot.reason === 'availability_unavailable') {
      return { ok: false, status: 503, error: 'Availability is temporarily unavailable. Please try again shortly.', code: 'availability_unavailable' }
    }
    return { ok: false, status: 409, error: 'That time is no longer available. Please choose another time below.', code: 'slot_unavailable' }
  }

  const { data: updated, error: updateError } = await supabase
    .from('booking_requests')
    .update({
      status: 'accepted',
      hold_expires_at: end, // agreed window reserved until it happens/converts
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .eq('status', 'business_proposed') // race guard
    .select('id')

  if (updateError) {
    console.error('[BOOKING] customer-accept update failed:', updateError)
    return { ok: false, status: 500, error: 'Could not confirm that time. Please try again.' }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, status: 409, error: 'This request changed. Please review the latest status below.' }
  }

  await supabase.from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: request.business_id,
    event_type: 'accepted',
    actor: 'customer',
    from_status: 'business_proposed',
    to_status: 'accepted',
    start_at: start,
    end_at: end,
  })

  const lead = await resolveBookingCustomer({ ...request, status: 'accepted' })
  if (!lead.ok) {
    return { ok: false, status: lead.status, error: lead.error }
  }

  return { ok: true, alreadyApplied: false, status: 'accepted', agreedStart: start, agreedEnd: end, businessId: request.business_id, requestId: request.id, customerName: request.customer_name }
}
