/**
 * Semantic skip-ahead extraction for AI Simple Mode intake.
 *
 * When a caller provides information for later stages early, this module
 * extracts and persists those fields immediately, then cleans the
 * `serviceRequested` value so it is not polluted with location/timing/callback
 * text. It only fills currently-empty fields and does not overwrite explicit
 * later corrections.
 */

import {
  isValidServiceAddress,
  isValidServiceRequest,
  isValidCompletionTime,
  isValidCallbackTime,
} from './intake-validation';
import {
  EARLY_COMPLETION_PATTERNS,
  EARLY_CALLBACK_PATTERNS,
} from './early-timing-patterns';

export interface IntakeData {
  customerName?: string;
  serviceRequested?: string;
  request?: string;
  issueDescription?: string;
  serviceAddress?: string;
  desiredCompletionTime?: string;
  callbackTime?: string;
  stage?: string;
  [key: string]: any;
}

export interface SkipAheadResult {
  detected: string[];
  applied: string[];
  skippedBecauseAlreadyPresent: string[];
  cleanedService?: string;
}

type ExtractedMatch = {
  value: string;
  fullMatch: string;
  startIndex: number;
};

const FILLER_PHRASES = [
  'all right', 'okay', 'ok', 'yeah', 'yes', 'thanks', 'thank you', 'sure',
];

function isFillerPhrase(text: string): boolean {
  const lowerText = text.trim().toLowerCase();
  return FILLER_PHRASES.some(
    (phrase) => lowerText === phrase || lowerText.startsWith(phrase + ' ')
  );
}

