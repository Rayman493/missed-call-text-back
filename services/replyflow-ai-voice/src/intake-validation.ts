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
 * Check if text is an uncertainty-led non-answer
 * Catches "I'm not sure...", "I don't know...", "not sure yet", etc.
 * while avoiding false positives on legitimate names (word boundary after uncertainty phrase)
 */
function isUncertaintyNonAnswer(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.trim().toLowerCase();
  return /^(i'?m not sure|i am not sure|im not sure|i don'?t know|i dont know|idk|not sure|no idea|i have no idea)\b/i.test(lower);
}

/**
 * Validate service address - reject refusals but accept flexible address formats
 */
export function isValidServiceAddress(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (isRefusal(trimmed)) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;

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

  // Reject clear refusals so they are not stored as real service requests
  if (isRefusal(trimmed)) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;

  return true;
}

/**
 * Validate desired completion time - accept flexible timing expressions
 */
export function isValidCompletionTime(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Reject clear refusals so they are not stored as real timing values
  if (isRefusal(trimmed)) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;

  return true;
}

/**
 * Validate callback time - accept flexible callback preferences
 */
export function isValidCallbackTime(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Reject clear refusals so they are not stored as real callback preferences
  if (isRefusal(trimmed)) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;

  return true;
}

/**
 * Validate customer name - reject refusals, non-answers, and cross-contamination
 * Only accepts values that look like a real person name.
 */
export function isValidCustomerName(name: string): boolean {
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Reject refusal patterns first
  if (isRefusal(name)) {
    return false;
  }

  const trimmedName = name.trim().toLowerCase();

  // Reject if too short or too long
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    return false;
  }

  // Blocklist of common non-name values that should not be saved as customerName
  const blockedValues = [
    // Service types
    'financial management', 'property management', 'south park', 'dog grooming', 'grass cutting',
    'plumbing', 'hvac', 'electrical', 'landscaping', 'roofing', 'cleaning', 'pest control',
    'painting', 'carpentry', 'masonry', 'excavation', 'concrete', 'windows', 'doors',
    'insulation', 'solar', 'security', 'fencing', 'deck', 'pool', 'moving', 'storage',
    'junk removal', 'lawn care', 'toilet', 'installation', 'maintenance', 'repair',
    'service', 'consultation', 'appointment', 'quote', 'estimate', 'inspection',

    // Locations
    'south park', 'north park', 'east park', 'west park', 'downtown', 'uptown',

    // Generic phrases
    'customer', 'client', 'caller', 'someone', 'anyone', 'nobody', 'unknown',
    'help', 'need', 'want', 'call', 'phone', 'message',

    // Business-related
    'business', 'company', 'office', 'store', 'shop',

    // Time-related
    'morning', 'afternoon', 'evening', 'today', 'tomorrow', 'week'
  ];

  // Reject generic introductory scaffolding that is not a name
  const introScaffolding = /^(?:my name is|name is|i am|i'm|this is)\b/i;
  if (introScaffolding.test(name.trim())) {
    return false;
  }

  // Check if name is blocked
  if (blockedValues.some(blocked => trimmedName === blocked || trimmedName.includes(blocked))) {
    return false;
  }

  // Check if it contains only common service words
  const serviceWords = ['service', 'repair', 'maintenance', 'installation', 'cleaning', 'management', 'inspection'];
  if (serviceWords.some(word => trimmedName.includes(word))) {
    return false;
  }

  // Check if it's a multi-word phrase that looks like a service description
  const words = trimmedName.split(/\s+/);
  if (words.length > 2) {
    return false;
  }

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
  nameRefused?: boolean;
  serviceRequested?: string;
  issueDescription?: string;
  serviceAddress?: string;
  locationRefused?: boolean;
  desiredCompletionTime?: string;
  callbackTime?: string;
  stage?: string;
  [key: string]: any;
}

/**
 * Canonical name-requirement satisfaction check.
 * The name stage is satisfied when a valid name is present OR the caller
 * explicitly refused to provide it. This helper is the single source of truth
 * for every name-satisfaction decision in the intake flow.
 */
