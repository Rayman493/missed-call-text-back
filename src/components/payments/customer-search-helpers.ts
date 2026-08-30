import { formatForDisplay } from '@/utils/phone-formatting'

export interface Lead {
  id: string
  name: string | null
  caller_phone: string | null
}

/**
 * Normalizes a phone number to digits-only for search matching
 */
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Determines the display name for a customer
 * Falls back to formatted phone if name is missing or "Not collected"
 */
export function getCustomerDisplayName(lead: Lead): string {
  if (lead.name && lead.name !== 'Not collected') {
    return lead.name
  }
  return formatForDisplay(lead.caller_phone || '')
}

/**
 * Determines the secondary display text for a customer
 * Returns formatted phone if available and different from display name
 */
export function getCustomerSecondaryText(lead: Lead): string | null {
  if (!lead.caller_phone) {
    return null
  }
  const formattedPhone = formatForDisplay(lead.caller_phone)
  const displayName = getCustomerDisplayName(lead)
  // Only show phone if it's different from the display name
  if (formattedPhone !== displayName) {
    return formattedPhone
  }
  return null
}

/**
 * Filters leads based on search query
 * Matches by name (case-insensitive) or phone (formatting-agnostic)
 */
export function filterLeadsBySearchQuery(leads: Lead[], query: string): Lead[] {
  if (!query.trim()) {
    return leads
  }

  const queryLower = query.toLowerCase()
  const queryDigits = normalizePhoneDigits(query)

  return leads.filter((lead) => {
    // Match by name (case-insensitive, ignore placeholder names)
    if (lead.name && lead.name !== 'Not collected' && lead.name.toLowerCase().includes(queryLower)) {
      return true
    }

    // Match by phone (formatting-agnostic digit matching)
    if (lead.caller_phone) {
      const phoneDigits = normalizePhoneDigits(lead.caller_phone)
      // Bidirectional matching: query digits in phone, or phone digits in query
      // This allows partial matches (e.g., "412" matches "4125551212")
      // and full matches with country code (e.g., "14125551212" matches "4125551212")
      if (queryDigits && phoneDigits && (phoneDigits.includes(queryDigits) || queryDigits.includes(phoneDigits))) {
        return true
      }
    }

    return false
  })
}