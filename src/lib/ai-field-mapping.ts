/**
 * AI Intake Field Mapping Utility
 *
 * Provides canonical field names and backward compatibility for reading extracted_info
 */

import { normalizeCustomerName, normalizeServiceReason, normalizeAddress, normalizeTiming, normalizeAdditionalDetails, safeTrimAndCapitalize, generateCanonicalRequestTitle, validateRequestTitle } from './ai-intake-formatter'
import { isCompleteAIIntake } from './ai-intake-completion'

/**
 * Generate a concise request title from AI intake reason
 * Target: 2-5 meaningful words for use in cards, jobs, tasks, etc.
 * 
 * This function now uses the canonical request title generation for consistency
 * across the application.
 * 
 * Examples:
 * - "I need someone to come look at my kitchen sink that's leaking" → "Kitchen Sink Repair"
 * - "I'm looking for beginner piano lessons for my daughter" → "Beginner Piano Lessons"
 * - "I need weekly lawn maintenance for my property" → "Weekly Lawn Maintenance"
 * - "I want to schedule an HVAC tune-up before winter" → "HVAC Tune-Up"
 * - "I need a bathroom remodel estimate" → "Bathroom Remodel Estimate"
 */
export function generateConciseRequestTitle(reasonForCalling: string | undefined | null): string {
  const title = generateCanonicalRequestTitle(reasonForCalling)
  return title === 'Not collected' ? '' : title
}

// Helper function to detect if a string looks like a phone number
function looksLikePhoneNumber(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  
  const cleaned = text.replace(/[\s\-\(\)\+]/g, '');
  
  // Phone numbers are typically 10+ digits
  if (cleaned.length < 10) return false;
  
  // Check if mostly digits (at least 80%)
  const digitCount = (cleaned.match(/\d/g) || []).length;
  const digitRatio = digitCount / cleaned.length;
  
  return digitRatio >= 0.8;
}

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
  summary: 'summary',
  serviceLocationType: 'serviceLocationType'
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
  'request': 'reasonForCalling',

  'details': 'importantDetails',
  'importantDetails': 'importantDetails',
  'important details': 'importantDetails',
  'additionalDetails': 'importantDetails',
  'additional_details': 'importantDetails',

  'urgency': 'desiredCompletionTime',
  'urgencyLevel': 'desiredCompletionTime',
  'urgency level': 'desiredCompletionTime',
  'desiredCompletionTime': 'desiredCompletionTime',
  'desired completion time': 'desiredCompletionTime',
  'desiredCompletion': 'desiredCompletionTime',
  'desired_completion': 'desiredCompletionTime',

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
  'issue_description': 'importantDetails',
  
  'serviceLocationType': 'serviceLocationType',
  'service_location_type': 'serviceLocationType',
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
  serviceLocationType?: string
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

/**
 * Canonical AI intake status values
 */
export type AIIntakeStatus = 'not_started' | 'partial' | 'complete' | 'failed'

/**
 * Get canonical AI intake status from ai_call_records outcome
 * This is the single source of truth for AI intake status across the application
 * 
 * Recalculates status from extracted fields if outcome is partial but all required fields are present.
 * This handles cases where the AI voice service had a bug when the call was made.
 */
export function getAIIntakeStatus(lead: any, serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null): AIIntakeStatus {
  const aiCallRecord = lead?.aiCallRecords?.[0] || lead?.ai_call_records?.[0]
  
  if (!aiCallRecord) {
    return 'not_started'
  }

  const outcome = aiCallRecord.outcome?.toLowerCase()
  const extractedInfo = aiCallRecord.extracted_info || {}

  // If outcome is partial but all required fields are present, override to complete
  // This handles cases where the AI voice service had a completion check bug
  if (outcome === 'partial_intake' || outcome === 'incomplete') {
    // Default to onsite if serviceLocationType is not available
    const effectiveServiceLocationType = serviceLocationType || 'onsite'
    if (isCompleteAIIntake(extractedInfo, effectiveServiceLocationType)) {
      console.log('[AI INTAKE STATUS] Override partial outcome to complete - all required fields present', {
        originalOutcome: outcome,
        serviceLocationType: effectiveServiceLocationType,
        extractedInfoKeys: Object.keys(extractedInfo)
      })
      return 'complete'
    }
  }

  switch (outcome) {
    case 'completed_intake':
    case 'completed':
      return 'complete'
    case 'partial_intake':
    case 'incomplete':
      return 'partial'
    case 'ai_failed':
    case 'ai_connection_failed':
      return 'failed'
    case 'early_hangup':
    case 'no_speech':
    case 'caller_hung_up':
    case 'voicemail_fallback':
      // These are not intakes, return not_started
      return 'not_started'
    default:
      return 'not_started'
  }
}

/**
 * Get human-readable label for AI intake status
 */
export function getAIIntakeStatusLabel(status: AIIntakeStatus): string {
  switch (status) {
    case 'complete':
      return 'Intake Complete'
    case 'partial':
      return 'Partial Intake'
    case 'failed':
      return 'Failed'
    case 'not_started':
      return 'Not Started'
  }
}