function stripServicePrefix(s: string): string {
  const prefixRe = /^(?:(?:yeah|yep|yes|okay|ok|alright|well|so|uh|um)[,\s]+|(?:i want to|i would like to|i'd like to|i need to|i need|i'm(?:\s+just)?\s+looking to|i am(?:\s+just)?\s+looking to|(?:just\s+)?looking to|calling about|i'm calling about|i am calling about|need someone to|to get my|get my)\s+)/i;
  let prev: string;
  do {
    prev = s;
    s = s.replace(prefixRe, '').replace(/^[.,;:]\s*/, '').trim();
  } while (s !== prev);
  return s;
}

function normalizeNameCandidate(s: string): string {
  return s
    .replace(/^(?:hi|hello|hey)[,\s]+/i, '')
    .replace(
      /^(?:my name is|my name's|name is|i am|i'm|this is|it is|it's)[\s,]*/i,
      ''
    )
    .replace(/^(?:uh|um|yeah|well|actually)[\s,]+/i, '')
    .replace(/\s+here$/i, '')
    .replace(/[.,;:]\s*$/i, '')
    .trim();
}

// Reject name candidates that clearly contain service/problem language.
const NAME_SERVICE_BLOCKERS = /\b(?:need|want|looking|get|got|have|cut|install|installed|repair|repaired|fix|fixed|done|completed|finished|mowed|cleaned|checked|painted|replaced|removed|trimmed|serviced|leak|leaking|broke|broken|snapped|fence|grass|sink|water|heater|gutter|roof|plumber|garage|door|cable|tile|floor|wall|ceiling|furnace|ac|electrical|wire|outlet|switch|light|bulb|appliance|machine|device|system|unit)\b/i;

function extractCustomerName(transcript: string): string | null {
  const trimmed = transcript.trim();
  const patterns = [
    /\bmy name is\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /\bmy name's\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /\bi am\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /\bi'm\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /\bthis is\s+(.+?)(?:\.|,|;|\band\b|$)/i,
    /\bhi[,\s]+my name is\s+(.+?)(?:\.|,|;|\band\b|$)/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const normalized = normalizeNameCandidate(match[1].trim());
      if (normalized && normalized.length > 1 && !isFillerPhrase(normalized) && !NAME_SERVICE_BLOCKERS.test(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

const ADDRESS_PATTERNS: { pattern: RegExp; type: string }[] = [
  {
    pattern:
      /\b(?:address is|located at|it's at|its at|job is at|job's at|service is at|service location is|the address is|the property is at)\s+([^.!?\n]+?)(?=\s*(?:,?\s*and\b|[.!?](?:\s|$)|;|$))/i,
    type: 'explicit',
  },
  {
    pattern:
      /\b(?:at|@)\s+(\d[^.!?\n]*?)(?=\s*(?:,?\s*and\b|[.!?](?:\s|$)|;|$))/i,
    type: 'bare-numbered',
  },
  {
    pattern:
      /\b(\d+\s+[a-z]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl)(?:\s+[a-z]+)?)\b/i,
    type: 'street-address',
  },
];

function isConfidentEarlyServiceAddress(
  text: string,
  type: string
): boolean {
  if (!isValidServiceAddress(text)) return false;
  const trimmed = text.trim().toLowerCase();
  if (type === 'explicit') return true;
  if (type === 'street-address') return true;
  if (type === 'bare-numbered') {
    return /^\d/.test(trimmed) || /\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl)\b/.test(trimmed);
  }
  return false;
}

function findAddressMatch(transcript: string): ExtractedMatch | null {
  for (const { pattern, type } of ADDRESS_PATTERNS) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (isConfidentEarlyServiceAddress(candidate, type)) {
        const value = candidate
          .replace(/[.,;]\s*$/, '')
          .replace(/\s+instead(?:\s+of\s+.*)?$/i, '')
          .trim();
        return {
          value,
          fullMatch: (match[0] || candidate).trim(),
          startIndex: match.index || 0,
        };
      }
    }
  }
  return null;
}

// Completion patterns are evaluated in order; more specific first.
const COMPLETION_PATTERNS: RegExp[] = [
  /\b((?:i'd like|i would like|i want|i need)\s+it\s+(?:done|completed|finished)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  // Same intent without a preposition, e.g. "I'd like it done Friday" or "I want it done tomorrow morning".
  /\b((?:i'd like|i would like|i want|i need)\s+(?:it\s+)?(?:done|completed|finished)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:i'd like|i would like|i want|i need)\s+(?:someone|somebody)\s+(?:to come\s+)?(?:out|here)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:can you|could you)\s+(?:come|get here|make it)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  // Correction/short-form completions: "make it Monday instead" or "I need it Saturday".
  /\b((?:make it|make that|set it for|set it to)\s+([^.,;]+?))(?=\s+instead\b|\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:i'd like|i would like|i want|i need)\s+it\s+(?:by\s+|on\s+|for\s+)?([^.,;]{2,30}?))(?=\s+instead\b|\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:no rush|whenever|as soon as possible|asap))(?=\s*(?:,?\s*and\b|[.!?](?:\s|$)|;|$))/i,
  ...EARLY_COMPLETION_PATTERNS,
];

function findCompletionMatch(transcript: string): ExtractedMatch | null {
  for (const pattern of COMPLETION_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const value = (match[2] || match[1]).trim();
      const fullMatch = match[1].trim();
      if (isValidCompletionTime(value)) {
        return {
          value,
          fullMatch,
          startIndex: match.index || 0,
        };
      }
    }
  }
  return null;
}

// High-confidence natural relative timing phrases (e.g. "in the next two weeks").
// The pattern intentionally avoids explicit intent markers like "I'd like it done";
// context checks below prevent past/incident phrases from being misclassified.
const SERVICE_CONTEXT_VERBS = /\b(?:get|need|want|would like|done|completed|finished|installed|repaired|fixed|cut|mowed|cleaned|checked|painted|replaced|removed|trimmed|serviced)\b/i;
const PAST_CONTEXT_MARKERS = /\b(?:ago|last|since|started|broke|snapped|noticed|leaking|was|were|been|has been|had been|have been|would be|could be|should be|got|had|yesterday)\b/i;
const CALLBACK_CONTEXT_MARKERS = /\b(?:call me(?: back)?|you can call me(?: back)?|reach me|contact me|you can reach me)\b/i;
const NEGATIVE_TIMING_PREFIX = /\b(?:for|since|over|the last|the past|last|ago)\s*$/i;
const NATURAL_COMPLETION_RE =
  '\\b(((?:in|within|sometime in|sometime within|sometime this|sometime next|by|this|next|today|tomorrow)\\s+(?:the\\s+)?(?:next|coming|following|upcoming)?\\s*(?:two|three|four|a few|couple of|couple|one|1|2|3|4|5|several)?\\s*(?:days?|weeks?|months?|weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|today|tomorrow|morning|afternoon|evening|night))(?:\\s+(?:or so|about|around|ish|give or take))?)(?=\\s*(?:,?\\s*and\\b|[.!?](?:\\s|$)|;|$))';

function findNaturalCompletionMatch(transcript: string): ExtractedMatch | null {
  const re = new RegExp(NATURAL_COMPLETION_RE, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(transcript)) !== null) {
    const value = (match[2] || match[1]).trim();
    const fullMatch = match[1].trim();
    if (!isValidCompletionTime(value)) {
      continue;
    }
    const preceding = transcript.slice(Math.max(0, match.index - 80), match.index);
    const immediatePrefix = transcript.slice(Math.max(0, match.index - 30), match.index);
    if (NEGATIVE_TIMING_PREFIX.test(immediatePrefix)) {
      continue;
    }
    if (PAST_CONTEXT_MARKERS.test(preceding)) {
      continue;
    }
    if (CALLBACK_CONTEXT_MARKERS.test(immediatePrefix)) {
      continue;
    }
    if (!SERVICE_CONTEXT_VERBS.test(preceding)) {
      continue;
    }
    return {
      value,
      fullMatch,
      startIndex: match.index,
    };
  }
  return null;
}

const CALLBACK_PATTERNS: RegExp[] = [
  /\b((?:call me(?: back)?|you can call me(?: back)?|reach me|contact me)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:i'?m|i am)\s+(?:available|free)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:morning|afternoon|evening|night)s?\s+(?:are|work|is|would|will|'d|'ll)\s+(?:best|good|fine|ok|easier|easiest|prefer(?:red)?)(?:\s+[^.,;]+?)?)(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b(anytime(?:\s+(?:is|works|best|good|fine|after|before|between)\s+[^.,;]+?)?)(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:best time|good time)\s+(?:to|at|in|on|after|before|between|is)\s+[^.,;]+?)(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:you can reach me|reach me|contact me)\s+(?:at|in|on|after|before|between|anytime|morning|afternoon|evening|night)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  ...EARLY_CALLBACK_PATTERNS,
];

function findCallbackMatch(transcript: string): ExtractedMatch | null {
  for (const pattern of CALLBACK_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const rawValue = (match[2] || match[1]).trim();
      const value = rawValue
        .replace(/\s+instead(?:\s+of\s+.*)?$/i, '')
        .replace(/[.,;]\s*$/, '')
        .trim();
      const fullMatch = match[1].trim();
      if (isValidCallbackTime(value)) {
        return {
          value,
          fullMatch,
          startIndex: match.index || 0,
        };
      }
    }
  }
  return null;
}

function findIssueDescription(transcript: string, serviceRequested: string): string | null {
  const detailPatterns = [
    /(?:because|due to|the|it's|its)\s+(?:the\s+)?(?:hinge|handle|door|window|pipe|gutter|roof|floor|wall|ceiling|fence|gate|lock|faucet|sink|toilet|shower|tub|ac|heater|furnace|boiler|electrical|wire|outlet|switch|light|bulb|appliance|machine|device|system|unit)([^.!?]+)/i,
  ];
  for (const pattern of detailPatterns) {
    const match = transcript.match(pattern);
    if (match && match[0]) {
      return match[0].trim();
    }
  }
  return null;
}

function cleanServiceRequest(serviceRequested: string, matches: (ExtractedMatch | null)[]): string {
  const validMatches = matches.filter((m): m is ExtractedMatch => !!m);
  if (validMatches.length === 0) return serviceRequested;

  // Find the earliest full match that appears inside the current service request text.
  let earliestIndex = serviceRequested.length;
  for (const match of validMatches) {
    let idx = serviceRequested.indexOf(match.fullMatch);
    if (idx === -1 && match.value) {
      idx = serviceRequested.indexOf(match.value);
      // If we found the value but not the marker, walk back to swallow a connector/marker.
      if (idx > 0) {
        const prefix = serviceRequested.slice(0, idx);
        const markerMatch = prefix.match(/\s*(?:,|;)?\s*(?:\bat\b|\bby\b|\bon\b|\bin\b|\bcall me\b|\byou can call me\b|\breach me\b|\bcontact me\b|\blocated\b|\baddress\b)\s*$/i);
        if (markerMatch) {
          idx = idx - markerMatch[0].length;
        }
      }
    }
    if (idx !== -1 && idx < earliestIndex) {
      earliestIndex = idx;
    }
  }

  if (earliestIndex >= serviceRequested.length) {
    // No future-field marker found, but still strip common service prefixes
    // so a clean service phrase is returned.
    return stripServicePrefix(serviceRequested).replace(/[.,;:]$/, '').trim();
  }

  let cleaned = serviceRequested.slice(0, earliestIndex).trim();
  cleaned = stripServicePrefix(cleaned);
  cleaned = cleaned.replace(/^[.,;:]\s*/, '').trim();
  cleaned = cleaned.replace(/[.,;:]$/, '').trim();
  // Remove dangling connectors like "and" or "at" left at the end.
  cleaned = cleaned.replace(/\s+(?:and|at|by|on|in)$/i, '').trim();
  return cleaned;
}

function extractServiceRequestCandidate(
  transcript: string,
  customerName?: string
): string | null {
  let s = transcript.trim();
  if (customerName) {
    const idx = s.toLowerCase().indexOf(customerName.toLowerCase());
    if (idx !== -1) {
      s = s.slice(idx + customerName.length).trim();
    }
  }
  // Remove leading punctuation/connectors before stripping service prefixes.
  s = s.replace(/^[.,;:]\s*/, '').trim();
  s = s.replace(/^(?:and|so|then|also)\s+/i, '');
  s = stripServicePrefix(s);

  const matches: (ExtractedMatch | null)[] = [
    findAddressMatch(s),
    findCompletionMatch(s),
    findNaturalCompletionMatch(s),
    findCallbackMatch(s),
  ];
  const earliestMatch = matches
    .filter((m): m is ExtractedMatch => !!m)
    .sort((a, b) => a.startIndex - b.startIndex)[0];

  if (earliestMatch && earliestMatch.startIndex >= 0) {
    s = s.slice(0, earliestMatch.startIndex).trim();
  }

  s = s.replace(/[.,;:]$/, '').trim();
  s = s.replace(/\s+(?:and|at|by|on|in)$/i, '').trim();
  if (isValidServiceRequest(s)) return s;
  return null;
}

function mergeIfMissing(
  intake: IntakeData,
  field: keyof IntakeData,
  candidate: string | null | undefined,
  validator: (text: string) => boolean,
  applied: string[],
  skipped: string[]
): void {
  const existing = (intake as any)[field];
  if (candidate === undefined || candidate === null || candidate.trim() === '') {
    return;
  }
  const trimmed = candidate.trim();
  if (existing && existing.trim && existing.trim().length > 0) {
    skipped.push(field as string);
    return;
  }
  if (!validator(trimmed)) {
    return;
  }
  (intake as any)[field] = trimmed;
  applied.push(field as string);
}

// Map a Simple Mode stage to the canonical scalar it is collecting.
const STAGE_FIELD_MAP: Record<string, keyof IntakeData> = {
  ask_name: 'customerName',
  ask_request: 'request',
  ask_name_reason: 'serviceRequested',
  ask_location: 'serviceAddress',
  ask_completion_time: 'desiredCompletionTime',
  ask_callback_time: 'callbackTime',
};

const CORRECTION_MARKERS = [
  'actually', 'instead', 'not the', 'not a', 'i meant', 'i mean',
  'change that', 'change it', 'make it', 'make that', 'use this',
  'use that', 'sorry', 'correction', 'correct that', 'update',
  'it is', "it's", 'it was'
];

function detectCorrectionIntent(transcript: string): { isCorrection: boolean; confidence: 'high' | 'low' } {
  const lower = transcript.toLowerCase();
  const markerCount = CORRECTION_MARKERS.reduce((count, marker) => {
    // Count multi-word markers once.
    if (lower.includes(marker)) return count + 1;
    return count;
  }, 0);

  // High-confidence: explicit correction markers or a "not X, Y" / "Y, not X" structure.
  const hasNotStructure = /\bnot\s+(?:the\s+)?[a-z]+\b/.test(lower);
  const hasInsteadStructure = /\binstead\b/.test(lower);
  const hasActually = /\bactually\b/.test(lower);
  const hasMeant = /\bi meant\b/.test(lower);
  const highConfidence = markerCount >= 2 || (markerCount >= 1 && (hasNotStructure || hasInsteadStructure));
  const mediumConfidence = hasActually || hasMeant || (markerCount >= 1 && hasNotStructure);

  if (highConfidence || mediumConfidence) {
    return { isCorrection: true, confidence: highConfidence ? 'high' : 'low' };
  }
  return { isCorrection: false, confidence: 'low' };
}

// Extract a replacement service when the caller explicitly corrects the request.
// Examples:
//   "It's the shower, not the toilet" -> "shower repair"
//   "Actually use a lawn cut instead" -> "lawn cut"
function extractCorrectionServiceRequest(transcript: string, existingService?: string): string | null {
  const explicitPatterns = [
    // "Actually it's the shower, not the toilet"
    /\b(?:actually,?\s*it's|actually,?\s*it is|it's|it is|it was|sorry,?\s*it's)\s+(?:a\s+|the\s+)?([a-z][a-z\s\-]+?)(?:,|;|\.\s|\s+not\b|\s+instead\b|\s+and\s+(?:the\s+)?(?:address|call|phone))/i,
    // "Change it to a sink repair", "Make it a shower", "Use 500 Pine Street" (last is caught by address)
    /\b(?:change that to|change it to|make it|make that|use)\s+(?:a\s+|the\s+)?([a-z][a-z\s\-]+?)(?:,|;|\.\s|\s+not\b|\s+instead\b|\s+and\s+(?:the\s+)?(?:address|call|phone))/i,
  ];

  for (const pattern of explicitPatterns) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      let candidate = match[1].trim().replace(/[.,;]$/, '');
      // Strip trailing negated phrase if any leaked in (e.g., "shower, not the toilet").
      candidate = candidate.replace(/\s*,?\s*not\s+.*$/i, '').trim();
      candidate = candidate.replace(/\s*,?\s*instead(?:\s+of\s+.*)?$/i, '').trim();

      const serviceNouns = /\b(shower|toilet|sink|tub|faucet|roof|fence|gate|lock|door|window|pipe|gutter|floor|wall|ceiling|ac|heater|furnace|boiler|garage|light|outlet|switch|wire|appliance|machine|device|lawn|grass|yard)\b/i;
      const actionWords = /\b(repair|repaired|fix|fixed|leak|leaking|broken|broke|stopped|cut|mowed|cleaned|painted|replaced|removed|trimmed|serviced|installed)\b/i;
      const hasServiceNoun = serviceNouns.test(candidate);
      const hasActionWord = actionWords.test(candidate);

      // Reject corrections that do not look like a service at all (e.g., "make it Monday").
      if (!hasServiceNoun && !hasActionWord) {
        continue;
      }

      // If the corrected core is a plain service noun and the original request
      // included action language (repair, fix, leak, leaking), append "repair"
      // to keep the canonical form actionable.
      if (hasServiceNoun && !hasActionWord && actionWords.test(existingService || '')) {
        candidate = `${candidate} repair`;
      }
      if (isValidServiceRequest(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Apply a candidate value to a canonical field. Replacement is allowed when the
 * caller has explicit correction intent or when the utterance is the direct
 * answer to the current stage prompt.
 */
function applyField(
  intake: IntakeData,
  field: keyof IntakeData,
  candidate: string | null | undefined,
  validator: (text: string) => boolean,
  applied: string[],
  skipped: string[],
  isCorrection: boolean,
  isCurrentStageField: boolean
): void {
  if (candidate === undefined || candidate === null || candidate.trim() === '') {
    return;
  }
  const trimmed = candidate.trim();
  if (!validator(trimmed)) {
    return;
  }
  const existing = (intake as any)[field];
  const existingTrimmed = typeof existing === 'string' ? existing.trim() : '';
  if (existingTrimmed.length === 0 || isCorrection || isCurrentStageField) {
    // Don't replace with an identical value to avoid noisy applied logs.
    if (existingTrimmed !== trimmed) {
      (intake as any)[field] = trimmed;
      if (!applied.includes(field as string)) {
        applied.push(field as string);
      }
    }
    return;
  }
  skipped.push(field as string);
}

/**
 * Extract all supported intake fields from a single caller utterance, fill only
 * currently-empty fields, and clean the service request so it does not absorb
 * location/timing/callback text.
 */
export function enrichIntakeFromTranscript(
  rawTranscript: string,
  intake: IntakeData,
  currentStage: string,
  callSid?: string,
  sourceTurnId?: string | number
): SkipAheadResult {
  const transcript = (rawTranscript || '')
    .trim()
    .replace(/\b(p\.?m\.?)\b/gi, 'pm')
    .replace(/\b(a\.?m\.?)\b/gi, 'am');
  const detected: string[] = [];
  const applied: string[] = [];
  const skippedBecauseAlreadyPresent: string[] = [];
  const { isCorrection, confidence } = detectCorrectionIntent(transcript);
  const currentStageField = STAGE_FIELD_MAP[currentStage] || null;

  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] =========================================');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] event: semantic_skip_ahead_extraction');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] callSid:', callSid);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] sourceStage:', currentStage);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] sourceTurnId:', sourceTurnId);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] isCorrection:', isCorrection);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] correctionConfidence:', confidence);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] rawTranscript:', transcript);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] intakeBefore:', JSON.stringify({
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    desiredCompletionTime: intake.desiredCompletionTime,
    callbackTime: intake.callbackTime,
  }, null, 2));
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] Timestamp:', new Date().toISOString());
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] =========================================');

  const name = extractCustomerName(transcript);
  const addressMatch = findAddressMatch(transcript);
  const completionMatch = findCompletionMatch(transcript) ?? findNaturalCompletionMatch(transcript);
  const callbackMatch = findCallbackMatch(transcript);

  if (name) detected.push('customerName');
  if (addressMatch) detected.push('serviceAddress');
  if (completionMatch) detected.push('desiredCompletionTime');
  if (callbackMatch) detected.push('callbackTime');

  // Determine a clean service request value.
  const existingServiceRequested = (intake.serviceRequested || '').trim();
  const existingRequest = (intake.request || '').trim();
  const existingService = existingServiceRequested || existingRequest;
  let cleanedService: string | null = null;

  if (isCorrection && existingService) {
    const correctedService = extractCorrectionServiceRequest(transcript, existingService);
    if (correctedService) {
      cleanedService = correctedService;
      detected.push('serviceRequested');
    }
  }

  if (!cleanedService) {
    if (existingService) {
      cleanedService = cleanServiceRequest(existingService, [
        addressMatch,
        completionMatch,
        callbackMatch,
      ]);
    } else {
      const serviceCandidate = extractServiceRequestCandidate(
        transcript,
        intake.customerName || name || undefined
      );
      if (serviceCandidate) {
        cleanedService = serviceCandidate;
        detected.push('serviceRequested');
      }
    }
  }

  // Always allow service cleaning/replacement because the canonical service must
  // never absorb location/timing/callback text.
  const validCleanedService = cleanedService && cleanedService.trim() && isValidServiceRequest(cleanedService.trim())
    ? cleanedService.trim()
    : null;

  applyField(
    intake,
    'customerName',
    name,
    () => true,
    applied,
    skippedBecauseAlreadyPresent,
    isCorrection,
    currentStageField === 'customerName'
  );

  if (validCleanedService) {
    applyField(
      intake,
      'serviceRequested',
      validCleanedService,
      isValidServiceRequest,
      applied,
      skippedBecauseAlreadyPresent,
      isCorrection,
      true
    );
  }

  // Keep the raw-ish `request` field in sync with the canonical service.
  applyField(
    intake,
    'request',
    intake.serviceRequested,
    isValidServiceRequest,
    applied,
    skippedBecauseAlreadyPresent,
    isCorrection,
    currentStageField === 'request'
  );

  applyField(
    intake,
    'serviceAddress',
    addressMatch?.value,
    isValidServiceAddress,
    applied,
    skippedBecauseAlreadyPresent,
    isCorrection,
    currentStageField === 'serviceAddress'
  );

  applyField(
    intake,
    'desiredCompletionTime',
    completionMatch?.value,
    isValidCompletionTime,
    applied,
    skippedBecauseAlreadyPresent,
    isCorrection,
    currentStageField === 'desiredCompletionTime'
  );

  applyField(
    intake,
    'callbackTime',
    callbackMatch?.value,
    isValidCallbackTime,
    applied,
    skippedBecauseAlreadyPresent,
    isCorrection,
    currentStageField === 'callbackTime'
  );

  const issueDescription = findIssueDescription(transcript, intake.serviceRequested || '');
  if (issueDescription) {
    detected.push('issueDescription');
    applyField(
      intake,
      'issueDescription',
      issueDescription,
      () => true,
      applied,
      skippedBecauseAlreadyPresent,
      isCorrection,
      false
    );
  }

  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] =========================================');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] fieldsDetected:', detected);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] fieldsApplied:', applied);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] fieldsSkippedBecauseAlreadyPresent:', skippedBecauseAlreadyPresent);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] cleanedService:', cleanedService);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] intakeAfter:', JSON.stringify({
    customerName: intake.customerName,
    serviceRequested: intake.serviceRequested,
    issueDescription: intake.issueDescription,
    serviceAddress: intake.serviceAddress,
    desiredCompletionTime: intake.desiredCompletionTime,
    callbackTime: intake.callbackTime,
  }, null, 2));
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] Timestamp:', new Date().toISOString());
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION RESULT] =========================================');

  return { detected, applied, skippedBecauseAlreadyPresent, cleanedService };
}
