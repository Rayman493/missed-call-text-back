/**
 * Online Booking — booking request creation + public continuation lookup.
 *
 * PRE-CUSTOMER CONTRACT enforced here: creating a request writes ONLY to
 * booking_requests + booking_request_events. It never touches leads, jobs,
 * appointments, conversations, or Google Calendar.
 */

import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { bookingAdmin } from './settings'
import { revalidateBookingSlot } from './availability'
import { generateContinuationToken, isValidContinuationToken } from './tokens'
import type { BookingRequest } from './types'

export { generateContinuationToken, isValidContinuationToken }

const CUSTOMER_NAME_MAX = 120
const FIELD_MAX = 300
const NOTES_MAX = 2000

export interface CreateBookingRequestInput {
  businessId: string
  customerName: string
  phone: string
  email?: string | null
  address?: string | null
  service?: string | null
  notes?: string | null
  requestedStart: string // ISO
  requestedEnd: string // ISO
  timezone: string
  clientRequestId?: string | null
}

export type CreateBookingRequestResult =
  | { ok: true; request: BookingRequest; token: string; alreadyExisted: boolean }
  | { ok: false; status: number; error: string }

const trim = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t.slice(0, max) : null
}

/**
 * Create exactly one booking request after full server-side validation:
 * required customer fields, phone normalization, and canonical slot
 * revalidation. Idempotent via clientRequestId — a duplicate submit returns
 * the original request + token instead of creating a second row.
 */
export async function createBookingRequest(
  input: CreateBookingRequestInput,
): Promise<CreateBookingRequestResult> {
  const supabase = bookingAdmin()

  // --- Customer snapshot validation (enough for later canonical creation) --
  const customerName = trim(input.customerName, CUSTOMER_NAME_MAX)
  if (!customerName) {
    return { ok: false, status: 400, error: 'Please enter your name.' }
  }

  const rawPhone = trim(input.phone, 40)
  const normalizedPhone = rawPhone ? normalizePhoneNumberForStorage(rawPhone) : null
  if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 10) {
    return { ok: false, status: 400, error: 'Please enter a valid phone number.' }
  }

  const email = trim(input.email, 254)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'Please enter a valid email address.' }
  }

  const address = trim(input.address, FIELD_MAX)
  const service = trim(input.service, FIELD_MAX)
  const notes = trim(input.notes, NOTES_MAX)

  const clientRequestId = trim(input.clientRequestId, 80)
  if (clientRequestId && !/^[A-Za-z0-9_-]{8,80}$/.test(clientRequestId)) {
    return { ok: false, status: 400, error: 'Invalid request.' }
  }

  // --- Idempotent replay: same clientRequestId → same request --------------
  if (clientRequestId) {
    const { data: existing } = await supabase
      .from('booking_requests')
      .select('*')
      .eq('business_id', input.businessId)
      .eq('client_request_id', clientRequestId)
      .maybeSingle()
    if (existing) {
      return {
        ok: true,
        request: existing as BookingRequest,
        token: existing.continuation_token,
        alreadyExisted: true,
      }
    }
  }

  // --- Canonical slot revalidation (never trust the browser snapshot) ------
  const slot = await revalidateBookingSlot(input.businessId, input.requestedStart, input.requestedEnd)
  if (!slot.ok) {
    if (slot.reason === 'availability_unavailable') {
      // Required busy data could not be verified — retryable, nothing created.
      return {
        ok: false,
        status: 503,
        error: 'Availability is temporarily unavailable. Please try again shortly.',
      }
    }
    const message =
      slot.reason === 'booking_disabled'
        ? 'Online booking is not available for this business.'
        : 'That time is no longer available. Please choose another time.'
    return { ok: false, status: 409, error: message }
  }

  // --- Insert the single persistent request --------------------------------
  const token = generateContinuationToken()
  const { data: request, error } = await supabase
    .from('booking_requests')
    .insert({
      business_id: input.businessId,
      continuation_token: token,
      client_request_id: clientRequestId,
      status: 'pending',
      customer_name: customerName,
      customer_phone: rawPhone,
      normalized_phone: normalizedPhone,
      customer_email: email,
      customer_address: address,
      service,
      notes,
      requested_start: input.requestedStart,
      requested_end: input.requestedEnd,
      timezone: input.timezone,
      lead_id: null,
      appointment_id: null,
      job_id: null,
    })
    .select()
    .single()

  if (error || !request) {
    // Unique-violation on client_request_id → another request won the race.
    if (error?.code === '23505' && clientRequestId) {
      const { data: existing } = await supabase
        .from('booking_requests')
        .select('*')
        .eq('business_id', input.businessId)
        .eq('client_request_id', clientRequestId)
        .maybeSingle()
      if (existing) {
        return {
          ok: true,
          request: existing as BookingRequest,
          token: existing.continuation_token,
          alreadyExisted: true,
        }
      }
    }
    console.error('[BOOKING] request insert failed:', error)
    return { ok: false, status: 500, error: 'Could not send your booking request. Please try again.' }
  }

  // --- History: request created ---------------------------------------------
  await supabase.from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: input.businessId,
    event_type: 'created',
    actor: 'customer',
    to_status: 'pending',
    start_at: input.requestedStart,
    end_at: input.requestedEnd,
  })

  return { ok: true, request: request as BookingRequest, token, alreadyExisted: false }
}

