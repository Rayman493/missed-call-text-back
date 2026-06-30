/**
 * AI Intake Field Mapping Utility
 *
 * Provides canonical field names and backward compatibility for reading extracted_info
 */

/**
 * Apply sentence capitalization to a string
 * Only capitalizes the first character if it's lowercase
 * Preserves the rest of the text exactly as-is (acronyms, proper nouns, etc.)
 */
function applySentenceCapitalization(text: string): string {
  if (!text || typeof text !== 'string') return text
  if (text.length === 0) return text

  // If first character is lowercase, capitalize it
  const firstChar = text[0]
  if (firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
    return firstChar.toUpperCase() + text.slice(1)
  }

  return text
}

/**
 * Canonical field names for AI extracted_info
 */
export const CANONICAL_FIELDS = {
  callerName: 'callerName',
  reasonForCalling: 'reasonForCalling',
  importantDetails: 'importantDetails',
  desiredCompletionTime: 'desiredCompletionTime',
  addressOrLocation: 'addressOrLocation',
  preferredCallbackTime: 'preferredCallbackTime',
  summary: 'summary'
} as const

/**
 * Old field name aliases for backward compatibility when reading
 */
const FIELD_ALIASES: Record<string, keyof typeof CANONICAL_FIELDS> = {
  'name': 'callerName',
  'caller_name': 'callerName',
  'callerName': 'callerName',
  'caller name': 'callerName',
  'customerName': 'callerName',
  'customer_name': 'callerName',

  'reason': 'reasonForCalling',
  'reason_for_call': 'reasonForCalling',
  'reasonForCalling': 'reasonForCalling',
  'reason for calling': 'reasonForCalling',
  'serviceRequested': 'reasonForCalling',
  'service_requested': 'reasonForCalling',

  'details': 'importantDetails',
  'importantDetails': 'importantDetails',
  'important details': 'importantDetails',

  'urgency': 'desiredCompletionTime',
  'urgencyLevel': 'desiredCompletionTime',
  'urgency level': 'desiredCompletionTime',
  'desiredCompletionTime': 'desiredCompletionTime',
  'desired completion time': 'desiredCompletionTime',

  'location': 'addressOrLocation',
  'address': 'addressOrLocation',
  'addressOrLocation': 'addressOrLocation',
  'address or location': 'addressOrLocation',
  'serviceAddress': 'addressOrLocation',
  'service_address': 'addressOrLocation',
  'location/address': 'addressOrLocation',

  'callbackTime': 'preferredCallbackTime',
  'preferredCallbackTime': 'preferredCallbackTime',
  'preferred callback time': 'preferredCallbackTime',
  'callback_time': 'preferredCallbackTime',
  'issueDescription': 'importantDetails',
  'issue_description': 'importantDetails'
}

/**
 * Read extracted_info with backward compatibility for old field names
 * Returns an object with only canonical field names
 * Applies sentence capitalization to specific fields for consistent display
 */
export function normalizeExtractedInfo(extractedInfo: any): {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  desiredCompletionTime?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  summary?: string
} {
  const normalized: any = {}

  // Map each possible field to its canonical name
  for (const [key, value] of Object.entries(extractedInfo || {})) {
    if (value === null || value === undefined) continue

    const canonicalKey = FIELD_ALIASES[key] || FIELD_ALIASES[key.toLowerCase()] || key

    // Only include if it's a canonical field
    if (Object.values(CANONICAL_FIELDS).includes(canonicalKey as any)) {
      let normalizedValue = value

      // Apply sentence capitalization to specific fields
      // Do NOT apply to importantDetails (free-form notes should preserve customer's wording)
      if (typeof value === 'string' &&
          (canonicalKey === 'reasonForCalling' ||
          canonicalKey === 'addressOrLocation' ||
          canonicalKey === 'desiredCompletionTime' ||
          canonicalKey === 'preferredCallbackTime')) {
        normalizedValue = applySentenceCapitalization(value)
      }

      normalized[canonicalKey] = normalizedValue
    }
  }

  return normalized
}

/**
 * Get a specific field from extracted_info with backward compatibility
 */
export function getExtractedField(
  extractedInfo: any,
  canonicalField: keyof typeof CANONICAL_FIELDS
): string | undefined {
  const normalized = normalizeExtractedInfo(extractedInfo)
  return normalized[canonicalField]
}

/**
 * Write extracted_info using only canonical field names
 * This ensures all writes use the canonical keys
 */
export function canonicalizeExtractedInfo(extractedInfo: any): {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  desiredCompletionTime?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  summary?: string
} {
  const canonical: any = {}

  // Only include canonical fields
  for (const key of Object.values(CANONICAL_FIELDS)) {
    if (extractedInfo[key]) {
      canonical[key] = extractedInfo[key]
    }
  }

  return canonical
}
