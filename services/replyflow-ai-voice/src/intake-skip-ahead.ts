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
  isValidCustomerName,
} from './intake-validation';
import {
  EARLY_COMPLETION_PATTERNS,
  EARLY_CALLBACK_PATTERNS,
} from './early-timing-patterns';

export interface IntakeData {
  customerName?: string;
  nameRefused?: boolean;
  serviceRequested?: string;
  request?: string;
  issueDescription?: string;
  serviceAddress?: string;
  locationRefused?: boolean;
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect whether a turn at ask_name is a bare name answer with no meaningful
 * service/location/timing content. Used to prevent a name-only utterance from
 * contaminating unrelated canonical fields.
 */
function isNameOnlyTurn(transcript: string, customerName: string): boolean {
  const name = customerName.trim().toLowerCase();
  const text = transcript.trim().toLowerCase();
  if (!name || !text.includes(name)) return false;
  let remaining = text.replace(new RegExp(escapeRegex(name), 'g'), '').trim();
  remaining = remaining
    .replace(/^[,.\s]*(?:my name is|my name's|name is|i am|i'm|this is|it is|it's|hi|hello|hey|yes|yeah|yep|um|uh|ok|okay|alright|all right|well|so)[,.\s]*/i, '')
    .replace(/[,.\s]*(?:here)[,.\s]*$/i, '')
    .replace(/^[,.\s]+/, '')
    .replace(/[,.\s]+$/, '');
  return remaining === '';
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

const NAME_REFUSAL_PATTERNS = [
  /\b(?:i['"]?d\s+rather\s+not\s+(?:give|say|tell)\s+(?:my\s+)?name|i['"]?d\s+rather\s+not\s+say)\b/i,
  /\b(?:i\s+don['"]?t\s+want\s+to\s+(?:give|say|tell)\s+(?:my\s+)?name)\b/i,
  /\b(?:i['"]?d\s+prefer\s+not\s+to\s+(?:say|give\s+(?:my\s+)?name|tell\s+(?:my\s+)?name))\b/i,
  /\bi['"]?d\s+rather\s+not\b/i,
  /\b(?:no\s+name|no\s+name\s+given|no\s+name\s+please)\b/i,
  /\bi['"]?d\s+like\s+to\s+(?:stay|remain)\s+anonymous\b/i,
  /\bi\s+want\s+to\s+(?:stay|remain)\s+anonymous\b/i,
  /\bi['"]?d\s+like\s+to\s+keep\s+this\s+anonymous\b/i,
];

export function isNameRefusal(transcript: string): boolean {
  const lower = (transcript || '').trim().toLowerCase();
  return NAME_REFUSAL_PATTERNS.some(pattern => pattern.test(lower));
}

const LOCATION_REFUSAL_PATTERNS = [
  /\bi\s+don['"]?t\s+want\s+to\s+(?:give|provide|share)\s+(?:my\s+|the\s+)?(?:exact\s+)?address\b/i,
  /\bi['"]?d\s+rather\s+not\s+(?:give|provide|share)\s+(?:my\s+|the\s+)?(?:exact\s+)?address\b/i,
  /\bi['"]?d\s+prefer\s+not\s+to\s+(?:give|provide|share)\s+(?:my\s+|the\s+)?(?:exact\s+)?address\b/i,
  /\bi\s+won['"]?t\s+(?:give|provide|share)\s+(?:my\s+|the\s+)?(?:exact\s+)?address\b/i,
  /\bi\s+can['"]?t\s+(?:give|provide|share)\s+(?:my\s+|the\s+)?(?:exact\s+)?address\b/i,
];

export function isLocationRefusal(transcript: string): boolean {
  const lower = (transcript || '').trim().toLowerCase();
  return LOCATION_REFUSAL_PATTERNS.some(pattern => pattern.test(lower));
}

function extractCustomerName(transcript: string): string | null {
  const trimmed = transcript.trim();
  if (isNameRefusal(trimmed)) return null;
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
      if (normalized && normalized.length > 1 && !isFillerPhrase(normalized) && !NAME_SERVICE_BLOCKERS.test(normalized) && isValidCustomerName(normalized)) {
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
  // Privacy-aware partial location: city, neighborhood, or broad area.
  // Accepts phrases like "I'm in Pittsburgh", "Near Squirrel Hill", "Bethel Park".
  {
    pattern:
      /\b(?:i['"]?m\s+in|i\s+am\s+in|we['"]?re\s+in|we\s+are\s+in|located\s+in|somewhere\s+in|in\s+the\s+area\s+of|near)\s+([a-z][a-z\s\-]+?)(?=\s*(?:,?\s*and\b|[.!?](?:\s|$)|;|$))/i,
    type: 'area',
  },
  // Standalone city/neighborhood area (e.g. "Bethel Park", "Just Pittsburgh for now").
  // The prefix is case-insensitive by hand; the city tokens must be capitalized
  // to avoid matching normal sentences.
  {
    pattern:
      /\b(?:[jJ][uU][sS][tT]\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s*(?:for\s+now|,?\s*and\b|[.!?](?:\s|$)|;|$))/,
    type: 'area',
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
  if (type === 'area') {
    // A usable partial location must be more than a vague directional word
    // and should not be a day/time word that commonly appears in other answers.
    const nonLocationWords = /^(here|there|somewhere|nearby|close|around|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night|today|tomorrow|yes|yeah|okay|ok|whenever|anytime)$/i;
    return trimmed.length > 2 && !nonLocationWords.test(trimmed);
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

export function extractPartialLocation(transcript: string): string | null {
  const match = findAddressMatch(transcript);
  return match?.value || null;
}

export function hasUsableLocation(transcript: string): boolean {
  return extractPartialLocation(transcript) !== null;
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
  // Vague completion phrases: keep the full semantic phrase, e.g. "Whenever you can".
  /\b((?:whenever\s+you\s+(?:can|could)|whenever|whenever\s+is\s+(?:fine|good|ok)|no\s+rush|as\s+soon\s+as\s+(?:you\s+can|possible)|asap))(?=\s*(?:,?\s*and\b|[.!?](?:\s|$)|;|$))/i,
  ...EARLY_COMPLETION_PATTERNS,
];

function findCompletionMatch(transcript: string): ExtractedMatch | null {
  for (const pattern of COMPLETION_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      // Early completion patterns capture only the suffix in group 1. Use the full match
      // when group 1 is a suffix so phrases like "whenever you can" are preserved.
      const rawValue = match[2] || (match[1] && match[1].startsWith(' ') ? match[0] : match[1]);
      const value = (rawValue || '').trim();
      const fullMatch = (match[0] || match[1] || '').trim();
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
  /\b(any(?:\s)?time(?:\s+(?:is|works|best|good|fine|ok|after|before|between)(?:\s+[^.,;]+?)?)?)(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:call me(?: back)?|you can call me(?: back)?|reach me|contact me)?\s+whenever(?:\s+(?:is|works|best|good|fine|ok))?)(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:best time|good time)\s+(?:to|at|in|on|after|before|between|is)\s+[^.,;]+?)(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:you can reach me|reach me|contact me)\s+(?:at|in|on|after|before|between|anytime|morning|afternoon|evening|night)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  ...EARLY_CALLBACK_PATTERNS,
];

function normalizeCallbackTime(value: string): string {
  const lower = value.toLowerCase().trim();
  // Preserve explicit constraints such as "Anytime after 4".
  if (/\b(after|before|between|from|until)\b/.test(lower) || /\d/.test(lower)) {
    return value.replace(/[.,;]\s*$/, '').trim();
  }
  // Collapse plain vague callback phrases to canonical "Anytime".
  if (/^(?:any(?:\s)?time|whenever)(?:\s+(?:is|works|best|good|fine|ok))?\b/.test(lower)) {
    return 'Anytime';
  }
  return value.replace(/[.,;]\s*$/, '').trim();
}

function findCallbackMatch(transcript: string): ExtractedMatch | null {
  for (const pattern of CALLBACK_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      const rawValue = (match[2] || match[1]).trim();
      const value = normalizeCallbackTime(rawValue)
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
  const nameRefused = isNameRefusal(transcript);
  const locationRefused = isLocationRefusal(transcript);

  // A bare name answer at ask_name must not be interpreted as a location, timing,
  // or service request. This is the primary field-ownership guard for name-only turns.
  const nameOnlyTurn =
    currentStage === 'ask_name' &&
    !!intake.customerName &&
    isNameOnlyTurn(transcript, intake.customerName);

  let addressMatch = findAddressMatch(transcript);
  let completionMatch = findCompletionMatch(transcript) ?? findNaturalCompletionMatch(transcript);
  let callbackMatch = findCallbackMatch(transcript);

  if (nameOnlyTurn) {
    addressMatch = null;
    completionMatch = null;
    callbackMatch = null;
    console.log('[NAME-ONLY TURN GUARD] event: name_only_turn_detected');
    console.log('[NAME-ONLY TURN GUARD] customerName:', intake.customerName);
    console.log('[NAME-ONLY TURN GUARD] action: cleared non-name extractions');
    console.log('[NAME-ONLY TURN GUARD] Timestamp:', new Date().toISOString());
    console.log('[NAME-ONLY TURN GUARD] =========================================');
  }

  if (name) detected.push('customerName');
  if (nameRefused) {
    detected.push('nameRefused');
    intake.nameRefused = true;
    // A high-confidence name refusal replaces any same-turn customerName candidate
    // and clears a stale name that may have been written before extraction ran.
    intake.customerName = '';
  }
  if (addressMatch) detected.push('serviceAddress');
  if (locationRefused) {
    detected.push('locationRefused');
    intake.locationRefused = true;
  }
  if (completionMatch) detected.push('desiredCompletionTime');
  if (callbackMatch) detected.push('callbackTime');

  // Determine a clean service request value. Only derive/fill the service field
  // when the current stage is actually collecting the request, so a city-only
  // answer at ask_location does not overwrite the service.
  const existingServiceRequested = (intake.serviceRequested || '').trim();
  const existingRequest = (intake.request || '').trim();
  const existingService = existingServiceRequested || existingRequest;
  const isServiceStage = ['ask_name', 'ask_name_reason', 'ask_request'].includes(currentStage);
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
    } else if (isServiceStage) {
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

  // Only allow service replacement when we are on a service stage or correcting.
  let validCleanedService = cleanedService && cleanedService.trim() && isValidServiceRequest(cleanedService.trim())
    ? cleanedService.trim()
    : null;

  // A bare name-only answer must never become a service request.
  if (nameOnlyTurn) {
    validCleanedService = null;
  }

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

  // A valid name extracted after an explicit refusal clears the refusal flag.
  if (applied.includes('customerName') && intake.nameRefused) {
    console.log('[name_refusal_cleared_by_explicit_name]', { newName: intake.customerName, source: 'enrichIntakeFromTranscript' });
    intake.nameRefused = false;
  }

  if (validCleanedService) {
    applyField(
      intake,
      'serviceRequested',
      validCleanedService,
      isValidServiceRequest,
      applied,
      skippedBecauseAlreadyPresent,
      isCorrection,
      isServiceStage
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
