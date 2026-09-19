/**
 * Online Booking — future customer-matching foundation.
 *
 * Phase 1 does NOT create customers. This helper exists so the later
 * accept/convert flow can reuse the canonical identity rule:
 *   one canonical customer per (business_id, normalized caller_phone).
 *
 * Match priority: 1) normalized phone (canonical)  2) normalized email
 * (best-effort against raw_metadata.extracted_info.email — there is no
 * dedicated email column). Weak matches are never auto-merged; the helper
 * only reports candidates for the business to confirm.
 */

import { LeadService } from '@/lib/services/LeadService'
import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin'
import { bookingAdmin } from './settings'

export interface BookingCustomerMatch {
  leadId: string
  matchedOn: 'phone' | 'email'
  contactName: string | null
  callerPhone: string | null
  status: string | null
}

/**
 * Find an existing canonical customer for a booking request, if any.
 * Returns null when there is no confident match — the convert flow should
 * then create a fresh customer through the canonical path.
 */
export async function findExistingCustomerForBooking(
  businessId: string,
  input: { phone?: string | null; email?: string | null },
): Promise<BookingCustomerMatch | null> {
  // 1. Canonical phone match — the same rule every intake path uses.
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

  // 2. Best-effort email match — secondary only. Email lives in
  // raw_metadata.extracted_info.email (no dedicated column); a hit is a
  // candidate for business confirmation, never a silent merge.
  const email = input.email?.trim().toLowerCase()
  if (email) {
    const supabase = bookingAdmin()
    const { data } = await supabase
      .from('leads')
      .select('id, contact_name, caller_phone, status')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .ilike('raw_metadata->extracted_info->>email', email)
      .limit(1)
    const lead = data?.[0]
    if (lead) {
      return {
        leadId: lead.id,
        matchedOn: 'email',
        contactName: lead.contact_name ?? null,
        callerPhone: lead.caller_phone ?? null,
        status: lead.status ?? null,
      }
    }
  }

  return null
}
