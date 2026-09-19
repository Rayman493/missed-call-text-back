/**
 * Online Booking — Phase 2 conversion.
 *
 * Converts an ACCEPTED booking request into canonical ReplyFlow records:
 *   1. Customer — canonical LeadService path, source = online_booking. The
 *      lead then behaves identically to a manual / missed-call customer.
 *   2. Exactly ONE operational record — Appointment (Google Calendar event
 *      on the business primary calendar) XOR Job (canonical jobs row with
 *      the same Google-sync behavior as the jobs route).
 *
 * INVARIANTS
 *   - booking_requests can never link BOTH appointment_id and job_id
 *     (enforced in application code AND the Phase 2 CHECK constraint).
 *   - Retrying any step is safe: lead_id/appointment_id/job_id are
 *     reconciled before creating anything, so a lost response can never
 *     duplicate a customer or an operational record.
 *   - The booking's agreed window is held in availability until conversion;
 *     the created Job/Appointment then blocks the same window through the
 *     canonical busy sources.
 */

import { formatInTimeZone } from 'date-fns-tz'
import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { LeadService } from '@/lib/services/LeadService'
import { ConversationService } from '@/lib/services/ConversationService'
import { timelineEvents } from '@/lib/event-timeline'
import { createFollowUpJobs } from '@/lib/follow-ups'
import { getGoogleAccessToken } from '@/lib/google/token'
import { toGoogleCalendarEventId } from '@/lib/google/calendar-event-id'
import { bookingAdmin } from './settings'
import { findExistingCustomerForBooking } from './customer-match'
import { agreedWindow } from './actions'
import type { BookingRequest } from './types'

type Supabase = ReturnType<typeof bookingAdmin>

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

async function appendConversionEvent(
  request: Pick<BookingRequest, 'id' | 'business_id'>,
  type: 'lead_linked' | 'appointment_created' | 'job_created' | 'sms_sent' | 'sms_failed',
  note?: string | null,
): Promise<void> {
  const { error } = await bookingAdmin().from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: request.business_id,
    event_type: type,
    actor: 'business',
    from_status: 'accepted',
    to_status: 'accepted',
    note: note ?? null,
  })
  if (error) console.error('[BOOKING] conversion event append failed:', error)
}

export type EnsureLeadResult =
  | { ok: true; leadId: string; conversationId: string | null; isNew: boolean }
  | { ok: false; status: number; error: string }

/**
 * Resolve the canonical customer for an accepted booking request.
 *
 * Retry-safe order:
 *   1. request.lead_id already linked → reuse (prior conversion attempt)
 *   2. Canonical phone match (business + normalized phone) → reuse
 *   3. Create via LeadService.createLead, source = online_booking, with the
 *      booking snapshot preserved in raw_metadata.extracted_info — the same
 *      shape manual intake writes.
 *
 * Never auto-merges on email alone and never creates a parallel customer
 * record — the lead is the canonical customer everywhere else in the app.
 */
