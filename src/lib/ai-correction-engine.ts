/**
 * AI Intake Correction Engine
 * 
 * Detects and applies customer corrections to AI intake data
 * Now includes AI-powered semantic analysis layer for intelligent correction detection
 */

import { normalizeExtractedInfo, canonicalizeExtractedInfo } from './ai-field-mapping'
import { analyzeSemanticCorrection, SemanticCorrectionResult } from './ai-semantic-correction'

export interface CorrectionDetectionResult {
  isCorrection: boolean
  fieldChanged?: string
  oldValue?: string
  newValue?: string
  confidence: number
  requiresReview: boolean
  reason?: string
  corrections?: Array<{
    field: string
    oldValue: string
    newValue: string
  }>
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
 * Detect if a message is a conversational reply (not a correction)
 * These should be ignored and not trigger acknowledgements
 */
function isConversationalReply(message: string): boolean {
  const reply = message.toLowerCase().trim()
  
  const conversationalPatterns = [
    // Positive acknowledgements
    /^(thanks|thank you|thx|ty|appreciate it|appreciated)\.?$/i,
    /^(perfect|great|awesome|excellent|wonderful|fantastic)\.?$/i,
    /^(sounds good|sounds great|that sounds good)\.?$/i,
    /^(got it|gotcha|understood|understand)\.?$/i,
    /^(ok|okay|okey|okie)\.?$/i,
    /^(sure|no problem|no worries|no problemo)\.?$/i,
    /^(cool|nice|sweet)\.?$/i,
    /^(done|finished|complete)\.?$/i,
    /^(yes|yeah|yep|yup|yay)\.?$/i,
    /^(no|nope|nah)\.?$/i,
    
    // Emoji-only responses
    /^(👍|👌|✅|🆗|✨|💯|🙌|👏|😊|😄|🙂)$/i,
    
    // Very short responses
    /^(ok|yes|no|sure|fine|good|great|thanks|bye|hi|hello)\.?$/i,
    
    // Conversational fillers
    /^(oh i see|i see|i understand|gotcha|alright|right)\.?$/i,
  ]
  
  return conversationalPatterns.some(pattern => pattern.test(reply))
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

    // Business-agnostic details prefixes
    /^the details are\s+/i,
    /^actually the details are\s+/i,
    /^the request is\s+/i,
    /^request is\s+/i,
    /^actually the request is\s+/i,
    /^my request is\s+/i,
    /^actually my request is\s+/i,
    /^the service is for\s+/i,
    /^service is for\s+/i,
    /^actually the service is for\s+/i,
    /^the appointment is for\s+/i,
    /^appointment is for\s+/i,
    /^actually the appointment is for\s+/i,
    /^the session is for\s+/i,
    /^session is for\s+/i,
    /^actually the session is for\s+/i,
    /^the lesson is for\s+/i,
    /^lesson is for\s+/i,
    /^actually the lesson is for\s+/i,
    /^the consultation is for\s+/i,
    /^consultation is for\s+/i,
    /^actually the consultation is for\s+/i,
    /^the visit is for\s+/i,
    /^visit is for\s+/i,
    /^actually the visit is for\s+/i,

    // Specific entity/recipient patterns
    /^it's for\s+/i,
    /^its for\s+/i,
    /^actually it's for\s+/i,
    /^actually its for\s+/i,
    /^this is for\s+/i,
    /^actually this is for\s+/i,
    /^it's really for\s+/i,
    /^its really for\s+/i,
    /^it's actually for\s+/i,
    /^its actually for\s+/i,
    /^for\s+/i,

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
    /^please call after\s+/i,
    /^call me after\s+/i,

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
 * Detect if an inbound SMS contains corrections to AI intake data
 * Now includes AI-powered semantic analysis layer for intelligent correction detection
 * Falls back to regex pattern matching for backward compatibility
 */
export async function detectCorrection(
  customerReply: string,
  extractedInfo: ExtractedInfo,
  conversationContext?: string
): Promise<CorrectionDetectionResult> {
  console.log('[CORRECTION DETECTION START]', {
    customerReply,
    extractedInfo,
    conversationContext
  })

  // First, try AI-powered semantic analysis
  console.log('[SEMANTIC ANALYSIS] Starting AI-powered analysis')
  const semanticResult = await analyzeSemanticCorrection(customerReply, extractedInfo, conversationContext)
  
  console.log('[SEMANTIC ANALYSIS RESULT]', {
    shouldUpdate: semanticResult.shouldUpdate,
    updates: semanticResult.updates,
    reason: semanticResult.reason,
    confidence: semanticResult.confidence,
    isConversational: semanticResult.isConversational
  })

  // If AI detected conversational reply, return early (no correction needed)
  if (semanticResult.isConversational) {
    console.log('[CONVERSATIONAL REPLY DETECTED BY AI]', {
      message: customerReply,
      reason: semanticResult.reason
    })
    return {
      isCorrection: false,
      confidence: semanticResult.confidence,
      requiresReview: false,
      reason: semanticResult.reason
    }
  }

  // If AI detected updates with high confidence, use them
  if (semanticResult.shouldUpdate && semanticResult.confidence >= 0.7) {
    console.log('[SEMANTIC CORRECTION APPLIED]', {
      updates: semanticResult.updates,
      reason: semanticResult.reason,
      confidence: semanticResult.confidence
    })

    // Convert semantic updates to correction format
    const corrections = semanticResult.updates.map(update => ({
      field: update.field,
      oldValue: update.oldValue || (extractedInfo as any)[update.field] || '',
      newValue: update.value
    }))

    return {
      isCorrection: true,
      fieldChanged: corrections[0]?.field,
      oldValue: corrections[0]?.oldValue,
      newValue: corrections[0]?.newValue,
      confidence: semanticResult.confidence,
      requiresReview: semanticResult.confidence < 0.85,
      reason: semanticResult.reason,
      corrections
    }
  }

  // If AI didn't detect updates or confidence is low, fall back to regex pattern matching
  console.log('[FALLBACK TO REGEX PATTERN MATCHING]', {
    reason: semanticResult.shouldUpdate 
      ? `AI confidence too low (${semanticResult.confidence}), falling back to regex`
      : 'AI did not detect updates, falling back to regex'
  })

  return await detectCorrectionWithRegex(customerReply, extractedInfo)
}

/**
 * Detect if an inbound SMS contains corrections using regex pattern matching
 * This is the fallback method when AI semantic analysis is not available or has low confidence
 */
async function detectCorrectionWithRegex(
  customerReply: string,
  extractedInfo: ExtractedInfo
): Promise<CorrectionDetectionResult> {
  console.log('[REGEX CORRECTION DETECTION START]', {
    customerReply,
    extractedInfo
  })

  const normalizedExtractedInfo = normalizeExtractedInfo(extractedInfo)
  const reply = customerReply.toLowerCase().trim()

  // Simple pattern matching for corrections - business-agnostic
  // Order matters: more specific patterns should come first
  const patterns = [
    {
      field: 'preferredCallbackTime',
      patterns: [
        // Callback time patterns - must come before name patterns to avoid misclassification
        /you can call me back at?\s+(.+)/i,
        /call me back at?\s+(.+)/i,
        /call me back anytime/i,
        /anytime is fine/i,
        /whenever is fine/i,
        /anytime works/i,
        /whenever works/i,
        /call me after\s+(\d+[ap]m)/i,
        /call me after\s+(\d+:\d+\s*[ap]m)/i,
        /call me after\s+(.+)/i,
        /please call after\s+(.+)/i,
        /call me tomorrow morning/i,
        /call me tomorrow afternoon/i,
        /call me tomorrow evening/i,
        /call me in the morning/i,
        /call me in the afternoon/i,
        /call me in the evening/i,
        /call me tomorrow/i,
        /call me this morning/i,
        /call me this afternoon/i,
        /call me this evening/i,
        /available after\s+(.+)/i,
        /after\s+(\d+[ap]m)/i,
        /after\s+(\d+:\d+\s*[ap]m)/i,
        /best time is\s+(.+)/i,
        /callback time is\s+(.+)/i,
        /preferred callback time is\s+(.+)/i
      ]
    },
    {
      field: 'callerName',
      patterns: [
        // Stricter name patterns - must avoid matching callback instructions
        /no, my name is\s+(.+)/i,
        /no my name is\s+(.+)/i,
        /actually my name is\s+(.+)/i,
        /my name is\s+(.+)/i,
        /this is\s+(.+)/i,
        /i am\s+(.+)/i,
        /i'm\s+(.+)/i,
        /name is\s+(.+)/i,
        /the name is\s+(.+)/i,
        /actually it's\s+(.+)/i,
        /actually its\s+(.+)/i
      ]
    },
    {
      field: 'importantDetails',
      patterns: [
        // Business-agnostic entity/recipient patterns
        /it's for\s+(.+)/i,
        /its for\s+(.+)/i,
        /actually it's for\s+(.+)/i,
        /actually its for\s+(.+)/i,
        /this is for\s+(.+)/i,
        /actually this is for\s+(.+)/i,
        /it's really for\s+(.+)/i,
        /its really for\s+(.+)/i,
        /it's actually for\s+(.+)/i,
        /its actually for\s+(.+)/i,
        /for\s+(.+)/i,
        
        // Service/appointment/session specific patterns
        /the service is for\s+(.+)/i,
        /service is for\s+(.+)/i,
        /the appointment is for\s+(.+)/i,
        /appointment is for\s+(.+)/i,
        /the session is for\s+(.+)/i,
        /session is for\s+(.+)/i,
        /the lesson is for\s+(.+)/i,
        /lesson is for\s+(.+)/i,
        /the consultation is for\s+(.+)/i,
        /consultation is for\s+(.+)/i,
        /the visit is for\s+(.+)/i,
        /visit is for\s+(.+)/i,
        
        // General clarification patterns
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
        /the request is\s+(.+)/i,
        /i need help with\s+(.+)/i,
        /i need\s+(.+)/i,
        /i want\s+(.+)/i,
        /looking for help with\s+(.+)/i,
        /need help with\s+(.+)/i,
        
        // Specific location/unit patterns
        /the (.+?) unit/i,
        /(.+?) unit/i,
        /the (.+?) floor/i,
        /(.+?) floor/i,
        /the (.+?) room/i,
        /(.+?) room/i,
        /the (.+?) office/i,
        /(.+?) office/i,
        /the (.+?) suite/i,
        /(.+?) suite/i,
        
        // Skill/level patterns (for lessons/tutors)
        /i only need\s+(.+)/i,
        /i need\s+(.+)lessons/i,
        /(.+?) lessons/i,
        /(.+?) level/i,
        /beginner/i,
        /intermediate/i,
        /advanced/i
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
        /service address is\s+(.+)/i,
        /at\s+(.+)instead/i,
        /actually at\s+(.+)/i,
        /it's at\s+(.+)/i,
        /its at\s+(.+)/i,
        // Home/residence references
        /at my house/i,
        /come to my house/i,
        /at my home/i,
        /come to my home/i,
        /my place/i,
        /at my place/i,
        /my residence/i,
        /at my residence/i,
        /my home/i,
        /at home/i,
        /come to my place/i,
        /lessons are at my house/i,
        /lessons are at my home/i,
        // Unit/specific location patterns
        /the (.+?) unit/i,
        /(.+?) unit/i,
        /the (.+?) floor/i,
        /(.+?) floor/i
      ]
    },
    {
      field: 'callbackNumber',
      patterns: [
        /my callback number is\s+(.+)/i,
        /call me at\s+(.+)/i,
        /my number is\s+(.+)/i,
        /callback number is\s+(.+)/i,
        /my phone number is\s+(.+)/i,
        /use\s+(.+)/i
      ]
    },
    {
      field: 'preferredCallbackTime',
      patterns: [
        /best time is\s+(.+)/i,
        /callback time is\s+(.+)/i,
        /please call after\s+(.+)/i,
        /call me after\s+(.+)/i,
        /call me tomorrow morning/i,
        /call me tomorrow afternoon/i,
        /call me tomorrow evening/i,
        /call me in the morning/i,
        /call me in the afternoon/i,
        /call me in the evening/i,
        /available after\s+(.+)/i,
        /after\s+(\d+[ap]m)/i,
        /after\s+(\d+:\d+\s*[ap]m)/i
      ]
    },
    {
      field: 'urgencyLevel',
      patterns: [
        // Urgent patterns
        /it actually is urgent/i,
        /actually this is urgent/i,
        /actually it's urgent/i,
        /this is urgent/i,
        /it's urgent/i,
        /this became urgent/i,
        /i'd classify it as urgent/i,
        /need someone ASAP/i,
        /can someone come today/i,
        /this can't wait/i,
        /it is urgent/i,
        /urgent/i,
        /as soon as possible/i,
        /ASAP/i,
        /right now/i,
        /immediately/i,
        /emergency/i,
        /need help now/i,
        /need someone now/i,

        // Not urgent patterns
        /it's not urgent/i,
        /it is not urgent/i,
        /never mind, not urgent/i,
        /nevermind not urgent/i,
        /flexible timing/i,
        /no rush/i,
        /no rush anymore/i,
        /whenever you can/i,
        /this can wait/i,
        /take your time/i,
        /no hurry/i,
        /not urgent/i,
        /whenever/i
      ]
    }
  ]

  // Detect all corrections in the message
  const detectedCorrections: Array<{
    field: string
    oldValue: string
    newValue: string
  }> = []

  // Track which parts of the message have been matched to avoid overlapping matches
  const matchedRanges: Array<{ start: number; end: number }> = []

  for (const { field, patterns: fieldPatterns } of patterns) {
    for (const pattern of fieldPatterns) {
      const match = reply.match(pattern)
      if (match) {
        const matchStart = match.index || 0
        const matchEnd = matchStart + match[0].length

        // Check if this match overlaps with a previously matched range
        const overlaps = matchedRanges.some(range =>
          (matchStart >= range.start && matchStart < range.end) ||
          (matchEnd > range.start && matchEnd <= range.end) ||
          (matchStart <= range.start && matchEnd >= range.end)
        )

        if (overlaps) {
          console.log('[CORRECTION SKIP OVERLAP]', {
            field,
            pattern: pattern.toString(),
            match: match[0],
            reason: 'Overlaps with previous match'
          })
          continue
        }

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
          if (reply.includes('urgent') && !reply.includes('not urgent')) {
            newValue = 'Urgent'
          } else if (reply.includes('not urgent') ||
                     reply.includes('never mind') ||
                     reply.includes('flexible') ||
                     reply.includes('no rush') ||
                     reply.includes('whenever') ||
                     reply.includes('can wait') ||
                     reply.includes('take your time') ||
                     reply.includes('no hurry')) {
            newValue = 'Not urgent'
          }
        }

        // Handle location special case - only update if current value is a placeholder
        if (field === 'addressOrLocation') {
          const isHomeRef = /at my house|come to my house|at my home|come to my home|my place|at my place|my residence|at my residence|my home|at home|come to my place|lessons are at my house|lessons are at my home/i.test(match[0])
          if (isHomeRef && oldValue && !isPlaceholderValue(oldValue)) {
            console.log('[LOCATION CORRECTION SKIPPED]', {
              field,
              pattern: pattern.toString(),
              match: match[0],
              oldValue,
              reason: 'Current location is not a placeholder, not updating',
              isPlaceholder: false
            })
            continue
          }
          if (isHomeRef) {
            newValue = 'Home'
            console.log('[LOCATION CORRECTION APPLIED]', {
              field,
              pattern: pattern.toString(),
              match: match[0],
              oldValue,
              newValue,
              reason: 'Home reference detected and current value is placeholder, updating to Home',
              isPlaceholder: oldValue ? isPlaceholderValue(oldValue) : 'no value'
            })
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
          pattern: pattern.toString(),
          classifierReasoning: field === 'addressOrLocation' && /at my house|come to my house|at my home/i.test(match[0])
            ? 'Home reference pattern matched'
            : 'Pattern match detected'
        })

        console.log('[CORRECTION DETECTED]', {
          field,
          oldValue,
          newValue,
          pattern: pattern.toString(),
          classifierReasoning: field === 'addressOrLocation' 
            ? (oldValue && !isPlaceholderValue(oldValue) ? 'Skipped - current value is not placeholder' : 'Updated - home reference detected')
            : 'Pattern match'
        })

        detectedCorrections.push({
          field,
          oldValue,
          newValue
        })

        // Mark this range as matched
        matchedRanges.push({ start: matchStart, end: matchEnd })
      }
    }
  }

  if (detectedCorrections.length > 0) {
    console.log('[MULTI-FIELD CORRECTION]', {
      totalCorrections: detectedCorrections.length,
      updatedFields: detectedCorrections.map(c => c.field)
    })

    // Return the first correction for backward compatibility, but include all corrections
    const firstCorrection = detectedCorrections[0]
    return {
      isCorrection: true,
      fieldChanged: firstCorrection.field,
      oldValue: firstCorrection.oldValue,
      newValue: firstCorrection.newValue,
      confidence: 0.9,
      requiresReview: false,
      reason: `Pattern match detected: ${detectedCorrections.length} correction(s)`,
      corrections: detectedCorrections
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
 * Now supports intelligent Details field replacement/expansion
 */
export function applyCorrection(
  extractedInfo: ExtractedInfo,
  fieldChanged: string,
  newValue: string,
  action?: 'correction' | 'addition' | 'clarification'
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
    action,
    fieldExistsInUpdated: finalField in updated,
    originalImportantDetails: updated.importantDetails,
    originalReasonForCalling: updated.reasonForCalling
  })

  if (finalField in updated) {
    // Intelligent Details field handling
    if (finalField === 'importantDetails' && action && updated.importantDetails) {
      // Inline merge logic to avoid import issues
      let mergedValue: string
      if (action === 'correction') {
        mergedValue = newValue
      } else if (action === 'addition') {
        mergedValue = `${updated.importantDetails}. ${newValue}`
      } else if (action === 'clarification') {
        mergedValue = `${updated.importantDetails} (${newValue})`
      } else {
        mergedValue = newValue
      }
      (updated as any)[finalField] = mergedValue
      console.log('[CORRECTION DETAILS MERGED]', {
        finalField,
        originalValue: updated.importantDetails,
        newValue,
        action,
        mergedValue
      })
    } else {
      (updated as any)[finalField] = newValue
      console.log('[CORRECTION FIELD UPDATED]', {
        finalField,
        newValue,
        updatedValue: (updated as any)[finalField]
      })
    }
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
 * Generate field-specific acknowledgement message
 */
export function generateFieldAcknowledgement(
  field: string,
  newValue: string
): string {
  const fieldLower = field.toLowerCase()
  
  // Map field names to human-readable names and acknowledgement templates
  const fieldTemplates: Record<string, { name: string; template: (value: string) => string }> = {
    'callername': {
      name: 'name',
      template: (value) => `Thanks! We've updated your name to '${value}'.`
    },
    'addressorlocation': {
      name: 'address',
      template: (value) => `Thanks! We've updated your address to '${value}'.`
    },
    'callbacknumber': {
      name: 'callback number',
      template: (value) => `Thanks! We've updated your callback number.`
    },
    'preferredcallbacktime': {
      name: 'preferred callback time',
      template: (value) => `Thanks! We've updated your preferred callback time.`
    },
    'urgencylevel': {
      name: 'urgency',
      template: (value) => `Thanks! We've updated your urgency to '${value}'.`
    },
    'importantdetails': {
      name: 'project details',
      template: (value) => `Thanks! We've updated the project details.`
    },
    'reasonforcalling': {
      name: 'reason',
      template: (value) => `Thanks! We've updated the reason.`
    }
  }

  // Find matching field template
  for (const [key, config] of Object.entries(fieldTemplates)) {
    if (fieldLower.includes(key)) {
      return config.template(newValue)
    }
  }

  // Fallback to generic acknowledgement
  return `Thanks! We've updated your ${field.replace(/([A-Z])/g, ' $1').toLowerCase().trim()}.`
}

/**
 * Generate multi-field acknowledgement message
 */
export function generateMultiFieldAcknowledgement(
  corrections: Array<{ field: string; newValue: string }>
): string {
  if (corrections.length === 0) {
    return 'Thanks for your update!'
  }

  if (corrections.length === 1) {
    return generateFieldAcknowledgement(corrections[0].field, corrections[0].newValue)
  }

  // Generate acknowledgements for each field
  const acknowledgements = corrections.map(c => {
    const fieldLower = c.field.toLowerCase()
    
    // Map field names to human-readable phrases
    const fieldPhrases: Record<string, string> = {
      'callername': 'name',
      'addressorlocation': 'address',
      'callbacknumber': 'callback number',
      'preferredcallbacktime': 'preferred callback time',
      'urgencylevel': 'urgency',
      'importantdetails': 'project details',
      'reasonforcalling': 'reason'
    }

    for (const [key, phrase] of Object.entries(fieldPhrases)) {
      if (fieldLower.includes(key)) {
        return phrase
      }
    }
    
    return c.field.replace(/([A-Z])/g, ' $1').toLowerCase().trim()
  })

  // Natural language combination
  if (acknowledgements.length === 2) {
    return `Thanks! We've updated your ${acknowledgements[0]} and ${acknowledgements[1]}.`
  } else {
    const last = acknowledgements.pop()
    const others = acknowledgements.join(', ')
    return `Thanks! We've updated your ${others}, and ${last}.`
  }
}

/**
 * Check if a value is a placeholder/generic value
 */
function isPlaceholderValue(value: string): boolean {
  if (!value) return false
  
  const placeholders = [
    'business location',
    'location',
    'address',
    'service address',
    'your address',
    'your location',
    'tbd',
    'to be determined',
    'unknown',
    'not specified'
  ]
  
  return placeholders.some(placeholder => 
    value.toLowerCase().trim() === placeholder.toLowerCase()
  )
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
