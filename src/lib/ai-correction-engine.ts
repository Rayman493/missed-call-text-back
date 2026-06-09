/**
 * AI Intake Correction Engine
 * 
 * Detects and applies customer corrections to AI intake data
 * RC1: Uses simple pattern matching (no OpenAI)
 */

import { normalizeExtractedInfo, canonicalizeExtractedInfo } from './ai-field-mapping'

export interface CorrectionDetectionResult {
  isCorrection: boolean
  fieldChanged?: string
  oldValue?: string
  newValue?: string
  confidence: number
  requiresReview: boolean
  reason?: string
}

export interface ExtractedInfo {
  callerName?: string
  reasonForCalling?: string
  importantDetails?: string
  urgencyLevel?: string
  addressOrLocation?: string
  preferredCallbackTime?: string
  callbackNumber?: string
}

/**
 * Clean the extracted value by removing common prefixes
 * This ensures we store only the meaningful corrected value, not the entire sentence
 */
function cleanExtractedValue(value: string, field: string): string {
  let cleaned = value.trim()

  // Common prefixes to strip (case-insensitive)
  const prefixesToRemove = [
    // Address prefixes
    /^the address is\s+/i,
    /^address is\s+/i,
    /^actually the address is\s+/i,
    /^my address is\s+/i,
    /^actually my address is\s+/i,
    /^the location is\s+/i,
    /^location is\s+/i,
    /^actually the location is\s+/i,
    /^my location is\s+/i,
    /^actually my location is\s+/i,
    /^my service address is\s+/i,
    /^service address is\s+/i,

    // Project details/yard prefixes
    /^the yard is\s+/i,
    /^yard is\s+/i,
    /^actually the yard is\s+/i,
    /^yard is actually\s+/i,
    /^the lot is\s+/i,
    /^lot is\s+/i,
    /^actually the lot is\s+/i,
    /^the property is\s+/i,
    /^property is\s+/i,
    /^actually the property is\s+/i,
    /^the project is\s+/i,
    /^project is\s+/i,
    /^actually the project is\s+/i,
    /^oh and the yard is\s+/i,
    /^oh and the lot is\s+/i,
    /^oh and the property is\s+/i,
    /^oh and\s+/i,
    /^and the yard is\s+/i,
    /^and the lot is\s+/i,
    /^and the property is\s+/i,
    /^and\s+/i,

    // Callback number prefixes
    /^my number is\s+/i,
    /^my callback number is\s+/i,
    /^callback number is\s+/i,
    /^my phone number is\s+/i,
    /^call me at\s+/i,
    /^use\s+/i,

    // Callback time prefixes
    /^call me\s+/i,
    /^call after\s+/i,
    /^available after\s+/i,
    /^best time is\s+/i,
    /^callback time is\s+/i,

    // Name prefixes
    /^my name is\s+/i,
    /^actually my name is\s+/i,
    /^this is\s+/i,
    /^i am\s+/i,
    /^call me\s+/i,
    /^name is\s+/i,

    // Reason prefixes
    /^the reason is\s+/i,
    /^reason is\s+/i,
    /^actually the reason is\s+/i,

    // General cleanup
    /^actually\s+/i,
    /^it is actually\s+/i,
    /^the details are\s+/i,
    /^the project is actually\s+/i,
    /^the issue is actually\s+/i,
    /^actually i need\s+/i,
    /^actually i want\s+/i,
    /^i meant\s+/i,
    /^sorry, i meant\s+/i,
    /^oh sorry i want\s+/i
  ]

  // Apply each prefix removal
  for (const prefix of prefixesToRemove) {
    cleaned = cleaned.replace(prefix, '')
  }

  // Additional cleanup for "of an" -> "of" or remove entirely
  cleaned = cleaned.replace(/\s+of an\s+/g, ' of ')
  cleaned = cleaned.replace(/\s+of the\s+/g, ' of ')

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  // Capitalize first letter
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
  }

  return cleaned
}

/**
 * Detect if an inbound SMS contains a correction to AI intake data
 * RC1: Simple pattern matching (no OpenAI)
 */
