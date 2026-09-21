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
 * Pure conversational acknowledgments / channel filler that carry no field
 * semantics. Anchored to the whole (stripped) utterance so real answers that
 * merely contain these words are unaffected.
 */
const CONVERSATIONAL_ACK = /^(?:okay|ok|yeah|yep|yes|yup|sure|whatever|maybe|fine|alright|all right|sounds good|got it|right|correct|hello|hi|hey|thanks|thank you|bye|goodbye|no problem|cool|great|good|perfect|nice)[.!?\s]*$/i;

/**
 * Meta-conversation / channel-check phrases that must never satisfy an intake
 * field. These are conversational repair utterances directed at the call itself
 * ("hello, still there?", "can you hear me?"), not answers to the question.
 *
 * Matching is anchored/exact-shape only - a longer utterance that embeds a
 * greeting plus a real answer ("Hello, I need a plumber") is NOT meta.
 */
const META_UTTERANCE_PATTERNS = [
  /^(?:um|uh|so|well|okay|ok|yeah|yes|hi|hey)?[,\s]*hello\b[\s,?!]*$/i,
  /^(?:hello\b[\s,?!]*)?(?:are\s+you|you)\s+(?:still\s+)?there\b[?.!\s]*$/i,
  /^hello[,\s]+still\s+there\b[?.!\s]*$/i,
  /\bstill\s+there\b[?.!\s]*$/i,
  /\b(?:are\s+you|you)\s+(?:still\s+)?(?:there|listening)\b[?.!\s]*$/i,
  /\bcan\s+you\s+(?:hear|see)\s+me\b[?.!\s]*$/i,
  /\b(?:did|do)\s+you\s+(?:hear|get|catch)\s+(?:that|me|what\s+i\s+said)\b[?.!\s]*$/i,
  /\b(?:could|can)\s+you\s+repeat\s+(?:that|what\s+you\s+said)\b[?.!\s]*$/i,
  /\bwhat\s+did\s+you\s+say\b[?.!\s]*$/i,
  /\bi\s+(?:didn'?t|did\s+not|couldn'?t|could\s+not)\s+(?:hear|catch|understand)\s+(?:you|that|what\s+you\s+said)\b[?.!\s]*$/i,
  /^(?:sorry|pardon|excuse\s+me|what|huh|eh|hmm?|mhm?)[?.!\s]*$/i,
  /^(?:one\s+)?(?:sec|second|moment|minute)[,.\s]*(?:please)?[?.!\s]*$/i,
  /\b(?:one\s+second|one\s+sec|hold\s+on|hang\s+on|wait\s+(?:a\s+|one\s+)?(?:sec|second|moment|minute)|give\s+me\s+(?:a|one)\s+(?:sec|second|moment|minute)|bear\s+with\s+me)\b[?.!\s]*$/i,
  /^(?:sorry[,\s]+)?what\s+was\s+that\b[?.!\s]*$/i,
  /\b(?:hold|hang)\s+on\s+(?:a\s+)?(?:sec|second|moment|minute)\b[?.!\s]*$/i,
  /\bjust\s+a\s+(?:sec|second|moment|minute)\b[?.!\s]*$/i,
  /\bthat'?s\s+not\s+what\s+i\s+said\b[?.!\s]*$/i,
  /\bi\s+(?:already\s+)?(?:told|said)\s+you\b[?.!\s]*$/i,
];

/**
 * Check whether an utterance is pure meta-conversation (channel check,
 * filler repair, stalling) with no field-answer content.
 */
