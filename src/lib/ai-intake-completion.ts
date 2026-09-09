/**
 * AI Intake Completion Helper
 * 
 * This provides a canonical way to determine if AI intake is complete
 * based on the extracted information fields, regardless of the outcome field.
 * 
 * This ensures consistency across:
 * - SMS template decision
 * - AI Intake badge
 * - Lead Health AI Intake state
 * - ai_call_records outcome update
 */

import { normalizeCustomerName } from './ai-intake-formatter'

export interface ExtractedInfo {
  customerName?: string
  callerName?: string
  nameRefused?: boolean
  serviceRequested?: string
  reasonForCalling?: string
  issueDescription?: string
  importantDetails?: string
  serviceAddress?: string
  addressOrLocation?: string
  desiredCompletionTime?: string
  callbackTime?: string
  preferredCallbackTime?: string
  serviceLocationType?: string
  [key: string]: any
}

/**
 * Validate a name value for completion purposes.
 * Explicit refusals are handled separately; this checks that a populated
 * value actually looks like a real name, not a location, timing, or service description.
 */
function isValidExtractedName(name: string | null | undefined): boolean {
  const normalized = normalizeCustomerName(name)
  if (!normalized) return false

  const lower = normalized.trim().toLowerCase()
  const words = lower.split(/\s+/)

  if (words.length === 0 || words.length > 2) return false

  const placeholderNames = new Set([
    'unknown', 'not provided', 'not collected', 'n/a', 'caller', 'customer',
    'unknown caller', 'unknown customer', 'not provided name'
  ])
  if (placeholderNames.has(lower)) return false

  const nonNameTokens = new Set([
    'in', 'at', 'on', 'after', 'before', 'tomorrow', 'today', 'afternoon',
    'morning', 'evening', 'night', 'week', 'time', 'any', 'broken', 'fence',
    'service', 'repair', 'maintenance', 'install', 'installation'
  ])
  if (words.some(word => nonNameTokens.has(word))) return false

  return true
}

/**
 * Check if AI intake is complete based on extracted information
 * 
 * Required fields (with alternative names):
 * - customerName or callerName (or explicit nameRefused)
 * - serviceRequested or reasonForCalling or request (canonical resolution, includes issueDescription)
 * - serviceAddress or addressOrLocation (onsite only)
 * - desiredCompletionTime or desiredCompletion
 * - callbackTime or preferredCallbackTime
 * 
 * Note: issueDescription is canonically resolved into serviceRequested and is not a separate requirement
 */
export function isCompleteAIIntake(
  extractedInfo: ExtractedInfo | null | undefined,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): boolean {
  if (!extractedInfo || typeof extractedInfo !== 'object') {
    return false
  }

  // Check customer name: explicit refusal satisfies the name requirement.
  // Otherwise a populated value must look like a real name.
  const hasCustomerName = Boolean(
    extractedInfo.nameRefused ||
    isValidExtractedName(extractedInfo.customerName) ||
    isValidExtractedName(extractedInfo.callerName)
  )

  // Check service requested (multiple field name variations)
  // Canonical resolution: serviceRequested || request || issueDescription
  const hasServiceRequested = Boolean(
    extractedInfo.serviceRequested || 
    extractedInfo.reasonForCalling ||
    extractedInfo.request ||
    extractedInfo.issueDescription
  )

  // Check service address (multiple field name variations)
  const hasServiceAddress = Boolean(
    extractedInfo.serviceAddress || 
    extractedInfo.addressOrLocation
  )

  // Check desired completion time (multiple field name variations)
  const hasDesiredCompletionTime = Boolean(
    extractedInfo.desiredCompletionTime ||
    extractedInfo.desiredCompletion
  )

  // Check callback time (multiple field name variations)
  const hasCallbackTime = Boolean(
    extractedInfo.callbackTime || 
    extractedInfo.preferredCallbackTime
  )

  // Location is required only for onsite businesses (default to onsite if unknown)
  // Use persisted serviceLocationType from extractedInfo if available, otherwise fall back to parameter
  const effectiveServiceLocationType = extractedInfo.serviceLocationType || serviceLocationType
  const rawMode = typeof effectiveServiceLocationType === 'string' ? effectiveServiceLocationType.trim().toLowerCase() : 'onsite'
  const normalizedMode = (rawMode === 'onsite' || rawMode === 'customer_comes_to_business' || rawMode === 'remote') ? rawMode : 'onsite'
  const locationSatisfied = normalizedMode === 'onsite' ? hasServiceAddress : true

  // All required fields must be present (issueDescription is canonically merged into serviceRequested)
  const isComplete = 
    hasCustomerName &&
    hasServiceRequested &&
    locationSatisfied &&
    hasDesiredCompletionTime &&
    hasCallbackTime

  // Log for debugging
  console.log('[AI INTAKE COMPLETION CHECK]', {
    hasCustomerName,
    hasServiceRequested,
    hasServiceAddress,
    locationSatisfied,
    serviceLocationType: normalizedMode,
    hasDesiredCompletionTime,
    hasCallbackTime,
    isComplete,
    extractedInfoKeys: Object.keys(extractedInfo)
  })

  return isComplete
}

/**
 * Get the number of completed fields for AI intake
 * This can be used for partial intake detection
 * 
 * Note: issueDescription is canonically resolved into serviceRequested and not counted separately
 */
export function getCompletedFieldCount(extractedInfo: ExtractedInfo | null | undefined): number {
  if (!extractedInfo || typeof extractedInfo !== 'object') {
    return 0
  }

  let count = 0

  if (extractedInfo.nameRefused || isValidExtractedName(extractedInfo.customerName) || isValidExtractedName(extractedInfo.callerName)) count++
  if (extractedInfo.serviceRequested || extractedInfo.reasonForCalling || extractedInfo.request || extractedInfo.issueDescription) count++
  if (extractedInfo.serviceAddress || extractedInfo.addressOrLocation) count++
  if (extractedInfo.desiredCompletionTime || extractedInfo.desiredCompletion) count++
  if (extractedInfo.callbackTime || extractedInfo.preferredCallbackTime) count++

  return count
}

/**
 * Determine the appropriate outcome based on extracted info
 * This can be used to update ai_call_records.outcome
 */
export function determineAIOutcomeFromExtractedInfo(
  extractedInfo: ExtractedInfo | null | undefined,
  currentOutcome?: string | null,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): 'completed_intake' | 'partial_intake' | 'early_hangup' | string {
  // If extracted info is complete, override any stale outcome
  if (isCompleteAIIntake(extractedInfo, serviceLocationType)) {
    console.log('[AI OUTCOME DETERMINATION] Override to completed_intake - all required fields present')
    return 'completed_intake'
  }

  // If we have some fields but not all, it's partial intake
  const fieldCount = getCompletedFieldCount(extractedInfo)
  if (fieldCount > 0 && fieldCount < 5) {
    console.log('[AI OUTCOME DETERMINATION] Partial intake - some fields present', { fieldCount })
    return 'partial_intake'
  }

  // If no fields, keep current outcome or default to early_hangup
  console.log('[AI OUTCOME DETERMINATION] No fields - keep current outcome or default to early_hangup')
  return currentOutcome || 'early_hangup'
}
