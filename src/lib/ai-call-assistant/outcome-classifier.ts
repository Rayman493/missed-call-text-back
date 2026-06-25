/**
 * AI Call Outcome Classifier
 * 
 * Determines the actual outcome of an AI call based on objective signals
 * such as fields captured, speech detection, and transcription content.
 */

export type AiCallOutcome = 
  | 'completed_intake'
  | 'partial_intake'
  | 'early_hangup'
  | 'no_speech'
  | 'ai_connection_failed'

export interface OutcomeClassificationInput {
  extractedInfo?: {
    callerName?: string
    reasonForCalling?: string
    importantDetails?: string
    urgencyLevel?: string
    addressOrLocation?: string
    preferredCallbackTime?: string
    callbackNumber?: string
  } | null
  transcript?: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }> | null
  hadUserSpeech?: boolean | null
  confirmationCompleted?: boolean | null
  fieldsCollectedCount?: number | null
  sessionError?: string | null
}

export interface OutcomeClassificationResult {
  outcome: AiCallOutcome
  reason: string
  fieldsCollected: number
  hadUserSpeech: boolean
}

const PLACEHOLDER_VALUES = [
  'not provided',
  'not specified',
  'unknown',
  'tbd',
  'to be determined',
  'business location',
  'location',
  'address',
  'your address',
  'your location'
]

/**
 * Check if a value is a placeholder/generic value
 */
function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true
  return PLACEHOLDER_VALUES.some(placeholder => 
    value.toLowerCase().trim() === placeholder.toLowerCase()
  )
}

/**
 * Count the number of meaningful (non-placeholder) fields captured
 */
function countMeaningfulFields(extractedInfo: any): number {
  if (!extractedInfo) return 0
  
  const fields = [
    extractedInfo.callerName,
    extractedInfo.reasonForCalling,
    extractedInfo.importantDetails,
    extractedInfo.urgencyLevel,
    extractedInfo.addressOrLocation,
    extractedInfo.preferredCallbackTime,
    extractedInfo.callbackNumber
  ]
  
  return fields.filter(field => field && !isPlaceholderValue(field)).length
}

/**
 * Check if transcript contains meaningful user speech
 */
function hasMeaningfulUserSpeech(transcript: Array<{ role: string; text: string }> | null | undefined): boolean {
  if (!transcript || transcript.length === 0) return false
  
  const userMessages = transcript.filter(entry => entry.role === 'user')
  if (userMessages.length === 0) return false
  
  // Check if user said anything meaningful (not just silence or very short utterances)
  const meaningfulMessages = userMessages.filter(entry => {
    const text = entry.text.trim()
    // Ignore very short messages (< 3 characters) or silence indicators
    return text.length >= 3 && 
           text !== '[silence]' && 
           text !== '[noise]' &&
           text !== '[pause]'
  })
  
  return meaningfulMessages.length > 0
}

/**
 * Classify the AI call outcome based on objective signals
 */
export function classifyOutcome(input: OutcomeClassificationInput): OutcomeClassificationResult {
  const {
    extractedInfo,
    transcript,
    hadUserSpeech,
    confirmationCompleted,
    fieldsCollectedCount,
    sessionError
  } = input

  // Check for AI connection failure
  if (sessionError) {
    return {
      outcome: 'ai_connection_failed',
      reason: `AI service failed: ${sessionError}`,
      fieldsCollected: countMeaningfulFields(extractedInfo),
      hadUserSpeech: hadUserSpeech || hasMeaningfulUserSpeech(transcript)
    }
  }

  // Count meaningful fields
  const meaningfulFields = countMeaningfulFields(extractedInfo)
  const userSpoke = hadUserSpeech !== undefined ? hadUserSpeech : hasMeaningfulUserSpeech(transcript)

  // No speech detected - no meaningful information captured
  if (!userSpoke) {
    return {
      outcome: 'no_speech',
      reason: 'No meaningful speech detected during the call',
      fieldsCollected: meaningfulFields,
      hadUserSpeech: false
    }
  }

  // Early hangup - user spoke but no meaningful information captured
  if (userSpoke && meaningfulFields === 0) {
    return {
      outcome: 'early_hangup',
      reason: 'Caller disconnected before providing meaningful information',
      fieldsCollected: 0,
      hadUserSpeech: true
    }
  }

  // Completed intake - requires BOTH meaningful information AND conversation completion
  // The AI must have reached its designed end state (confirmation completed or explicitly marked successful)
  const requiredFields = ['callerName', 'reasonForCalling']
  const hasRequiredFields = requiredFields.every(field => {
    const value = extractedInfo?.[field as keyof typeof extractedInfo]
    return value && !isPlaceholderValue(value)
  })

  // Only classify as completed if:
  // 1. Confirmation was explicitly completed OR session was marked successful
  // 2. Required fields were captured
  // 3. Sufficient meaningful information was captured
  if (confirmationCompleted && hasRequiredFields && meaningfulFields >= 3) {
    return {
      outcome: 'completed_intake',
      reason: 'AI intake completed successfully with confirmation',
      fieldsCollected: meaningfulFields,
      hadUserSpeech: true
    }
  }

  // Partial intake - some fields captured but conversation did not complete naturally
  // This includes cases where caller disconnected before AI reached its end state
  if (meaningfulFields > 0) {
    return {
      outcome: 'partial_intake',
      reason: `Partial intake captured: ${meaningfulFields} meaningful field(s). Conversation did not complete naturally.`,
      fieldsCollected: meaningfulFields,
      hadUserSpeech: true
    }
  }

  // Fallback to early hangup if we reach here with no fields
  return {
    outcome: 'early_hangup',
    reason: 'Caller disconnected before providing meaningful information',
    fieldsCollected: 0,
    hadUserSpeech: true
  }
}

/**
 * Get display label for outcome
 */
export function getOutcomeLabel(outcome: AiCallOutcome): string {
  switch (outcome) {
    case 'completed_intake':
      return 'AI Intake Complete'
    case 'partial_intake':
      return 'Partial Intake'
    case 'early_hangup':
      return 'Caller Hung Up Early'
    case 'no_speech':
      return 'No Speech Detected'
    case 'ai_connection_failed':
      return 'AI Connection Failed'
    default:
      return 'Unknown'
  }
}

/**
 * Get color class for outcome badge
 */
export function getOutcomeColor(outcome: AiCallOutcome): string {
  switch (outcome) {
    case 'completed_intake':
      return 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
    case 'partial_intake':
      return 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
    case 'early_hangup':
      return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
    case 'no_speech':
      return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
    case 'ai_connection_failed':
      return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
    default:
      return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
  }
}