export function isNameRequirementSatisfied(intake: IntakeData): boolean {
  const hasValidCustomerName = !!intake.customerName && isValidCustomerName(intake.customerName);
  const satisfied = hasValidCustomerName || !!intake.nameRefused;
  console.log('[name_requirement_satisfied]', {
    customerName: intake.customerName,
    nameRefused: intake.nameRefused,
    satisfied,
    hasValidCustomerName
  });
  return satisfied;
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

  // Hard refusal invariant: once nameRefused is true, only an explicit valid name may repopulate customerName.
  if (fieldName === 'customerName' && intake.nameRefused) {
    if (!isValidCustomerName(candidate)) {
      console.log('[name_write_blocked_after_refusal]', { candidate: candidate.trim(), transcript });
      return false;
    }
    // An explicit valid name after refusal clears the refusal flag.
    console.log('[name_refusal_cleared_by_explicit_name]', { newName: candidate.trim(), transcript });
    intake.nameRefused = false;
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

  // Check field satisfaction. Explicit refusal flags count as handled for navigation
  // while leaving the corresponding canonical field empty.
  const hasName = isNameRequirementSatisfied(intake);
  const hasRequest = Boolean(intake.serviceRequested && intake.serviceRequested.trim().length > 0);
  const hasLocation = Boolean(intake.serviceAddress && intake.serviceAddress.trim().length > 0) || !!intake.locationRefused;
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

  // Scan canonical order for first unsatisfied stage.
  // ask_name_reason is satisfied as soon as the name requirement is met (real name
  // or explicit refusal); request collection moves to ask_request so callers are
  // never re-asked for a name after refusing.
  const canonicalSequence: IntakeStage[] = isOnsite
    ? ['ask_name_reason', 'ask_request', 'ask_location_or_context', 'ask_timing', 'ask_callback_time']
    : ['ask_name_reason', 'ask_request', 'ask_timing', 'ask_callback_time'];

  for (const stage of canonicalSequence) {
    let stageSatisfied = false;

    switch (stage) {
      case 'ask_name_reason':
        stageSatisfied = isNameRequirementSatisfied(intake);
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

/**
 * Centralized prompt selector for Simple Mode - field-aware prompt variant selection
 * This ensures consistent prompt selection across stage entry and same-stage reprompts
 * Distinguishes between normal progression and corrective reprompt
 */
export function selectSimpleModePromptKey(stage: string, intakeData: IntakeData, repromptContext?: { needsServiceReprompt?: boolean; needsNameReprompt?: boolean }): string {
  // For ask_name_reason, select variant based on field satisfaction and reprompt context
  if (stage === 'ask_name_reason') {
    const nameSatisfied = isNameRequirementSatisfied(intakeData);
    const hasValidServiceRequested = !!intakeData.serviceRequested && intakeData.serviceRequested.trim().length > 0;

    // Check if this is a corrective same-stage reprompt
    const isCorrectiveReprompt = (repromptContext?.needsServiceReprompt || repromptContext?.needsNameReprompt);

    if (nameSatisfied && !hasValidServiceRequested) {
      // Name satisfied (given or refused), request missing → service-only prompt
      if (isCorrectiveReprompt) {
        // Corrective: short targeted reminder after identity-only/unusable answer
        return 'ask_name_reason_service_only';
      } else {
        // Normal: canonical request/details question inviting additional details
        return 'ask_request';
      }
    } else if (!nameSatisfied && hasValidServiceRequested) {
      // Service present, name missing → name-only prompt
      return 'ask_name_reason_name_only';
    }
    // If the name has already been refused, never re-ask for it.
    if (intakeData.nameRefused) {
      return 'ask_request';
    }
    // Both missing or both present → use standard combined prompt
    // (both present case should advance past this stage, but this is the fallback)
    return 'ask_name_reason';
  }

  // For all other stages, return the stage name as-is
  return stage;
}