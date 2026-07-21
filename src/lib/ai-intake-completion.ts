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

export interface ExtractedInfo {
  customerName?: string
  callerName?: string
  serviceRequested?: string
  reasonForCalling?: string
  issueDescription?: string
  importantDetails?: string
  serviceAddress?: string
  addressOrLocation?: string
  desiredCompletionTime?: string
  callbackTime?: string
  preferredCallbackTime?: string
  [key: string]: any
}

/**
 * Check if AI intake is complete based on extracted information
 * 
 * Required fields (with alternative names):
 * - customerName or callerName
 * - serviceRequested or reasonForCalling
 * - issueDescription or importantDetails
 * - serviceAddress or addressOrLocation
 * - desiredCompletionTime
 * - callbackTime or preferredCallbackTime
 */
export function isCompleteAIIntake(
  extractedInfo: ExtractedInfo | null | undefined,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): boolean {
  if (!extractedInfo || typeof extractedInfo !== 'object') {
    return false
  }

  // Check customer name (multiple field name variations)
  const hasCustomerName = Boolean(
    extractedInfo.customerName || 
    extractedInfo.callerName
  )

  // Check service requested (multiple field name variations)
  const hasServiceRequested = Boolean(
    extractedInfo.serviceRequested || 
    extractedInfo.reasonForCalling
  )

  // Check issue description (multiple field name variations)
  const hasIssueDescription = Boolean(
    extractedInfo.issueDescription || 
    extractedInfo.importantDetails
  )

  // Check service address (multiple field name variations)
  const hasServiceAddress = Boolean(
    extractedInfo.serviceAddress || 
    extractedInfo.addressOrLocation
  )

  // Check desired completion time
  const hasDesiredCompletionTime = Boolean(
    extractedInfo.desiredCompletionTime
  )

  // Check callback time (multiple field name variations)
  const hasCallbackTime = Boolean(
    extractedInfo.callbackTime || 
    extractedInfo.preferredCallbackTime
  )

  // Location is required only for onsite businesses (default to onsite if unknown)
  const rawMode = typeof serviceLocationType === 'string' ? serviceLocationType.trim().toLowerCase() : 'onsite'
  const normalizedMode = (rawMode === 'onsite' || rawMode === 'customer_comes_to_business' || rawMode === 'remote') ? rawMode : 'onsite'
  const locationSatisfied = normalizedMode === 'onsite' ? hasServiceAddress : true

  // All required fields must be present
  const isComplete = 
    hasCustomerName &&
    hasServiceRequested &&
    hasIssueDescription &&
    locationSatisfied &&
    hasDesiredCompletionTime &&
    hasCallbackTime

  // Log for debugging
  console.log('[AI INTAKE COMPLETION CHECK]', {
    hasCustomerName,
    hasServiceRequested,
    hasIssueDescription,
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
 */
export function getCompletedFieldCount(extractedInfo: ExtractedInfo | null | undefined): number {
  if (!extractedInfo || typeof extractedInfo !== 'object') {
    return 0
  }

  let count = 0

  if (extractedInfo.customerName || extractedInfo.callerName) count++
  if (extractedInfo.serviceRequested || extractedInfo.reasonForCalling) count++
  if (extractedInfo.issueDescription || extractedInfo.importantDetails) count++
  if (extractedInfo.serviceAddress || extractedInfo.addressOrLocation) count++
  if (extractedInfo.desiredCompletionTime) count++
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
  if (fieldCount > 0 && fieldCount < 6) {
    console.log('[AI OUTCOME DETERMINATION] Partial intake - some fields present', { fieldCount })
    return 'partial_intake'
  }

  // If no fields, keep current outcome or default to early_hangup
  console.log('[AI OUTCOME DETERMINATION] No fields - keep current outcome or default to early_hangup')
  return currentOutcome || 'early_hangup'
}