/**
 * Get color class for AI intake status badge
 */
export function getAIIntakeStatusColor(status: AIIntakeStatus): string {
  switch (status) {
    case 'complete':
      return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    case 'partial':
      return 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    case 'failed':
      return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
    case 'not_started':
      return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
  }
}

/**
 * Canonical AI intake fields resolved from a lead record.
 * Supports both Simple Mode field names and legacy aliases.
 */
export interface LeadAIIntake {
  customerName: string | null
  customerPhone: string | null
  serviceRequested: string | null
  additionalDetails: string | null
  serviceAddress: string | null
  desiredCompletion: string | null
  callbackTime: string | null
  conciseRequestTitle: string | null
}

/**
 * Resolve canonical AI intake fields from a lead.
 * Reads from ai_call_records, raw_metadata.extracted_info, raw_metadata.ai_extracted_info,
 * direct raw_metadata fields, and corrected_fields with proper fallback chains.
 */
export function getLeadAIIntake(lead: any): LeadAIIntake {
  const rawMetadata = lead?.raw_metadata || {}

  // Extracted info from ai_call_records (UI-normalized) or raw_metadata
  const extractedInfoRaw =
    lead?.aiCallRecords?.[0]?.extracted_info ||
    lead?.ai_call_records?.[0]?.extracted_info ||
    rawMetadata.extracted_info ||
    rawMetadata.ai_extracted_info ||
    {}

  const normalized = normalizeExtractedInfo(extractedInfoRaw)

  // Customer corrections override extracted info when present
  const corrected = rawMetadata.corrected_fields || {}

  const pick = (...candidates: (string | null | undefined)[]): string | null => {
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim()) return c.trim()
    }
    return null
  }

  // Pick function that filters out phone numbers (for customer name field)
  const pickNotPhone = (...candidates: (string | null | undefined)[]): string | null => {
    for (const c of candidates) {
      if (c && typeof c === 'string' && c.trim()) {
        const trimmed = c.trim()
        // Skip if it looks like a phone number
        if (!looksLikePhoneNumber(trimmed)) {
          return trimmed
        }
      }
    }
    return null
  }

  // FIELD SELECTION TRACE - Log which field is selected in fallback chain (disabled for production)
  const traceFieldSelection = (fieldName: string, candidates: (string | null | undefined)[], pickerFn: typeof pick = pick): string | null => {
    const selected = pickerFn(...candidates);
    const selectedIndex = candidates.findIndex(c => c && typeof c === 'string' && c.trim() === selected);
    
    // Debug logging disabled - uncomment for development debugging
    // if (process.env.ENABLE_FIELD_TRACE === 'true') {
    //   console.log('[FIELD SELECTION TRACE] =========================================');
    //   console.log('[FIELD SELECTION TRACE] field:', fieldName);
    //   console.log('[FIELD SELECTION TRACE] selectedValue:', selected);
    //   console.log('[FIELD SELECTION TRACE] selectedIndex:', selectedIndex);
    //   console.log('[FIELD SELECTION TRACE] candidates:', candidates);
    //   console.log('[FIELD SELECTION TRACE] leadId:', lead?.id);
    //   console.log('[FIELD SELECTION TRACE] Timestamp:', new Date().toISOString());
    //   console.log('[FIELD SELECTION TRACE] =========================================');
    // }
    
    return selected;
  };

  // Extract service requested value first for concise title generation
  const serviceRequestedValue = normalizeServiceReason(traceFieldSelection('serviceRequested', [
    corrected.serviceRequested,
    corrected.reason,
    corrected.reasonForCalling,
    rawMetadata.serviceRequested,
    normalized.reasonForCalling,
    extractedInfoRaw.serviceRequested
  ], pick));

  const result = {
    customerName: normalizeCustomerName(traceFieldSelection('customerName', [
      corrected.name,
      corrected.callerName,
      corrected.customerName,
      corrected.caller_name,
      lead?.name,
      lead?.contact_name,
      rawMetadata.customerName,
      rawMetadata.callerName,
      rawMetadata.caller_name,
      normalized.callerName,
      rawMetadata.name,
      extractedInfoRaw.customerName
    ], pickNotPhone)),
    customerPhone: pick(
      lead?.caller_phone,
      lead?.phone,
      rawMetadata.callbackNumber,
      rawMetadata.phone,
      rawMetadata.caller_phone,
      extractedInfoRaw.callbackNumber,
      extractedInfoRaw.phone,
      extractedInfoRaw.customerPhone
    ),
    serviceRequested: serviceRequestedValue,
    additionalDetails: normalizeAdditionalDetails(pick(
      corrected.details,
      corrected.issueDescription,
      corrected.importantDetails,
      rawMetadata.additionalDetails,
      normalized.importantDetails,
      extractedInfoRaw.additionalDetails
    )),
    serviceAddress: normalizeAddress(pick(
      corrected.address,
      corrected.serviceAddress,
      corrected.addressOrLocation,
      rawMetadata.serviceAddress,
      normalized.addressOrLocation,
      rawMetadata.address,
      extractedInfoRaw.serviceAddress
    )),
    desiredCompletion: normalizeTiming(pick(
      corrected.desiredCompletion,
      corrected.urgency,
      corrected.urgencyLevel,
      corrected.desiredCompletionTime,
      rawMetadata.desiredCompletion,
      normalized.desiredCompletionTime,
      extractedInfoRaw.desiredCompletion
    )),
    callbackTime: normalizeTiming(pick(
      corrected.callbackTime,
      corrected.callback_time,
      corrected.preferredCallbackTime,
      rawMetadata.callbackTime,
      normalized.preferredCallbackTime,
      extractedInfoRaw.callbackTime
    )),
    conciseRequestTitle: generateConciseRequestTitle(
      serviceRequestedValue ||
      corrected.serviceRequested ||
      corrected.reason ||
      corrected.reasonForCalling ||
      rawMetadata.serviceRequested ||
      normalized.reasonForCalling ||
      extractedInfoRaw.serviceRequested
    ),
  }

  // Development-only trace log
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    console.log('[getLeadAIIntake debug]', {
      leadId: lead?.id,
      leadName: lead?.name,
      rawMetadataKeys: Object.keys(rawMetadata),
      extractedInfoSource: lead?.aiCallRecords?.[0]?.extracted_info
        ? 'aiCallRecords[0].extracted_info'
        : lead?.ai_call_records?.[0]?.extracted_info
          ? 'ai_call_records[0].extracted_info'
          : rawMetadata.extracted_info
            ? 'raw_metadata.extracted_info'
            : rawMetadata.ai_extracted_info
              ? 'raw_metadata.ai_extracted_info'
              : 'none',
      extractedInfoRaw,
      normalized,
      result,
    })
  }

  return result
}

