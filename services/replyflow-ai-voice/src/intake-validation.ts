/**
 * Intake field validation and merge utilities
 * Extracted from index.ts for testability
 */

/**
 * Refusal patterns that indicate caller declined to provide information
 * These should NOT be stored as factual values for structured fields
 */
const REFUSAL_PATTERNS = [
  "i'd rather not",
  "i would rather not",
  "i don't want to",
  "i dont want to",
  "not telling you",
  "i'd rather not say",
  "i would rather not say",
  "i'd rather give it later",
  "i would rather give it later",
  "i'll give it later",
  "i will give it later",
  "prefer not to",
  "i prefer not to",
  "i don't have the",
  "i dont have the",
  "i don't know the",
  "i dont know the",
  "i'd rather give it when",
  "i would rather give it when"
];

/**
 * Check if text appears to be a refusal to provide information
 * This is a conservative check - returns true only for clear refusal patterns
 */
export function isRefusal(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lowerText = text.trim().toLowerCase();
  return REFUSAL_PATTERNS.some(pattern => lowerText.includes(pattern));
}

/**
 * Validate service address - reject refusals but accept flexible address formats
 */
export function isValidServiceAddress(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (isRefusal(trimmed)) return false;

  // Reject obvious non-answers
  const nonAnswerPatterns = [
    /^(i don't know|i dont know|not sure|no idea|unknown)$/i,
    /^(i don't have the address|i dont have the address|no address)$/i
  ];
  if (nonAnswerPatterns.some(pattern => pattern.test(trimmed))) return false;

  return true;
}

/**
 * Validate service request - reject only truly unusable answers
 * Issue description (additional details) is optional and handled separately
 */
export function isValidServiceRequest(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;

  return true;
}

/**
 * Validate desired completion time - accept flexible timing expressions
 */
export function isValidCompletionTime(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;

  return true;
}

/**
 * Validate callback time - accept flexible callback preferences
 */
export function isValidCallbackTime(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;

  return true;
}

/**
 * Canonical field merge with protection rules
 *
 * Merge rules:
 * - undefined candidate does not clear existing value
 * - empty candidate does not clear existing value
 * - invalid candidate does not clear existing value
 * - refusal text does not become factual value
 * - unknown field cannot enter canonical state
 */
export interface IntakeData {
  customerName?: string;
  serviceRequested?: string;
  issueDescription?: string;
  serviceAddress?: string;
  desiredCompletionTime?: string;
  callbackTime?: string;
  [key: string]: any;
}

export function mergeExtractedField(
  intake: IntakeData,
  fieldName: keyof IntakeData,
  candidate: string | null | undefined,
  validator: (text: string) => boolean,
  currentStage: string,
  transcript: string
): boolean {
  // If candidate is undefined or empty, do not clear existing value
  if (candidate === undefined || candidate === null || (typeof candidate === 'string' && candidate.trim().length === 0)) {
    return false;
  }

  // If existing value is present and valid, do not overwrite with invalid candidate
  const existingValue = (intake as any)[fieldName];
  if (existingValue && existingValue.trim().length > 0) {
    // Validate candidate before considering overwrite
    if (!validator(candidate)) {
      return false;
    }

    // Allow overwrite if candidate is valid and different (correction scenario)
    // For now, be conservative: don't overwrite existing valid values
    return false;
  }

  // Validate candidate
  if (!validator(candidate)) {
    return false;
  }

  // Merge valid candidate
  (intake as any)[fieldName] = candidate.trim();
  return true;
}

/**
 * Field-aware deterministic stage resolver
 *
 * Scans canonical order for the first unsatisfied applicable scripted stage.
 * AI cannot control routing - code determines next stage based on field satisfaction.
 */
export type IntakeStage = 'ask_name' | 'ask_request' | 'ask_name_reason' | 'ask_location_or_context' | 'ask_timing' | 'ask_callback_time' | 'complete';

export function resolveNextRequiredStage(
  intake: IntakeData,
  serviceLocationType: string = 'onsite'
): IntakeStage {
  // Normalize service location type
  const normalizedMode = typeof serviceLocationType === 'string' ? serviceLocationType.trim().toLowerCase() : 'onsite';
  const isOnsite = normalizedMode === 'onsite';

  // Check field satisfaction
  const hasName = Boolean(intake.customerName && intake.customerName.trim().length > 0);
  const hasRequest = Boolean(intake.serviceRequested && intake.serviceRequested.trim().length > 0);
  const hasLocation = Boolean(intake.serviceAddress && intake.serviceAddress.trim().length > 0);
  const hasCompletionTime = Boolean(intake.desiredCompletionTime && intake.desiredCompletionTime.trim().length > 0);
  const hasCallbackTime = Boolean(intake.callbackTime && intake.callbackTime.trim().length > 0);

  // Determine location requirement
  const locationSatisfied = isOnsite ? hasLocation : true;

  // Check if all required fields are satisfied
  const allRequiredSatisfied = hasName && hasRequest && locationSatisfied && hasCompletionTime && hasCallbackTime;

  // If all required fields satisfied, route to complete
  if (allRequiredSatisfied) {
    return 'complete';
  }

  // Scan canonical order for first unsatisfied stage
  // Note: This uses the legacy stage names from the resolver
  const canonicalSequence: IntakeStage[] = isOnsite
    ? ['ask_name_reason', 'ask_request', 'ask_location_or_context', 'ask_timing', 'ask_callback_time']
    : ['ask_name_reason', 'ask_request', 'ask_timing', 'ask_callback_time'];

  for (const stage of canonicalSequence) {
    let stageSatisfied = false;

    switch (stage) {
      case 'ask_name_reason':
        stageSatisfied = hasName && hasRequest;
        break;
      case 'ask_request':
        stageSatisfied = hasRequest;
        break;
      case 'ask_location_or_context':
        stageSatisfied = locationSatisfied;
        break;
      case 'ask_timing':
        stageSatisfied = hasCompletionTime;
        break;
      case 'ask_callback_time':
        stageSatisfied = hasCallbackTime;
        break;
    }

    if (!stageSatisfied) {
      return stage;
    }
  }

  // Fallback to complete if loop completes (shouldn't happen due to allRequiredSatisfied check above)
  return 'complete';
}

/**
 * Simple Mode stage key mapping
 * Maps canonical resolver stage keys to Simple Mode production stage keys
 */
const SIMPLE_MODE_STAGE_MAP: Record<string, string> = {
  'ask_location_or_context': 'ask_location',
  'ask_timing': 'ask_completion_time',
  // ask_name_reason, ask_callback_time, complete remain unchanged
};

/**
 * Simple Mode adapter for the field-aware resolver
 * Takes Simple Mode state and returns the next Simple Mode stage
 */
export function resolveNextSimpleModeStage(
  intakeData: IntakeData,
  serviceLocationType: string = 'onsite'
): string {
  const canonicalStage = resolveNextRequiredStage(intakeData, serviceLocationType);
  return SIMPLE_MODE_STAGE_MAP[canonicalStage] || canonicalStage;
}