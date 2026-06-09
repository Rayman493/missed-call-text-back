/**
 * AI Intake Field Mapping Utility
 * 
 * Provides canonical field names and backward compatibility for reading extracted_info
 */

/**
 * Canonical field names for AI extracted_info
 */
export const CANONICAL_FIELDS = {
  callerName: 'callerName',
  reasonForCalling: 'reasonForCalling',
  importantDetails: 'importantDetails',
  urgencyLevel: 'urgencyLevel',
  addressOrLocation: 'addressOrLocation',
  preferredCallbackTime: 'preferredCallbackTime',
  callbackNumber: 'callbackNumber',
  summary: 'summary',
  additionalInfo: 'additionalInfo'
} as const

/**
 * Old field name aliases for backward compatibility when reading
 */
const FIELD_ALIASES: Record<string, keyof typeof CANONICAL_FIELDS> = {
  'name': 'callerName',
  'caller_name': 'callerName',
  'callerName': 'callerName',
  'caller name': 'callerName',

  'reason': 'reasonForCalling',
  'reason_for_call': 'reasonForCalling',
  'reasonForCalling': 'reasonForCalling',
  'reason for calling': 'reasonForCalling',

  'details': 'importantDetails',
  'importantDetails': 'importantDetails',
  'important details': 'importantDetails',

  'urgency': 'urgencyLevel',
  'urgencyLevel': 'urgencyLevel',
  'urgency level': 'urgencyLevel',

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

  'callbackNumber': 'callbackNumber',
  'callback number': 'callbackNumber',
  'callback_number': 'callbackNumber',

  'additionalInfo': 'additionalInfo',
  'additional info': 'additionalInfo',
  'additional_info': 'additionalInfo'
}

/**
 * Read extracted_info with backward compatibility for old field names
 * Returns an object with only canonical field names
 */
export function normalizeExtractedInfo(extractedInfo: any): {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  urgencyLevel?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  callbackNumber?: string
  summary?: string
  additionalInfo?: string
} {
  const normalized: any = {}

  // Map each possible field to its canonical name
  for (const [key, value] of Object.entries(extractedInfo || {})) {
    if (value === null || value === undefined) continue

    const canonicalKey = FIELD_ALIASES[key.toLowerCase()] || key

    // Only include if it's a canonical field
    if (Object.values(CANONICAL_FIELDS).includes(canonicalKey as any)) {
      normalized[canonicalKey] = value
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
  urgencyLevel?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  callbackNumber?: string
  summary?: string
  additionalInfo?: string
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