export async function ensureLeadForBookingRequest(request: BookingRequest): Promise<EnsureLeadResult> {
  const supabase = bookingAdmin()

  // 1. Prior conversion attempt already linked a lead — reuse it.
  if (request.lead_id) {
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('id', request.lead_id)
      .eq('business_id', request.business_id)
      .maybeSingle()
    if (existing) return { ok: true, leadId: existing.id, conversationId: null, isNew: false }
    // Stale linkage — fall through and re-resolve below.
  }

  // 2. Canonical match: business + normalized phone (same rule as every
  //    other intake path). Email is only a best-effort secondary hint.
  const match = await findExistingCustomerForBooking(request.business_id, {
    phone: request.normalized_phone ?? request.customer_phone,
    email: request.customer_email,
  })

  let leadId: string | null = null
  let isNew = false

  if (match) {
    leadId = match.leadId
  } else {
    // 3. Create through the canonical service — normalized phone, metadata
    //    shape and dedupe identical to manual / AI intake.
    const normalizedPhone = request.normalized_phone
      ?? (request.customer_phone ? normalizePhoneNumberForStorage(request.customer_phone) : null)

    const newLead = await LeadService.createLead({
      business_id: request.business_id,
      caller_phone: normalizedPhone || undefined,
      contact_name: request.customer_name,
      email: request.customer_email || undefined,
      status: 'new',
      source: 'online_booking',
      raw_metadata: {
        extracted_info: {
          callerName: request.customer_name,
          reasonForCalling: request.service || null,
          addressOrLocation: request.customer_address || null,
          email: request.customer_email || null,
          importantDetails: request.notes || null,
        },
        booking_request_id: request.id,
        intake_sources: { booking: 'online_booking' },
      },
    })

    if (!newLead) {
      console.error('[BOOKING] customer conversion failed: LeadService returned null')
      return { ok: false, status: 500, error: 'Could not create the customer. Please try again.' }
    }
    leadId = newLead.id
    isNew = true

    // Populate the leads.source column for provenance charts/fallbacks —
    // LeadService canonicalizes origin in raw_metadata.creation_source
    // (already 'online_booking'); the column mirrors it for this intake.
    await LeadService.updateLead({
      lead_id: leadId,
      updates: { source: 'online_booking' } as any,
    })
  }

  // Canonical conversation — every customer surface expects one.
  let conversationId: string | null = null
  try {
    const convo = await ConversationService.findOrCreateConversation({
      lead_id: leadId,
      business_id: request.business_id,
      status: 'active',
    })
    conversationId = convo.conversationId
  } catch (error) {
    console.error('[BOOKING] conversation resolution failed (non-fatal):', error)
  }

  // Timeline + follow-up parity with the manual-create path (new customers only).
  if (isNew) {
    try {
      const phone = request.normalized_phone ?? request.customer_phone ?? ''
      if (phone) await timelineEvents.leadCreated(request.business_id, leadId, conversationId || '', phone)
    } catch (error) {
      console.error('[BOOKING] leadCreated timeline failed (non-fatal):', error)
    }
    try {
      const { data: business } = await supabase
        .from('businesses')
        .select('name')
        .eq('id', request.business_id)
        .maybeSingle()
      await createFollowUpJobs({
        businessId: request.business_id,
        leadId,
        conversationId: conversationId || undefined,
        businessName: business?.name ?? '',
      })
    } catch (error) {
      console.error('[BOOKING] follow-up job creation failed (non-fatal):', error)
    }
  }

  // Persist linkage — history keeps the conversion auditable.
  const { error: linkError } = await supabase
    .from('booking_requests')
    .update({ lead_id: leadId, updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .is('lead_id', null) // never clobber an existing link (retry-safe)
  if (linkError) {
    console.error('[BOOKING] lead linkage update failed:', linkError)
    return { ok: false, status: 500, error: 'Could not link the customer to this booking. Please try again.' }
  }
  await appendConversionEvent(request, 'lead_linked', `lead:${leadId}${isNew ? ' (new)' : ' (existing)'}`)

  return { ok: true, leadId, conversationId, isNew }
}

export type ConvertResult =
  | { ok: true; alreadyCreated: boolean; kind: 'appointment' | 'job'; recordId: string; leadId: string }
  | { ok: false; status: number; error: string; code?: string; leadId?: string }

/**
 * Create the Appointment for an accepted booking — the canonical Google
 * Calendar primary-calendar event, identical in shape to the create-event
 * route: deterministic event id (retry → 409 → fetch existing), ReplyFlow
 * extended properties, timeline + notification side effects, and the
 * customer status transition.
 */
export async function createAppointmentForBookingRequest(
  businessId: string,
  requestId: string,
): Promise<ConvertResult> {
  const request = await loadOwnedRequest(businessId, requestId)
  if (!request) return { ok: false, status: 404, error: 'Booking request not found' }
  if (request.status !== 'accepted') {
    return { ok: false, status: 409, error: 'Only an accepted booking can become an appointment.' }
  }

  // Idempotent reconcile — a prior attempt that already linked wins.
  if (request.appointment_id) {
    return { ok: true, alreadyCreated: true, kind: 'appointment', recordId: request.appointment_id, leadId: request.lead_id ?? '' }
  }
  if (request.job_id) {
    return { ok: false, status: 409, error: 'This booking already created a job.', code: 'already_converted' }
  }

  // Customer conversion first — retry-safe; preserves lead_id on later retries.
  const lead = await ensureLeadForBookingRequest(request)
  if (!lead.ok) return { ok: false, status: lead.status, error: lead.error }
  const leadId = lead.leadId

  const { start, end } = agreedWindow(request)
  const timezone = request.timezone || 'America/New_York'
  const date = formatInTimeZone(new Date(start), timezone, 'yyyy-MM-dd')
  const endDate = formatInTimeZone(new Date(end), timezone, 'yyyy-MM-dd')
  const startTime = formatInTimeZone(new Date(start), timezone, 'HH:mm')
  const endTime = formatInTimeZone(new Date(end), timezone, 'HH:mm')

  const { accessToken } = await getGoogleAccessToken(businessId).catch((error) => {
    if (error instanceof Error && error.message === 'google_integration_not_found') {
      return { accessToken: null }
    }
    throw error
  })
  if (!accessToken) {
    return {
      ok: false,
      status: 409,
      error: 'Google Calendar is not connected. Connect it in Settings, or create a Job instead.',
      code: 'calendar_not_connected',
      leadId,
    }
  }

  const title = request.service?.trim() || `Booking — ${request.customer_name}`
  const description = [
    `Customer: ${request.customer_name}`,
    request.normalized_phone || request.customer_phone ? `Phone: ${request.normalized_phone ?? request.customer_phone}` : null,
    request.customer_email ? `Email: ${request.customer_email}` : null,
    request.notes ? `Notes: ${request.notes}` : null,
    'Created from Online Booking',
  ].filter(Boolean).join('\n')

  // Deterministic Google event id — a lost response retries into a 409 and
  // we fetch the already-created event instead of duplicating it.
  const googleEventId = toGoogleCalendarEventId(`bk${request.id}`)

  const eventBody = {
    id: googleEventId,
    summary: title,
    description,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: timezone },
    end: { dateTime: `${endDate}T${endTime}:00`, timeZone: timezone },
    ...(request.customer_address ? { location: request.customer_address } : {}),
    extendedProperties: {
      private: {
        replyflow_created: 'true',
        replyflow_lead_id: String(leadId),
        replyflow_booking_request_id: request.id,
      },
    },
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers,
    body: JSON.stringify(eventBody),
  }).catch(() => null)

  let createdEventId: string | null = null
  if (createRes?.ok) {
    const ev = await createRes.json()
    createdEventId = ev.id ?? googleEventId
  } else if (createRes?.status === 409) {
    // Prior attempt succeeded but the response was lost — reuse the event.
    const getRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
      { headers }
    ).catch(() => null)
    if (getRes?.ok) {
      createdEventId = (await getRes.json()).id ?? googleEventId
    }
  }

  if (!createdEventId) {
    const status = createRes?.status ?? 0
    console.error('[BOOKING] google event create failed:', { requestId: request.id, status })
    return {
      ok: false,
      status: status === 401 || status === 403 ? 502 : 500,
      error: 'Could not create the calendar appointment. Please try again.',
      code: 'appointment_create_failed',
      leadId,
    }
  }

  // Link + XOR guard: only write when BOTH linkage fields are still null —
  // a concurrent create-job loses here instead of corrupting the invariant.
  const supabase = bookingAdmin()
  const { data: linked, error: linkError } = await supabase
    .from('booking_requests')
    .update({ appointment_id: createdEventId, lead_id: leadId, updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .is('appointment_id', null)
    .is('job_id', null)
    .select('id, appointment_id, job_id')

  if (linkError) {
    console.error('[BOOKING] appointment linkage failed:', linkError)
  }
  if (!linked || linked.length === 0) {
    // Another conversion won the race — reconcile to the existing record.
    const fresh = await loadOwnedRequest(businessId, requestId)
    if (fresh?.appointment_id) {
      return { ok: true, alreadyCreated: true, kind: 'appointment', recordId: fresh.appointment_id, leadId: fresh.lead_id ?? leadId }
    }
    if (fresh?.job_id) {
      return { ok: false, status: 409, error: 'This booking already created a job.', code: 'already_converted', leadId }
    }
    return { ok: false, status: 500, error: 'Could not link the appointment to this booking. Please try again.', leadId }
  }

  await appendConversionEvent(request, 'appointment_created', `event:${createdEventId}`)

  // Canonical side effects — same as the create-event route.
  try {
    await timelineEvents.appointmentCreated(businessId, createdEventId, title, start, end, leadId)
  } catch (error) {
    console.error('[BOOKING] appointment timeline failed (non-fatal):', error)
  }
  try {
    const { applyCustomerStatusEvent: applyEvent } = await import('@/lib/customer-status-transitions')
    const { data: leadRow } = await supabase.from('leads').select('status').eq('id', leadId).maybeSingle()
    const nextStatus = leadRow ? applyEvent(leadRow.status, 'appointment_created') : null
    if (nextStatus) {
      await supabase.from('leads').update({ status: nextStatus }).eq('id', leadId)
    }
  } catch (error) {
    console.error('[BOOKING] lead status transition failed (non-fatal):', error)
  }

  return { ok: true, alreadyCreated: false, kind: 'appointment', recordId: createdEventId, leadId }
}

/**
 * Create the Job for an accepted booking — canonical jobs-row shape identical
 * to the jobs route (lead_id, schedule fields, source, payment_status) and
 * the same Google Calendar sync behavior (pending → synced/failed on the job
 * row; a Google failure never fails job creation).
 */
export async function createJobForBookingRequest(
  businessId: string,
  requestId: string,
): Promise<ConvertResult> {
  const request = await loadOwnedRequest(businessId, requestId)
  if (!request) return { ok: false, status: 404, error: 'Booking request not found' }
  if (request.status !== 'accepted') {
    return { ok: false, status: 409, error: 'Only an accepted booking can become a job.' }
  }

  if (request.job_id) {
    return { ok: true, alreadyCreated: true, kind: 'job', recordId: request.job_id, leadId: request.lead_id ?? '' }
  }
  if (request.appointment_id) {
    return { ok: false, status: 409, error: 'This booking already created an appointment.', code: 'already_converted' }
  }

  const lead = await ensureLeadForBookingRequest(request)
  if (!lead.ok) return { ok: false, status: lead.status, error: lead.error }
  const leadId = lead.leadId

  const { start, end } = agreedWindow(request)
  const timezone = request.timezone || 'America/New_York'
  const scheduledDate = formatInTimeZone(new Date(start), timezone, 'yyyy-MM-dd')
  const scheduledTime = formatInTimeZone(new Date(start), timezone, 'HH:mm')
  const scheduledEndTime = formatInTimeZone(new Date(end), timezone, 'HH:mm')

  const title = request.service?.trim() || `Booking — ${request.customer_name}`
  const notes = [request.notes?.trim() || null, 'Created from Online Booking'].filter(Boolean).join('\n')

  const supabase = bookingAdmin()
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .insert({
      business_id: businessId,
      title,
      customer_name: request.customer_name,
      customer_phone: request.normalized_phone ?? request.customer_phone,
      service_address: request.customer_address,
      notes: notes || null,
      scheduled_date: scheduledDate,
      scheduled_time: scheduledTime,
      scheduled_end_time: scheduledEndTime,
      status: 'scheduled',
      lead_id: leadId,
      conversation_id: lead.conversationId,
      source: 'manual',
      payment_status: 'none',
    })
    .select()
    .single()

  if (jobError || !job) {
    console.error('[BOOKING] job insert failed:', jobError)
    return { ok: false, status: 500, error: 'Could not create the job. Please try again.', leadId }
  }

  // Link + XOR guard — same atomic reconcile as the appointment path.
  const { data: linked, error: linkError } = await supabase
    .from('booking_requests')
    .update({ job_id: job.id, lead_id: leadId, updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .is('appointment_id', null)
    .is('job_id', null)
    .select('id')

  if (linkError) console.error('[BOOKING] job linkage failed:', linkError)
  if (!linked || linked.length === 0) {
    const fresh = await loadOwnedRequest(businessId, requestId)
    if (fresh?.job_id) {
      return { ok: true, alreadyCreated: true, kind: 'job', recordId: fresh.job_id, leadId: fresh.lead_id ?? leadId }
    }
    if (fresh?.appointment_id) {
      return { ok: false, status: 409, error: 'This booking already created an appointment.', code: 'already_converted', leadId }
    }
    return { ok: false, status: 500, error: 'Could not link the job to this booking. Please try again.', leadId }
  }

  await appendConversionEvent(request, 'job_created', `job:${job.id}`)

  // Google Calendar sync — mirrors the jobs route: when connected, create a
  // primary-calendar event for the job's window and track sync status on the
  // job row. A Google failure marks the job failed-sync but never fails the
  // booking conversion.
  try {
    const { accessToken } = await getGoogleAccessToken(businessId)
    await supabase
      .from('jobs')
      .update({ calendar_sync_status: 'pending', calendar_last_sync_attempt_at: new Date().toISOString() })
      .eq('id', job.id)

    const eventRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: title,
        description: notes || '',
        start: { dateTime: `${scheduledDate}T${scheduledTime}:00`, timeZone: timezone },
        end: { dateTime: `${scheduledDate}T${scheduledEndTime}:00`, timeZone: timezone },
        extendedProperties: {
          private: {
            replyflow_created: 'true',
            replyflow_lead_id: String(leadId),
            replyflow_booking_request_id: request.id,
            replyflow_job_id: job.id,
          },
        },
      }),
    })

    if (eventRes.ok) {
      const ev = await eventRes.json()
      await supabase
        .from('jobs')
        .update({
          google_calendar_event_id: ev.id,
          calendar_sync_status: 'synced',
          calendar_sync_error: null,
          calendar_last_sync_attempt_at: new Date().toISOString(),
          calendar_last_synced_at: new Date().toISOString(),
        })
        .eq('id', job.id)
    } else {
      const body = await eventRes.text().catch(() => '')
      await supabase
        .from('jobs')
        .update({
          calendar_sync_status: 'failed',
          calendar_sync_error: `Google Calendar API returned ${eventRes.status}`,
          calendar_last_sync_attempt_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      console.error('[BOOKING] job google sync failed:', { jobId: job.id, status: eventRes.status, body: body.substring(0, 200) })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message === 'google_integration_not_found') {
      // Not connected — the job is complete without a calendar event.
    } else {
      await supabase
        .from('jobs')
        .update({
          calendar_sync_status: 'failed',
          calendar_sync_error: message.substring(0, 500),
          calendar_last_sync_attempt_at: new Date().toISOString(),
        })
        .eq('id', job.id)
      console.error('[BOOKING] job google sync error:', { jobId: job.id, error: message })
    }
  }

  return { ok: true, alreadyCreated: false, kind: 'job', recordId: job.id, leadId }
}