export async function detectCorrection(
  customerReply: string,
  extractedInfo: ExtractedInfo
): Promise<CorrectionDetectionResult> {
  console.log('[CORRECTION DETECTION START]', {
    customerReply,
    extractedInfo
  })

  const normalizedExtractedInfo = normalizeExtractedInfo(extractedInfo)
  const reply = customerReply.toLowerCase().trim()

  // Simple pattern matching for corrections
  const patterns = [
    {
      field: 'callerName',
      patterns: [
        /my name is\s+(.+)/i,
        /actually my name is\s+(.+)/i,
        /this is\s+(.+)/i,
        /i am\s+(.+)/i,
        /call me\s+(.+)/i,
        /name is\s+(.+)/i
      ]
    },
    {
      field: 'importantDetails',
      patterns: [
        /actually i need\s+(.+)/i,
        /actually i want\s+(.+)/i,
        /i meant\s+(.+)/i,
        /sorry, i meant\s+(.+)/i,
        /oh sorry i want\s+(.+)/i,
        /not\s+(.+),\s*(.+)?/i,
        /not\s+(.+), but\s+(.+)/i,
        /(.+), not\s+(.+)/i,
        /it is actually\s+(.+)/i,
        /the details are\s+(.+)/i,
        /the reason is\s+(.+)/i,
        /the project is actually\s+(.+)/i,
        /the issue is actually\s+(.+)/i,
        /oh and the yard is\s+(.+)/i,
        /oh and the lot is\s+(.+)/i,
        /oh and the property is\s+(.+)/i,
        /yard is\s+(.+)/i,
        /lot is\s+(.+)/i,
        /property is\s+(.+)/i,
        /oh and (.+)/i,
        /the yard is\s+(.+)/i,
        /yard is actually\s+(.+)/i,
        /project is\s+(.+)/i
      ]
    },
    {
      field: 'addressOrLocation',
      patterns: [
        /actually my address is\s+(.+)/i,
        /my address is actually\s+(.+)/i,
        /the address is\s+(.+)/i,
        /address is\s+(.+)/i,
        /actually my location is\s+(.+)/i,
        /my location is actually\s+(.+)/i,
        /the location is\s+(.+)/i,
        /location is\s+(.+)/i,
        /my service address is\s+(.+)/i,
        /service address is\s+(.+)/i
      ]
    },
    {
      field: 'callbackNumber',
      patterns: [
        /my callback number is\s+(.+)/i,
        /call me at\s+(.+)/i,
        /my number is\s+(.+)/i,
        /callback number is\s+(.+)/i,
        /my phone number is\s+(.+)/i
      ]
    },
    {
      field: 'preferredCallbackTime',
      patterns: [
        /best time is\s+(.+)/i,
        /callback time is\s+(.+)/i,
        /call me tomorrow morning/i,
        /call me tomorrow afternoon/i,
        /call me tomorrow evening/i,
        /call me in the morning/i,
        /call me in the afternoon/i,
        /call me in the evening/i
      ]
    },
    {
      field: 'urgencyLevel',
      patterns: [
        /it is urgent/i,
        /this is urgent/i,
        /not urgent/i,
        /actually it is not urgent/i
      ]
    }
  ]

  for (const { field, patterns: fieldPatterns } of patterns) {
    for (const pattern of fieldPatterns) {
      const match = reply.match(pattern)
      if (match) {
        const oldValue = (normalizedExtractedInfo as any)[field]
        let newValue = match[1] || match[0]

        // Handle importantDetails special cases for 'not X, Y' patterns
        if (field === 'importantDetails') {
          // For "not X, Y" patterns, use the second match group (Y) as the new value
          if (match[2]) {
            newValue = match[2].trim()
          }
          // For "X, not Y" patterns, use the second match group (Y) as the new value
          if (pattern.toString().includes(', not')) {
            newValue = match[2]?.trim() || match[1]?.trim()
          }
        }

        // Handle urgency special case
        if (field === 'urgencyLevel') {
          if (reply.includes('urgent')) {
            newValue = 'urgent'
          } else if (reply.includes('not urgent')) {
            newValue = 'low'
          }
        }

        // Clean the extracted value by removing common prefixes
        const originalNewValue = newValue
        newValue = cleanExtractedValue(newValue, field)

        console.log('[CORRECTION VALUE EXTRACTION]', {
          field,
          originalMessage: customerReply,
          extractedValue: originalNewValue,
          cleanedValue: newValue,
          pattern: pattern.toString()
        })

        console.log('[CORRECTION DETECTED]', {
          field,
          oldValue,
          newValue,
          pattern: pattern.toString()
        })

        return {
          isCorrection: true,
          fieldChanged: field,
          oldValue,
          newValue,
          confidence: 0.9,
          requiresReview: false,
          reason: `Pattern match detected: ${pattern.toString()}`
        }
      }
    }
  }

  console.log('[CORRECTION NOT DETECTED]', {
    reason: 'No pattern matched'
  })

  return {
    isCorrection: false,
    confidence: 0,
    requiresReview: false,
    reason: 'No correction pattern detected'
  }
}

