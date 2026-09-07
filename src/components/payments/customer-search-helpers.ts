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
 * Canonical placeholder values that should never be treated as real customer data.
 */
const CUSTOMER_CONTEXT_PLACEHOLDERS = new Set([
  'not collected',
  'not provided',
  'not provided name',
  'unknown',
  'unknown caller',
  'unknown customer',
  'caller',
  'customer',
  'service request',
  'general service',
  'n/a',
])

/**
 * Returns true if a value is a known placeholder, null/undefined, or only whitespace.
 */
export function isPlaceholderValue(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return true
  return CUSTOMER_CONTEXT_PLACEHOLDERS.has(trimmed.toLowerCase())
}

/**
 * Normalize a customer context value for editable form defaults.
 * Returns the trimmed value if meaningful, otherwise null.
 */
export function normalizeEditableContext(value: string | null | undefined): string | null {
  if (isPlaceholderValue(value)) return null
  return (value as string).trim()
}

/**
 * Returns the first non-placeholder value from a list of candidates.
 */
export function firstNonPlaceholder(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const normalized = normalizeEditableContext(value)
    if (normalized) return normalized
  }
  return null
}

/**
 * Determines the display name for a customer
 * Falls back to formatted phone if name is missing or a placeholder
 */
export function getCustomerDisplayName(lead: Lead): string {
  if (!isPlaceholderValue(lead.name)) {
    return (lead.name as string).trim()
  }
  return formatForDisplay(lead.caller_phone || '')
}

/**
 * Determines the secondary display text for a customer
 * Returns formatted phone if available and different from display name
 */
export function getCustomerSecondaryText(lead: Lead): string | null {
  if (!lead.caller_phone || isPlaceholderValue(lead.caller_phone)) {
    return null
  }
  const formattedPhone = formatForDisplay(lead.caller_phone)
  if (isPlaceholderValue(formattedPhone)) return null
  const displayName = getCustomerDisplayName(lead)
  // Only show phone if it's different from the display name
  // Also normalize both to digits for comparison to catch raw E.164 vs formatted phone equivalence
  const displayNameDigits = normalizePhoneDigits(displayName)
  const phoneDigits = normalizePhoneDigits(formattedPhone)
  if (formattedPhone !== displayName && displayNameDigits !== phoneDigits) {
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
    if (lead.name && !isPlaceholderValue(lead.name) && lead.name.toLowerCase().includes(queryLower)) {
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

/**
 * Limits leads to recent customers when query is empty
 * Used by Tap to Pay to show a short useful list without requiring typing
 */
export function getRecentCustomers(leads: Lead[], query: string, limit: number = 5): Lead[] {
  if (!query.trim()) {
    return leads.slice(0, limit)
  }
  return leads
}