/**
 * Public continuation view — only safe fields, scoped to the exact token.
 * Never exposes internal ids beyond what the URL already proves, and never
 * exposes business hours/exceptions, other requests, or calendar data.
 */
export async function getPublicBookingRequest(token: string): Promise<{
  businessName: string
  businessSlug: string | null
  timezone: string
  durationMinutes: number | null
  status: BookingRequest['status']
  requestedStart: string
  requestedEnd: string
  proposedStart: string | null
  proposedEnd: string | null
  service: string | null
  customerName: string
} | null> {
  if (!isValidContinuationToken(token)) return null

  const supabase = bookingAdmin()
  const { data: request } = await supabase
    .from('booking_requests')
    .select('business_id, status, requested_start, requested_end, current_proposed_start, current_proposed_end, service, customer_name, timezone')
    .eq('continuation_token', token)
    .maybeSingle()

  if (!request) return null

  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', request.business_id)
    .maybeSingle()
  const { data: settings } = await supabase
    .from('booking_settings')
    .select('public_slug, default_duration_minutes')
    .eq('business_id', request.business_id)
    .maybeSingle()

  return {
    businessName: business?.name ?? 'the business',
    businessSlug: settings?.public_slug ?? null,
    timezone: request.timezone,
    durationMinutes: settings?.default_duration_minutes ?? null,
    status: request.status,
    requestedStart: request.requested_start,
    requestedEnd: request.requested_end,
    proposedStart: request.current_proposed_start,
    proposedEnd: request.current_proposed_end,
    service: request.service,
    customerName: request.customer_name,
  }
}

/** Statuses from which a customer may re-pick a time on the SAME request. */
export const RESELECTABLE_STATUSES: BookingRequest['status'][] = [
  'pending',
  'business_proposed',
  'customer_reselected',
]

const HOLD_MS = 48 * 60 * 60_000 // matches the 48h default in the migration

export type ReselectResult =
  | {
      ok: true
      alreadyApplied: boolean
      status: BookingRequest['status']
      start: string
      end: string
      businessId: string
      requestId: string
      customerName: string
    }
  | { ok: false; status: number; error: string }

/**
 * Same-request time reselection — the ONLY way an existing requester changes
 * time. Validates token + slug binding, gates on status, revalidates the new
 * slot with the request's own hold excluded, then moves the live proposal,
 * status, and hold on the SAME row (same id, same continuation_token) and
 * appends a `time_selected` history event.
 *
 * Idempotent: repeating the exact same slot is a no-op — no second event,
 * no extended hold.
 */