/**
 * Update extracted_info with the corrected field using canonical keys
 */
export function applyCorrection(
  extractedInfo: ExtractedInfo,
  fieldChanged: string,
  newValue: string
): ExtractedInfo {
  // Normalize input to canonical keys first
  const normalized = normalizeExtractedInfo(extractedInfo)
  const updated = { ...normalized }

  // Map field names to canonical extracted_info keys
  const fieldMapping: Record<string, keyof ExtractedInfo> = {
    'name': 'callerName',
    'callerName': 'callerName',
    'caller name': 'callerName',
    'caller_name': 'callerName',
    'reason': 'reasonForCalling',
    'reasonForCalling': 'reasonForCalling',
    'reason for calling': 'reasonForCalling',
    'reason_for_call': 'reasonForCalling',
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
    'callback time': 'preferredCallbackTime',
    'preferredCallbackTime': 'preferredCallbackTime',
    'preferred callback time': 'preferredCallbackTime',
    'callbackTime': 'preferredCallbackTime',
    'callback_time': 'preferredCallbackTime',
    'callback number': 'callbackNumber',
    'callbackNumber': 'callbackNumber',
    'callback_number': 'callbackNumber'
  }

  const mappedField = fieldMapping[fieldChanged.toLowerCase()] || fieldChanged as keyof ExtractedInfo

  // Fallback: if trying to update importantDetails but it doesn't exist, update reasonForCalling instead
  let finalField = mappedField
  if (mappedField === 'importantDetails' && !updated.importantDetails && updated.reasonForCalling) {
    finalField = 'reasonForCalling'
    console.log('[CORRECTION FIELD FALLBACK]', {
      originalField: 'importantDetails',
      fallbackField: 'reasonForCalling',
      reason: 'importantDetails not found, using reasonForCalling',
      hasImportantDetails: !!updated.importantDetails,
      hasReasonForCalling: !!updated.reasonForCalling
    })
  }

  console.log('[CORRECTION FIELD UPDATE]', {
    fieldChanged,
    mappedField,
    finalField,
    newValue,
    fieldExistsInUpdated: finalField in updated,
    originalImportantDetails: updated.importantDetails,
    originalReasonForCalling: updated.reasonForCalling
  })

  if (finalField in updated) {
    (updated as any)[finalField] = newValue
    console.log('[CORRECTION FIELD UPDATED]', {
      finalField,
      newValue,
      updatedValue: (updated as any)[finalField]
    })
  } else {
    console.error('[CORRECTION FIELD UPDATE ERROR]', {
      finalField,
      availableFields: Object.keys(updated)
    })
  }

  // Canonicalize to ensure only canonical keys are returned
  const canonicalized = canonicalizeExtractedInfo(updated)
  console.log('[CORRECTION CANONICALIZED]', {
    before: updated,
    after: canonicalized
  })
  return canonicalized
}

/**
 * Generate correction audit note
 */
export function generateCorrectionNote(
  fieldChanged: string,
  oldValue: string,
  newValue: string,
  confidence: number
): string {
  return `[AI CORRECTION APPLIED] ${fieldChanged} changed from "${oldValue}" to "${newValue}" (confidence: ${confidence.toFixed(2)})`
}