export function isMetaUtterance(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  // Longer substantive utterances are not meta even if they contain a greeting.
  if (trimmed.split(/\s+/).length > 6) return false;
  return META_UTTERANCE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Conversational/function words that carry no field content on their own.
 * Shared by the name validator (as disqualifiers) and by
 * isConversationalFragment (a phrase made ONLY of these words is small talk,
 * not an answer). Deliberately excludes plausible name-words like
 * will/may/grace/bill/mark.
 */
const NON_NAME_WORDS = new Set([
  'like', 'old', 'times', 'fine', 'whatever', 'works', 'working', 'calling',
  'hear', 'heard', 'hello', 'there', 'second', 'sec', 'hold', 'on', 'wait',
  'okay', 'ok', 'yes', 'yeah', 'yep', 'no', 'nope', 'hi', 'hey', 'bye',
  'thanks', 'thank', 'is', 'are', 'was', 'were', 'just',
  'can', 'could', 'you', 'me', 'my', 'mine', 'the', 'a', 'an', 'and', 'or',
  'but', 'so', 'well', 'now', 'here', 'this', 'that', 'these', 'those',
  'it', 'its', 'what', 'who', 'how', 'when', 'where', 'why', 'still',
  'yet', 'again', 'please', 'sorry', 'actually', 'really', 'sure', 'know',
  'think', 'guess', 'maybe', 'perhaps', 'want', 'wanted', 'need', 'needed',
  'have', 'has', 'had', 'got', 'get', 'getting', 'go', 'going', 'gone',
  'said', 'say', 'saying', 'told', 'tell', 'ask', 'asked', 'repeat',
  'understand', 'understood', 'right', 'wrong', 'correct', 'exactly',
  'uh', 'um', 'hmm', 'oh', 'ah', 'anyway', 'anyways', 'else', 'something',
  'anything', 'nothing', 'everything', 'someone', 'somebody', 'anyone',
  'anybody', 'everyone', 'nobody', 'thing', 'things', 'stuff', 'bit',
  'moment', 'minute', 'see', 'seen', 'listen', 'listening', 'speak',
  'speaking', 'talk', 'talking', 'back', 'later', 'soon', 'then', 'than',
  'about', 'around', 'because', 'before', 'after', 'very', 'much', 'many',
  'good', 'bad', 'great', 'nice', 'fine', 'busy', 'free', 'available',
  'sounds', 'sound', 'seems', 'seem', 'looks', 'look', 'feel', 'feels',
  'mean', 'meant', 'matter', 'mind', 'care', 'prefer', 'rather',
  'to', 'for', 'of', 'in', 'at', 'by', 'with', 'from', 'into', 'onto',
  'out', 'up', 'down', 'over', 'under', 'off', 'per', 'via',
  // Contractions with apostrophes stripped ("that's" -> "thats")
  'thats', 'its', 'im', 'ive', 'ill', 'id', 'dont', 'cant', 'wont', 'didnt',
  'isnt', 'arent', 'wasnt', 'werent', 'couldnt', 'shouldnt', 'wouldnt',
  'youd', 'youre', 'youve', 'youll', 'shes', 'hes', 'lets', 'whats', 'heres',
]);

/**
 * True when the text is composed entirely of conversational/function words
 * ("like old times", "that's fine", "can you hear me") — i.e. it carries no
 * substantive field content. Requires >=2 words so terse single-word answers
 * keep their existing handling.
 */
export function isConversationalFragment(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const words = text.trim().toLowerCase().match(/[\p{L}]+(?:['’\-][\p{L}]+)*/gu);
  if (!words || words.length < 2) return false;
  return words.every(w => NON_NAME_WORDS.has(w.replace(/['’\-]/g, '')));
}

/**
 * Validate service address - reject refusals but accept flexible address formats
 *
 * For onsite service, a plain person name (e.g. "Michael Carter") must NOT
 * satisfy the address field. Only location-like responses are accepted.
 */
export function isValidServiceAddress(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (isRefusal(trimmed)) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;
  if (isMetaUtterance(trimmed)) return false;
  if (isConversationalFragment(trimmed)) return false;

  // Reject obvious non-answers
  const nonAnswerPatterns = [
    /^(i don't know|i dont know|not sure|no idea|unknown)$/i,
    /^(i don't have the address|i dont have the address|no address)$/i,
    // Meta-responses: "I said I don't know", "I told you I don't know", etc.
    /^(i (?:said|told you|already (?:said|told you))\s+.*)$/i,
    // Bare "don't know" / "can't remember" without other content
    /^(don't know|dont know|can't remember|cant remember|no idea|not sure)$/i,
  ];
  if (nonAnswerPatterns.some(pattern => pattern.test(trimmed))) return false;

  // Reject plain person names (1-2 capitalized words, no address keywords).
  // A person name like "Michael Carter" must NOT satisfy the address field.
  // This check only applies when the text has no address/location indicators.
  if (looksLikePersonNameOnly(trimmed)) return false;

  return true;
}

/**
 * Check if text looks like a plain person name with no address/location content.
 * "Michael Carter" → true (reject as address)
 * "942 Brookside Avenue" → false (has street number)
 * "Pittsburgh" → false (single capitalized word, could be city)
 * "Michael Carter in Pittsburgh" → false (has "in" location marker)
 */
function looksLikePersonNameOnly(text: string): boolean {
  const trimmed = text.trim();
  // If the text contains address indicators, it's not a person-name-only answer.
  const addressIndicators = /\b(?:\d+\s|street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl|apartment|apt|suite|unit|in|near|at|located)\b/i;
  if (addressIndicators.test(trimmed)) return false;

  // Check if it looks like a person name: 1-2 capitalized words, no other content.
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 2) return false;

  // Each word must be capitalized (first letter upper, rest lower) and alphabetic.
  const isCapitalizedWord = (w: string) => /^[A-Z][a-z]+$/.test(w);
  if (!words.every(isCapitalizedWord)) return false;

  // It's a person-name-only answer — reject as address.
  return true;
}

/**
 * Semantic service-address usability check for ONSITE completion.
 *
 * A non-empty string is NOT sufficient. This combines:
 *   - isValidServiceAddress (rejects refusals, uncertainty, meta-responses)
 *   - locationRefused flag (explicit refusal state)
 *   - locationUnknown flag (extraction marked address as unknown)
 *
 * For onsite service, the address must be semantically usable.
 * For remote / customers-come-to-business, address is not required
 * and this function should not gate completion.
 */
export function isUsableServiceAddress(intake: IntakeData): boolean {
  // Explicit refusal flags mean address is not usable even if raw text exists
  if (intake.locationRefused) return false;
  if ((intake as any).locationUnknown) return false;
  // Must pass semantic validation
  return isValidServiceAddress(intake.serviceAddress || '');
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
  if (isMetaUtterance(trimmed)) return false;
  if (isConversationalFragment(trimmed)) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea', 'not provided', 'not collected'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;

  return true;
}

/**
 * Validate desired completion time - accept flexible timing expressions
 *
 * A field extracted for skip-ahead must be semantically plausible for a
 * completion/timing field before it can satisfy/skip a stage. Work verbs
 * like "patched", "painted", "repaired" are NOT valid completion times.
 */
export function isValidCompletionTime(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  // Reject clear refusals so they are not stored as real timing values
  if (isRefusal(trimmed)) return false;
  if (isMetaUtterance(trimmed)) return false;
  if (isConversationalFragment(trimmed)) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea', 'not provided', 'not collected'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;
  // Pure acknowledgments carry no timing semantics — "okay", "yeah", "whatever"
  // must never satisfy a structured timing field.
  if (CONVERSATIONAL_ACK.test(trimmed)) return false;

  // Reject work verbs / action words that are NOT timing expressions.
  // These are commonly misextracted from service descriptions.
  const workVerbs = /\b(?:patched|painting|painted|painted|repaired|repaired|replaced|replacing|fixed|fixing|installed|installing|cut|mowed|cleaned|cleaning|checked|checking|serviced|servicing|removed|removing|trimmed|trimming|done|completed|finished|built|demolished|inspected|inspecting)\b/i;
  if (workVerbs.test(trimmed) && !hasTimingSemantics(trimmed)) {
    return false;
  }

  return true;
}

/**
 * Check if text contains actual timing/urgency semantics.
 * Valid: tomorrow, this week, next Monday, ASAP, within two weeks, etc.
 */
function hasTimingSemantics(text: string): boolean {
  const lower = text.toLowerCase();
  // Time units and temporal expressions
  const timingPatterns = [
    /\b(?:today|tomorrow|tonight)\b/,
    /\b(?:this|next|coming|upcoming|following)\s+(?:week|month|year|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening)\b/,
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
    /\b(?:morning|afternoon|evening|night)\b/,
    /\b(?:in|within|by|before|after|until)\s+\d/i,
    /\b(?:asap|as soon as possible|right away|immediately|urgent|urgently|no rush|whenever)\b/,
    /\b(?:in|within)\s+(?:a\s+|the\s+|one|two|three|four|five|couple|few|several|\d+)\s+(?:day|week|month|hour)s?\b/,
    /\b(?:early|late)\s+(?:next|this)\s+(?:week|month|year)\b/,
  ];
  return timingPatterns.some(pattern => pattern.test(lower));
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
  if (isMetaUtterance(trimmed)) return false;
  if (isConversationalFragment(trimmed)) return false;

  // Reject only truly unusable answers
  const unusableAnswers = [
    '', 'uh', 'um', 'hmm', 'i don\'t know', 'not sure', 'i dont know', 'idk', 'no idea', 'not provided', 'not collected'
  ];
  if (unusableAnswers.includes(trimmed.toLowerCase())) return false;
  if (isUncertaintyNonAnswer(trimmed)) return false;
  if (CONVERSATIONAL_ACK.test(trimmed)) return false;

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

  const trimmed = name.trim();
  const trimmedName = trimmed.toLowerCase();

  // Reject meta-conversation and uncertainty non-answers
  if (isMetaUtterance(trimmed) || isUncertaintyNonAnswer(trimmed)) {
    return false;
  }

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

  // Structural name check: 1-4 name tokens (supports multi-part names like
  // "Mary Ann Smith" and "Siobhan O'Connor"), each token letters/apostrophes/
  // hyphens only, and no conversational/function words ("like old times",
  // "can you hear me", "that's fine" are rejected here, not by a name list).
  const words = trimmed.split(/\s+/);
  if (words.length > 4) {
    return false;
  }
  const nameTokenRe = /^[\p{L}]+(?:['’\-][\p{L}]+)*$/u;
  if (!words.every(w => nameTokenRe.test(w))) {
    return false;
  }
  if (words.some(w => NON_NAME_WORDS.has(w.toLowerCase().replace(/['’\-]/g, '')))) {
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
  transcript: string,
  options?: { isCorrection?: boolean }
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

    // Allow overwrite when a correction intent is detected — the newest
    // explicit correction replaces the superseded value. Do not concatenate
    // old + corrected scalar values.
    if (options?.isCorrection) {
      console.log('[correction_overwrite]', { field: fieldName, oldValue: existingValue, newValue: candidate.trim() });
      (intake as any)[fieldName] = candidate.trim();
      return true;
    }

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
  // while leaving the corresponding canonical field empty. Scalar fields must pass
  // their semantic validators so meta/filler values cannot satisfy a stage.
  const hasName = isNameRequirementSatisfied(intake);
  // serviceRequested is canonical; `request` is the Simple Mode compatibility
  // field written by storeStageCapture for ask_request. A settled request that
  // only reached the compat field must still satisfy ask_request.
  const hasRequest =
    isValidServiceRequest(intake.serviceRequested || '') ||
    isValidServiceRequest(intake.request || '');
  const hasLocation = isUsableServiceAddress(intake) || !!intake.locationRefused;
  const hasCompletionTime = isValidCompletionTime(intake.desiredCompletionTime || '');
  const hasCallbackTime = isValidCallbackTime(intake.callbackTime || '');

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

/**
 * Centralized structured-field normalizer.
 *
 * Strips dangling filler/meta fragments from extracted field values without
 * losing meaningful content. Does NOT hallucinate missing details.
 *
 * Examples:
 *   "a manicure. I live" → "a manicure"
 *   "I'm" → "" (empty — not a usable value)
 *   "a manicure. I live in Pittsburgh" → "a manicure" (location handled separately)
 */
export function normalizeStructuredFieldValue(
  value: string | undefined | null,
  fieldType: 'service' | 'address' | 'timing' | 'callback' | 'name'
): string {
  if (!value || typeof value !== 'string') return '';
  let s = value.trim();
  if (s.length === 0) return '';

  // Strip trailing incomplete sentence fragments starting with common connectors
  // that indicate the caller drifted into a different topic.
  // e.g., "a manicure. I live" → "a manicure"
  const danglingFragmentPatterns = [
    // "I live...", "I'm...", "I am..." at end (incomplete personal statement)
    /\s*[.,;]\s*(?:i\s+(?:live|am|m|need|want|have|was|feel|think|said|told|don't|dont|can't|cant)\b.*)$/i,
    // "and I..." trailing
    /\s*,?\s*and\s+i\b.*$/i,
    // Trailing "I'm" alone
    /\s*[.,;]?\s*i'?m\s*$/i,
  ];
  for (const pattern of danglingFragmentPatterns) {
    s = s.replace(pattern, '').trim();
  }

  // Strip trailing punctuation
  s = s.replace(/[.,;:]\s*$/, '').trim();

  // For callback/timing, preserve temporal qualifiers like "anytime tomorrow afternoon"
  // but strip trailing conversational filler
  if (fieldType === 'callback' || fieldType === 'timing') {
    s = s.replace(/\s*[.,;]\s*$/i, '').trim();
  }

  return s;
}