export async function reselectBookingRequestTime(
  token: string,
  slug: string,
  startIso: string,
  endIso: string,
): Promise<ReselectResult> {
  if (!isValidContinuationToken(token)) {
    return { ok: false, status: 404, error: 'Booking request not found' }
  }

  const supabase = bookingAdmin()
  const { data: request } = await supabase
    .from('booking_requests')
    .select('id, business_id, status, customer_name, requested_start, requested_end, current_proposed_start, current_proposed_end')
    .eq('continuation_token', token)
    .maybeSingle()

  if (!request) {
    return { ok: false, status: 404, error: 'Booking request not found' }
  }

  // Token must belong to the business this slug resolves to.
  const { data: settings } = await supabase
    .from('booking_settings')
    .select('public_slug')
    .eq('business_id', request.business_id)
    .maybeSingle()
  if (!settings?.public_slug || settings.public_slug !== slug) {
    return { ok: false, status: 404, error: 'Booking request not found' }
  }

  // Terminal requests cannot be renegotiated on this identity.
  if (!RESELECTABLE_STATUSES.includes(request.status)) {
    return {
      ok: false,
      status: 409,
      error: 'This request can no longer be changed. Please contact the business directly.',
    }
  }

  const start = new Date(startIso)
  const end = new Date(endIso)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || !(start < end)) {
    return { ok: false, status: 400, error: 'Please choose a valid time.' }
  }

  // Idempotent replay: identical reselection → no-op (no duplicate history,
  // no unbounded hold refresh).
  const liveStart = request.current_proposed_start ?? request.requested_start
  const liveEnd = request.current_proposed_end ?? request.requested_end
  if (
    liveStart === start.toISOString() &&
    liveEnd === end.toISOString() &&
    request.status === 'customer_reselected'
  ) {
    return { ok: true, alreadyApplied: true, status: request.status, start: liveStart, end: liveEnd, businessId: request.business_id, requestId: request.id, customerName: request.customer_name }
  }

  // Canonical revalidation — the request's own hold does not block itself.
  const slot = await revalidateBookingSlot(request.business_id, startIso, endIso, request.id)
  if (!slot.ok) {
    if (slot.reason === 'availability_unavailable') {
      return {
        ok: false,
        status: 503,
        error: 'Availability is temporarily unavailable. Please try again shortly.',
      }
    }
    return {
      ok: false,
      status: 409,
      error: 'That time is no longer available. Please choose another time.',
    }
  }

  // Move the live proposal + hold on the SAME row. requested_* stays the
  // original ask (timeline anchor); current_proposed_* becomes the live time.
  const { data: updated, error: updateError } = await supabase
    .from('booking_requests')
    .update({
      current_proposed_start: start.toISOString(),
      current_proposed_end: end.toISOString(),
      status: 'customer_reselected',
      hold_expires_at: new Date(Date.now() + HOLD_MS).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', request.id)
    .in('status', RESELECTABLE_STATUSES) // race guard: only if still reselectable
    .select('id')

  if (updateError) {
    console.error('[BOOKING] reselect update failed:', updateError)
    return { ok: false, status: 500, error: 'Could not update your request. Please try again.' }
  }
  if (!updated || updated.length === 0) {
    // Status moved to terminal between read and update — refuse cleanly.
    return {
      ok: false,
      status: 409,
      error: 'This request can no longer be changed. Please contact the business directly.',
    }
  }

  // Append history — the negotiation timeline grows on ONE request.
  await supabase.from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: request.business_id,
    event_type: 'time_selected',
    actor: 'customer',
    from_status: request.status,
    to_status: 'customer_reselected',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  })

  return {
    ok: true,
    alreadyApplied: false,
    status: 'customer_reselected',
    start: start.toISOString(),
    end: end.toISOString(),
    businessId: request.business_id,
    requestId: request.id,
    customerName: request.customer_name,
  }
}
