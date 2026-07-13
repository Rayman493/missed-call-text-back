/**
 * Canonical AI Call Record Intake Normalizer
 * 
 * Normalizes various field aliases from ai_call_record.extracted_info
 * into a consistent shape for display and editing.
 * 
 * This ensures the UI works correctly regardless of which field names
 * were used during AI extraction or manual correction.
 */

export interface NormalizedIntake {
  id: string
  callSid: string
  receivedAt: string
  outcome: string
  customerName: string | null
  serviceRequested: string | null
  additionalDetails: string | null
  serviceAddress: string | null
  desiredCompletion: string | null
  callbackTime: string | null
  transcript: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }> | null
}

/**
 * Normalizes a single AI call record's extracted_info into canonical field names
 */
export function normalizeAICallRecord(record: any): NormalizedIntake {
  const extracted = record.extracted_info || {}
  
  return {
    id: record.id,
    callSid: record.call_sid,
    receivedAt: record.created_at,
    outcome: record.outcome,
    customerName: extracted.callerName || extracted.customerName || extracted.name || null,
    serviceRequested: extracted.reasonForCalling || extracted.serviceRequested || extracted.service || extracted.reason || extracted.issueDescription || null,
    additionalDetails: extracted.importantDetails || extracted.additionalDetails || extracted.issueDescription || extracted.details || null,
    serviceAddress: extracted.addressOrLocation || extracted.serviceAddress || extracted.location || null,
    desiredCompletion: extracted.desiredCompletionTime || extracted.desiredCompletion || extracted.completionTime || null,
    callbackTime: extracted.preferredCallbackTime || extracted.callbackTime || extracted.bestCallbackTime || null,
    transcript: record.transcript || null,
  }
}

/**
 * Gets the display title for a history card using fallback order
 */
export function getHistoryCardTitle(record: NormalizedIntake): string {
  if (record.serviceRequested) {
    return record.serviceRequested
  }
  if (record.additionalDetails) {
    // Truncate details for card title
    return record.additionalDetails.length > 50 
      ? record.additionalDetails.substring(0, 50) + '...'
      : record.additionalDetails
  }
  return 'General inquiry'
}

/**
 * Gets the outcome badge color class
 */
export function getOutcomeColor(outcome: string): string {
  switch (outcome) {
    case 'completed_intake':
    case 'completed':
      return 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
    case 'partial_intake':
      return 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-900/20'
    case 'caller_hung_up':
      return 'text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/20'
    case 'ai_failed':
    case 'voicemail_fallback':
      return 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20'
    default:
      return 'text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20'
  }
}

/**
 * Gets the intake badge label based on outcome and whether it's the latest record
 */
export function getIntakeBadgeLabel(record: NormalizedIntake, isLatest: boolean): string {
  if (isLatest) {
    return 'Current Request'
  }
  return 'Previous Request'
}