/**
 * Get canonical request title for a lead.
 * This is the single source of truth for displaying customer request titles across ReplyFlow.
 *
 * Resolution order:
 * 1. Structured AI Intake conciseRequestTitle (validated to reject conversational filler)
 * 2. If invalid, regenerate from additionalDetails (full customer sentence)
 * 3. Canonical serviceRequested field on lead (validated, then regenerated from details if invalid)
 * 4. Job titles (for manually created jobs)
 * 5. Generic fallback
 *
 * @param lead - Lead object with raw_metadata and/or aiCallRecords
 * @returns Concise request title (e.g., "Lawn Mowing", "Kitchen Sink Repair")
 */
export function getLeadRequestTitle(lead: any): string {
  if (!lead) return ''

  const rawMetadata = lead?.raw_metadata || {}

  // Primary: Use the canonical AI intake concise request title
  const aiIntake = getLeadAIIntake(lead)
  if (aiIntake.conciseRequestTitle) {
    // Validate the title to reject conversational filler
    const validated = validateRequestTitle(aiIntake.conciseRequestTitle)
    if (validated) {
      return validated
    }
    // If validation fails, regenerate from additionalDetails (full customer sentence)
    if (aiIntake.additionalDetails) {
      const regenerated = generateCanonicalRequestTitle(aiIntake.additionalDetails)
      if (regenerated !== 'Not collected' && regenerated !== 'General Service') {
        return regenerated
      }
    }
  }

  // Secondary: Check for explicit request field on lead or raw_metadata
  const explicitRequest = rawMetadata.request || rawMetadata.serviceRequested || rawMetadata.reason || aiIntake.serviceRequested
  if (explicitRequest && typeof explicitRequest === 'string' && explicitRequest.trim()) {
    // Validate first to reject bad patterns
    const validated = validateRequestTitle(explicitRequest.trim())
    if (validated) {
      return validated
    }
    // If validation fails, regenerate from additionalDetails instead of canonicalizing the invalid value
    if (aiIntake.additionalDetails) {
      const regenerated = generateCanonicalRequestTitle(aiIntake.additionalDetails)
      if (regenerated !== 'Not collected' && regenerated !== 'General Service') {
        return regenerated
      }
    }
    // Fallback: canonicalize the raw value if additionalDetails is not available
    const normalized = generateCanonicalRequestTitle(explicitRequest.trim())
    if (normalized !== 'Not collected' && normalized !== 'General Service') {
      return normalized
    }
  }

  // Tertiary: Check for additionalDetails directly if no explicit request was found
  if (aiIntake.additionalDetails) {
    const regenerated = generateCanonicalRequestTitle(aiIntake.additionalDetails)
    if (regenerated !== 'Not collected' && regenerated !== 'General Service') {
      return regenerated
    }
  }

  // Quaternary: Check job titles (for manually created jobs)
  if (lead.jobs && lead.jobs.length > 0) {
    const firstJob = lead.jobs[0]
    if (firstJob.title && typeof firstJob.title === 'string' && firstJob.title.trim()) {
      return firstJob.title.trim()
    }
  }

  // Fallback: Return empty string (UI should handle this gracefully)
  return ''
}
