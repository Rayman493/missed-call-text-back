/**
 * Online Booking — canonical customer resolution.
 *
 * Shared by both acceptance (actions.ts) and conversion (conversion.ts) so
 * a booking request links to exactly one canonical customer as soon as it is
 * accepted, and conversion later reuses that customer.
 */

import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { LeadService } from '@/lib/services/LeadService'
import { ConversationService } from '@/lib/services/ConversationService'
import { timelineEvents } from '@/lib/event-timeline'
import { createFollowUpJobs } from '@/lib/follow-ups'
import { bookingAdmin } from './settings'
import type { BookingRequest } from './types'

// Note: this module must not import other server-only files besides the
// shared admin helper re-exported by ./settings; that keeps it loadable in
// client-side tests that mock bookingAdmin.

export interface BookingCustomerMatch {
  leadId: string
  matchedOn: 'phone' | 'email'
  contactName: string | null
  callerPhone: string | null
  status: string | null
}

export type EnsureLeadResult =
  | { ok: true; leadId: string; conversationId: string | null; isNew: boolean }
  | { ok: false; status: number; error: string }

async function appendLeadLinkedEvent(
  request: Pick<BookingRequest, 'id' | 'business_id'>,
  leadId: string,
  isNew: boolean,
): Promise<void> {
  const { error } = await bookingAdmin().from('booking_request_events').insert({
    booking_request_id: request.id,
    business_id: request.business_id,
    event_type: 'lead_linked',
    actor: 'business',
    from_status: 'accepted',
    to_status: 'accepted',
    note: `lead:${leadId}${isNew ? ' (new)' : ' (existing)'}`,
  })
  if (error) console.error('[BOOKING] lead_linked event append failed:', error)
}

/**
 * Find an existing canonical customer for a booking request, if any.
 * Returns null when there is no confident match — the acceptance/convert flow
 * should then create a fresh customer through the canonical path.
 */
export async function findExistingCustomerForBooking(
  businessId: string,
  input: { phone?: string | null; email?: string | null },
): Promise<BookingCustomerMatch | null> {
  // 1. Canonical phone match — the ONLY automatic identity key.
  // Email is never used to auto-link two customer records because shared
  // household/business inboxes, recycled addresses, and corrections would
  // silently merge distinct people.
  const phone = input.phone ? normalizePhoneNumberForStorage(input.phone) : null
  if (phone) {
    const lead = await LeadService.findLead({ business_id: businessId, caller_phone: phone })
    if (lead) {
      return {
        leadId: lead.id,
        matchedOn: 'phone',
        contactName: lead.contact_name ?? lead.name ?? null,
        callerPhone: lead.caller_phone ?? null,
        status: lead.status ?? null,
      }
    }
  }

  return null
}

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

  // 1. Prior conversion/acceptance attempt already linked a lead — reuse it.
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
  await appendLeadLinkedEvent(request, leadId, isNew)

  return { ok: true, leadId, conversationId, isNew }
}
