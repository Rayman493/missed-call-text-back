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
  isMetaUtterance,
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

// Connector-style matches (at/call me/address is/etc.) begin a trailing field,
// so the service should end before the fullMatch starts. Service-inclusive
// matches (e.g. "I'd like it done next Friday") contain the service text before
// the value, so the service should end at the start of the value.
const CONNECTOR_PREFIX_RE = /^(?:at\s+|@\s+|call me(?: back)?\s+|you can call me(?: back)?\s+|reach me\s+|contact me\s+|located\s+(?:at\s+)?|the address is\s+|address is\s+|my address is\s+|it'?s at\s+|located at\s+)/i;

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
  const prefixRe = /^(?:(?:yeah|yep|yes|okay|ok|alright|well|so|uh|um)[,\s]+|(?:i want to|i would like to|i'd like to|i need to|i need(?!\s+(?:it|this|that|them|one)\b)|i'm(?:\s+just)?\s+looking to|i am(?:\s+just)?\s+looking to|(?:just\s+)?looking to|calling about|i'm calling about|i am calling about|need someone to|to get my|get my)\s+)/i;
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
  // "I'd rather not give/say/tell my name" plus ASR pronoun distortions and missing subject.
  // Tolerates: they'd, we'd, I'd, and bare "Rather not give my name".
  /\b(?:i['"]?d|they['"]?d|we['"]?d)?\s*rather\s+not\s+(?:give|say|tell)\s+(?:my\s+)?name\b/i,
  // Generic "I'd rather not" / "rather not say" fallback.
  /\b(?:i['"]?d|they['"]?d|we['"]?d)?\s*rather\s+not\b/i,
  // "I don't want to give/say/tell/provide my name"
  /\b(?:i\s+)?don['"]?t\s+want\s+to\s+(?:give|say|tell|provide)\s+(?:my\s+)?name\b/i,
  // "I'd/I prefer not to say" / "I'd prefer not to give my name"
  /\b(?:i['"]?d\s+)?prefer\s+not\s+to\s+(?:say|give\s+(?:my\s+)?name|tell\s+(?:my\s+)?name)\b/i,
  // "Can we skip my name?" / "Let's skip my name"
  /\b(?:can\s+we|let['"]?s|could\s+we)\s+skip\s+(?:my\s+)?name\b/i,
  // "No name" / "No name given"
  /\bno\s+name(?:\s+(?:given|please))?\b/i,
  // "You don't need my name" / "Don't need my name"
  /\b(?:you\s+)?(?:don['"]?t|do\s+not)\s+need\s+(?:my\s+)?name\b/i,
  // "I'd like to stay/remain anonymous" and variants
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
    /\bmy name is\s+(.+?)(?:\.|,|;|—|–|\band\b|$)/i,
    /\bmy name's\s+(.+?)(?:\.|,|;|—|–|\band\b|$)/i,
    /\bi am\s+(.+?)(?:\.|,|;|—|–|\band\b|$)/i,
    /\bi'm\s+(.+?)(?:\.|,|;|—|–|\band\b|$)/i,
    /\bthis is\s+(.+?)(?:\.|,|;|—|–|\band\b|$)/i,
    /\bhi[,\s]+my name is\s+(.+?)(?:\.|,|;|—|–|\band\b|$)/i,
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

const ADDRESS_PATTERNS: { pattern: RegExp; type: string; combine?: boolean }[] = [
  {
    // Numbered-street correction: "it's 937, not 931, Pine Hollow Road" /
    // "it's 937 Pine Hollow Road". The corrected house number is captured
    // and reattached to the street phrase.
    pattern:
      /\bit'?s\s+(?:not\s+\d+\s*,?\s*(?:it'?s\s+)?|it\s+is\s+)?(\d[\d\s-]*)\s*,?\s*(?:not\s+\d[\d\s-]*\s*,?\s*)?([^.!?\n]*?\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl)\b[^.!?\n]*?)(?=\s*(?:,?\s*\band\b|[.!?](?:\s|$)|;|$))/i,
    type: 'explicit-correction',
    combine: true,
  },
  {
    pattern:
      /\b(?:address is|located at|it's at|its at|job is at|job's at|service is at|service location is|the address is|the property is at|my address is)\s+([^.!?\n]+?)(?=\s*(?:,?\s*\band\b|[.!?](?:\s|$)|;|$))/i,
    type: 'explicit',
  },
  {
    pattern:
      /\b(?:at|@)\s+(\d[^.!?\n]*?)(?=\s*(?:,?\s*\band\b|[.!?](?:\s|$)|;|$))/i,
    type: 'bare-numbered',
  },
  {
    pattern:
      /\b(\d+(?:[\s-]+\d+)*\s+(?:[a-z0-9'-]+\s+){1,6}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|way|court|ct|place|pl)(?:\s+(?:north|south|east|west|northeast|northwest|southeast|southwest|n|s|e|w|ne|nw|se|sw|apartment|apt|suite|ste|unit|#)(?:\s*[a-z0-9#-]+)?)?(?:\s*,?\s*(?:in\s+)?[A-Za-z][A-Za-z\s,]+?)?)(?=\s*(?:,?\s*(?:and\b|i\s+(?:want|need|would|can)\b|i['’]?d\b|call\b|you\s+can\s+call\b)|[.!?](?:\s|$)|;|$))/i,
    type: 'street-address',
  },
  // Privacy-aware partial location: city, neighborhood, or broad area.
  // Accepts phrases like "I'm in Pittsburgh", "Near Squirrel Hill", "Bethel Park".
  {
    pattern:
      /\b(?:i['"]?m\s+in|i\s+am\s+in|we['"]?re\s+in|we\s+are\s+in|located\s+in|somewhere\s+in|in\s+the\s+area\s+of|near)\s+([a-z][a-z\s\-]+?)(?=\s*(?:,?\s*\band\b|[.!?](?:\s|$)|;|$))/i,
    type: 'area',
  },
  // Standalone city/neighborhood area (e.g. "Bethel Park", "Just Pittsburgh for now").
  // The prefix is case-insensitive by hand; the city tokens must be capitalized
  // to avoid matching normal sentences.
  {
    pattern:
      /\b(?:[jJ][uU][sS][tT]\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)(?=\s*(?:for\s+now|,?\s*\band\b|[.!?](?:\s|$)|;|$))/,
    type: 'area',
  },
];

function isConfidentEarlyServiceAddress(
  text: string,
  type: string
): boolean {
  if (!isValidServiceAddress(text)) return false;
  const trimmed = text.trim().toLowerCase();
  if (type === 'explicit' || type === 'explicit-correction') return true;
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
  for (const { pattern, type, combine } of ADDRESS_PATTERNS) {
    const match = transcript.match(pattern);
    if (match && match[1]) {
      let candidate = combine && match[2]
        ? `${match[1].trim()} ${match[2].trim()}`
        : match[1]
          .replace(/,\s*(?:i\s+(?:want|need|would|can)\b|i['’]?d\b|call\b|you\s+can\s+call\b).*$/i, '')
          .trim();
      candidate = candidate.trim();
      if (isConfidentEarlyServiceAddress(candidate, type)) {
        const value = candidate
          .replace(/[.,;]\s*$/, '')
          .replace(/\s+instead(?:\s+of\s+.*)?$/i, '')
          .replace(/[\s,]+(?:and|in|at|on|for)\s*$/i, '')
          .replace(/[.,;]\s*$/, '')
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
  /\b((?:i'd like|i would like|i want|i need)\s+it\s+(?:done|completed|finished)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  // Same intent without a preposition, e.g. "I'd like it done Friday" or "I want it done tomorrow morning".
  /\b((?:i'd like|i would like|i want|i need)\s+(?:it\s+)?(?:done|completed|finished)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:i'd like|i would like|i want|i need)\s+(?:someone|somebody)\s+(?:to come\s+)?(?:out|here)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:can you|could you)\s+(?:come|get here|make it)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  // Correction/short-form completions: "make it Monday instead" or "I need it Saturday".
  /\b((?:make it|make that|set it for|set it to)\s+([^.,;]+?))(?=\s+instead\b|\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:i'd like|i would like|i want|i need)\s+it\s+(?:by\s+|on\s+|for\s+)?([^.,;]{2,30}?))(?=\s+instead\b|\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  // Standalone temporal words with optional "if possible" / "if you can" qualifier.
  // Captures "tomorrow", "tomorrow if possible", "today if possible", "this week if possible".
  /\b((?:today|tomorrow|tonight)(?:\s+if\s+(?:possible|you\s+(?:can|could)))?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i,
  // Weekday and week/month phrases, including judgment scaffolds:
  // "Friday", "tomorrow would be great", "next week is fine",
  // "sometime later this week", "later this week".
  /\b((?:(?:sometime|later)\s+)*(?:this|next)\s+(?:week|month|weekend))(?:\s+(?:is|works|would|will|'d|'ll)\s+(?:be\s+)?(?:fine|good|best|ok(?:ay)?|better|great|perfect|easier|ideal))?(?=\s*[.!?;,]|$)/i,
  /\b((?:mon|tues|wednes|thurs|fri|satur|sun)day(?:\s+(?:morning|afternoon|evening))?(?:\s+(?:is|works?|would|will|'d|'ll|sounds?|seems?)\s+(?:be\s+|to\s+be\s+)?(?:fine|good|best|ok(?:ay)?|better|great|perfect|easier|ideal))?)(?=\s*[.!?;,]|\s+\band\b|$)/i,
  /\b((?:today|tomorrow|tonight))(?:\s+(?:would|will|is|works|'d|'ll)\s+(?:be\s+)?(?:great|good|fine|best|ok(?:ay)?|better|perfect|easier|ideal))?(?=\s*[.!?;,]|$)/i,
  // Vague completion phrases: keep the full semantic phrase, e.g. "Whenever you can".
  /\b((?:whenever\s+you\s+(?:can|could)|whenever|whenever\s+is\s+(?:fine|good|ok)|no\s+rush|as\s+soon\s+as\s+(?:you\s+can|possible)|asap))(?=\s*(?:,?\s*\band\b|[.!?](?:\s|$)|;|$))/i,
  ...EARLY_COMPLETION_PATTERNS,
];

function findCompletionMatch(transcript: string): ExtractedMatch | null {
  for (const pattern of COMPLETION_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(transcript)) !== null) {
      // A temporal phrase immediately after a callback marker belongs to the
      // callback field ("call me Friday"), and one after a past-incident verb
      // belongs to the problem history ("the pipe started leaking Friday").
      const immediatePrefix = transcript.slice(Math.max(0, (match.index || 0) - 30), match.index || 0);
      if (CALLBACK_CONTEXT_MARKERS.test(immediatePrefix) || INCIDENT_HISTORY_PREFIX.test(immediatePrefix) || PAST_MARKER_PREFIX.test(immediatePrefix)) {
        continue;
      }
      if (CLAUSE_NEGATION_RE.test(clauseContaining(transcript, match.index || 0))) {
        continue;
      }
      // A bare weekday/daypart directly preceded by "next/this/coming" belongs
      // to the longer natural phrase ("by next Tuesday") — let the natural
      // completion matcher claim the full form instead of truncating to
      // "tuesday".
      if (/\b(?:next|this|coming|following|upcoming|every|by|in|on|within|sometime)\s*$/i.test(immediatePrefix)) {
        continue;
      }
      // Early completion patterns capture only the suffix in group 1. Use the full match
      // when group 1 is a suffix so phrases like "whenever you can" are preserved.
      const rawValue = match[2] || (match[1] && /^[\s,;]/.test(match[1]) ? match[0] : match[1]);
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
  '\\b(((?:in|within|sometime in|sometime within|sometime this|sometime next|by|on|this|next|today|tomorrow)\\s+(?:the\\s+)?(?:next|coming|following|upcoming)?\\s*(?:two|three|four|a few|couple of|couple|one|1|2|3|4|5|several)?\\s*(?:days?|weeks?|months?|weekend|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|today|tomorrow|morning|afternoon|evening|night))(?:\\s+(?:or so|about|around|ish|give or take))?)(?=\\s*(?:,?\\s*\\band\\b|[.!?](?:\\s|$)|;|$))';

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

// Callback extraction patterns. `valueIsFullMatch` marks patterns whose group 1
// is only a trailing suffix (early patterns) — for those the whole match[0] is
// the candidate so no mid-word fragment is ever used as a field value.
// `rejectIfPrecededByCompletionIntent` suppresses bare temporal matches that are
// really the tail of a completion-time phrase ("I need it done tomorrow").
const NEGATION_PREFIX = /\b(?:don'?t|dont|do\s+not|didn'?t|didnt|won'?t|wont|never|not)\s*$/i;

const CALLBACK_PATTERN_ENTRIES: { pattern: RegExp; valueIsFullMatch: boolean; rejectIfPrecededByCompletionIntent?: boolean; rejectIfPrecededByIncident?: boolean; rejectIfPrecededByNegation?: boolean }[] = [
  { pattern: /\b((?:call me(?: back)?|you can call me(?: back)?|reach me|contact me)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false, rejectIfPrecededByNegation: true },
  { pattern: /\b((?:i'?m|i am)\s+(?:available|free)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false },
  { pattern: /\b((?:morning|afternoon|evening|night)s?\s+(?:are|work|is|would|will|'d|'ll)\s+(?:best|good|fine|ok(?:ay)?|easier|easiest|prefer(?:red)?)(?:\s+[^.,;]+?)?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false },
  // "call after 3" / "call tomorrow morning" — bare "call" without "me",
  // common in negated restatements ("don't call me in the morning; call after 3").
  { pattern: /\b((?:call\s*back|callback|call|you\s+can\s+call)\s+(?!me\b)(?:back\s+)?(?:after|before|at|in|on|between|around|anytime|whenever|tomorrow|today|tonight|morning|afternoon|evening)\s+[^.,;]*?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false, rejectIfPrecededByNegation: true },
  // "anytime" answers including comma-qualified constraints
  // ("Anytime, but preferably later in the afternoon"). "ok" is word-bounded
  // via ok(?:ay)? so it cannot truncate mid-word.
  { pattern: /\b(any(?:\s)?time(?:\s+(?:is|works|best|good|fine|ok(?:ay)?|after|before|between|today|tomorrow|tonight|morning|afternoon|evening|this\s+week|next\s+week|(?:mon|tues|wednes|thurs|fri|satur|sun)day)(?:\s+[^.,;]+?)?)?(?:\s*,\s*(?:but\s+)?[^.,;]+?)?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false },
  { pattern: /\b((?:call me(?: back)?|you can call me(?: back)?|reach me|contact me)?\s+whenever(?:\s+(?:is|works|best|good|fine|ok(?:ay)?))?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false },
  { pattern: /\b((?:best time|good time)\s+(?:to|at|in|on|after|before|between|is)\s+[^.,;]+?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false },
  { pattern: /\b((?:you can reach me|reach me|contact me)\s+(?:at|in|on|after|before|between|anytime|morning|afternoon|evening|night)\s+([^.,;]+?))(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false },
  // Bare temporal callback answers: "tomorrow after 2", "this afternoon",
  // "tomorrow morning" — common at the ask_callback_time stage.
  { pattern: /\b((?:today|tomorrow|tonight|(?:mon|tues|wednes|thurs|fri|satur|sun)day|morning|afternoon|evening)(?:\s+(?:morning|afternoon|evening))?(?:\s+(?:after|before|around|at|by)\s+\d+(?::\d+)?\s*(?:am|pm|a\.m\.?|p\.m\.?)?)?)(?=\s*,?\s*\band\b|[.!?](?:\s|$)|;|$)/i, valueIsFullMatch: false, rejectIfPrecededByCompletionIntent: true, rejectIfPrecededByIncident: true },
  ...EARLY_CALLBACK_PATTERNS.map((pattern) => ({ pattern, valueIsFullMatch: true })),
];

const COMPLETION_INTENT_PREFIX = /\b(?:done|completed|finished|out|here|by|on|in|for|it|installed|repaired|fixed|someone|somebody)\s*$/i;
// Past-incident verbs right before a temporal word mean the timing describes
// when the problem happened ("cables snapped this morning"), not when to call.
const INCIDENT_HISTORY_PREFIX = /\b(?:snapped|broke|broken|burst|started|leaked|leaking|dripped|dripping|happened|failed|cracked|fell|collapsed|stopped|froze|frozen|overflowed|overflowing|backed\s+up|went\s+out|died|popped|came\s+off|began|shut\s+(?:off|down)|cut\s+out|gave\s+out|quit|noticed|appeared|heard)\b(?:\s+(?:this|that|last|yesterday|earlier|just|a|an|the|one|my))*\s*$/i;

// A temporal word directly preceded by a past-time marker ("yesterday
// morning", "last night") is incident history, never a callback preference.
const PAST_MARKER_PREFIX = /\b(?:yesterday|ago|earlier|last\s+(?:night|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\s*$/i;

// Whole-answer incident prose — used to stop the stage scalar fallback from
// raw-writing "the furnace shut off around 2 pm" into a timing field.
const INCIDENT_ANSWER_RE = /\b(?:snapped|broke|broken|burst|started|leak(?:ed|ing|s)?|dripp?ed|dripping|drips?|happened|failed|cracked|fell|collapsed|stopped|froze|frozen|overflowed|overflowing|backed\s+up|went\s+out|died|popped|came\s+off|began|shut\s+(?:off|down)|cut\s+out|gave\s+out|quit|noticed|appeared|yesterday|\bago\b|last\s+(?:night|week|month|year)|earlier\s+today)\b/i;

// Clause-level negation: a temporal match inside a negated clause is a
// contradiction, not a preference ("don't call me in the morning; call
// after 3", "I don't need it tomorrow, next week is fine"). Bare "not" is
// deliberately excluded so "not before noon" still parses.
const CLAUSE_NEGATION_RE = /\b(?:don'?t|do\s+not|didn'?t|won'?t|never|ain'?t|isn'?t|aren'?t|shouldn'?t|can'?t)\b/i;

function clauseContaining(transcript: string, index: number): string {
  const start = Math.max(
    transcript.lastIndexOf('.', index),
    transcript.lastIndexOf('!', index),
    transcript.lastIndexOf('?', index),
    transcript.lastIndexOf(';', index),
    transcript.lastIndexOf(',', index)
  ) + 1;
  const rest = transcript.slice(index);
  const endMatch = rest.search(/[.!?;,]/);
  const end = endMatch === -1 ? transcript.length : index + endMatch;
  return transcript.slice(start, end);
}

function normalizeCallbackTime(value: string): string {
  let cleaned = value.trim()
    // Strip correction scaffolding that is not part of the requested time
    // ("make the callback ... instead", "change that to ...").
    .replace(/^(?:actually[,.\s]*)?(?:please\s+)?(?:make|change|set)\s+(?:the\s+)?(?:call\s*back|callback|that|it)\s+(?:to\s+|for\s+)?/i, '')
    // Strip trigger scaffolding that early patterns keep in match[0].
    .replace(/^(?:you can reach me|you can call me(?:\s+back)?|you can call|reach me|contact me|call me(?:\s+back)?|call\s*back|callback|call(?!\s+me\b)|call\s+me)\s+/i, '')
    .replace(/^(?:i'?m|i am)\s+(?:available|free)\s+/i, '')
    .replace(/^(?:best time|good time)\s+(?:to|at|in|on|is)\s+/i, '')
    // "call back after 5" leaves a "back" residue once the trigger is stripped.
    .replace(/^back\s+(?=\S)/i, '')
    .replace(/\s*[,.\s]*\binstead\s*$/i, '')
    .trim();
  const lower = cleaned.toLowerCase();
  // Canonicalize "anytime/whenever ..." answers: collapse filler scaffolding
  // ("is okay", "works best") to canonical "Anytime" while preserving a real
  // constraint tail ("after 4", "preferably later in the afternoon").
  const anytimeMatch = lower.match(/^(?:any\s?time|whenever)\b(.*)$/i);
  if (anytimeMatch) {
    let tail = cleaned.slice(cleaned.length - anytimeMatch[1].length).trim();
    // Iteratively strip leading filler/scaffold words and separators.
    let prev: string;
    do {
      prev = tail;
      tail = tail
        .replace(/^(?:is|works|work|are|best|good|fine|ok(?:ay)?|easier|easiest|preferred|alright|all right)\b/i, '')
        .replace(/^[,.\s]+/, '')
        .replace(/^but\s+/i, '')
        .trim();
    } while (tail !== prev);
    if (tail.length === 0) return 'anytime';
    // Constraint tails keep their phrasing: "after 4", "in the afternoon".
    if (/^(?:after|before|between|from|until|at|in|on|by)\b/i.test(tail)) {
      return `anytime ${tail}`.replace(/[.,;]\s*$/, '').trim();
    }
    return `anytime, ${tail}`.replace(/[.,;]\s*$/, '').trim();
  }
  // Preserve explicit constraints such as "after 4".
  if (/\b(after|before|between|from|until)\b/.test(lower) || /\d/.test(lower)) {
    return cleaned.replace(/[.,;]\s*$/, '').trim();
  }
  return cleaned.replace(/[.,;]\s*$/, '').trim();
}

function findCallbackMatch(transcript: string): ExtractedMatch | null {
  for (const { pattern, valueIsFullMatch, rejectIfPrecededByCompletionIntent, rejectIfPrecededByIncident, rejectIfPrecededByNegation } of CALLBACK_PATTERN_ENTRIES) {
    // Iterate every match in the utterance so a negated first clause
    // ("don't call me in the morning; call after 3") can be skipped in
    // favor of the later positive instruction.
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(transcript)) !== null) {
      if (rejectIfPrecededByCompletionIntent) {
        const preceding = transcript.slice(Math.max(0, (match.index || 0) - 40), match.index || 0);
        if (COMPLETION_INTENT_PREFIX.test(preceding)) {
          continue;
        }
      }
      if (rejectIfPrecededByIncident) {
        const preceding = transcript.slice(Math.max(0, (match.index || 0) - 40), match.index || 0);
        if (INCIDENT_HISTORY_PREFIX.test(preceding) || PAST_MARKER_PREFIX.test(preceding)) {
          continue;
        }
      }
      if (rejectIfPrecededByNegation) {
        const preceding = transcript.slice(Math.max(0, (match.index || 0) - 20), match.index || 0);
        if (NEGATION_PREFIX.test(preceding)) {
          continue;
        }
      }
      if (CLAUSE_NEGATION_RE.test(clauseContaining(transcript, match.index || 0))) {
        continue;
      }
      const rawValue = (valueIsFullMatch ? match[0] : (match[2] || match[1])).trim();
      const value = normalizeCallbackTime(rawValue)
        .replace(/\s+instead(?:\s+of\s+.*)?$/i, '')
        .replace(/[.,;]\s*$/, '')
        .trim();
      const fullMatch = match[0].trim();
      if (isValidCallbackTime(value) && value.length > 1) {
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

function findIssueDescription(transcript: string, serviceRequested: string): ExtractedMatch | null {
  const detailPatterns = [
    /(?:because|due to|the|it's|its)\s+(?:the\s+)?(?:hinge|handle|door|window|pipe|gutter|roof|floor|wall|ceiling|fence|gate|lock|faucet|sink|toilet|shower|tub|ac|heater|furnace|boiler|electrical|wire|outlet|switch|light|bulb|appliance|machine|device|system|unit)([^.!?]+)/i,
    // Capture additional context after the main service request: "hole about two feet wide",
    // "pipe repair", "patched and painted", etc.
    /(?:hole|opening|gap|crack|leak|break|damage|section)\s+(?:about|around|of|in|after)?\s*[^.!?]{5,80}/i,
    /(?:patched|painted|repaired|replaced|installed|removed|trimmed|serviced|cut|mowed|cleaned|checked)(?:\s+and\s+(?:patched|painted|repaired|replaced|installed|removed|trimmed|serviced|cut|mowed|cleaned|checked))?[^.!?]{0,60}/i,
    // Capture spatial/positional detail phrases such as "underneath the cabinet",
    // "behind the wall", "next to the sink". Deliberately exclude "in the/at the/
    // on the/by the" because they usually describe the service location, not the
    // problem detail (e.g. "a plumber in the kitchen", "someone at the house").
    /(?:under|underneath|behind|inside|outside|below|above|next to|near)\s+(?:the\s+)?[^.!?]{3,80}/i,
  ];
  for (const pattern of detailPatterns) {
    const match = transcript.match(pattern);
    if (match && match[0]) {
      const value = match[0].trim();
      const words = value.match(/[a-z0-9'-]+/gi) || [];
      const repeatedClause = /\b(?:the\s+)?([a-z][a-z'-]*)\s+and\s+(?:the\s+)?\1\b/i.test(value);
      const danglingFixtureClause = /^the\s+(?:hinge|handle|door|window|pipe|gutter|roof|floor|wall|ceiling|fence|gate|lock|faucet|sink|toilet|shower|tub|ac|heater|furnace|boiler|electrical|wire|outlet|switch|light|bulb|appliance|machine|device|system|unit)\s+and\b/i.test(value);
      if (words.length < 3 || repeatedClause || danglingFixtureClause) continue;
      // Don't let the issue description become the whole service request
      if (value.toLowerCase() === serviceRequested.trim().toLowerCase()) continue;
      return {
        value,
        fullMatch: value,
        startIndex: match.index || 0,
      };
    }
  }
  const serviceWords = serviceRequested.match(/[a-z0-9'-]+/gi) || [];
  const hasProblemContext = /\b(?:storm|fell|fallen|onto|leak|leaking|drip|dripping|constantly|broken|broke|damage|damaged|crack|cracked|snapped|clogged|overflowing|won't|cannot|can't)\b/i.test(serviceRequested);
  if (serviceWords.length >= 6 && hasProblemContext) {
    return {
      value: serviceRequested.trim(),
      fullMatch: serviceRequested.trim(),
      startIndex: Math.max(0, transcript.toLowerCase().indexOf(serviceRequested.trim().toLowerCase())),
    };
  }
  return null;
}

function cleanServiceRequest(serviceRequested: string, matches: (ExtractedMatch | null)[]): string {
  const validMatches = matches.filter((m): m is ExtractedMatch => !!m);
  if (validMatches.length === 0) return serviceRequested;

  // Find the earliest value start inside the current service request text,
  // using the full match to locate the exact occurrence and then offsetting
  // to the start of the extracted value (not the whole matched phrase).
  let earliestIndex = serviceRequested.length;
  for (const match of validMatches) {
    let idx = -1;
    if (match.value && serviceRequested.indexOf(match.fullMatch) !== -1) {
      const fullIdx = serviceRequested.indexOf(match.fullMatch);
      const valueIdxInFull = match.fullMatch.indexOf(match.value);
      idx = fullIdx + (valueIdxInFull >= 0 ? valueIdxInFull : 0);
    } else if (match.value) {
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
  customerNames?: (string | undefined)[]
): string | null {
  let s = transcript.trim();
  // Remove every known name token (word-bounded so "A" can't cut "garage")
  // plus any name-introduction / name-restatement scaffolding left behind.
  for (const customerName of customerNames || []) {
    if (!customerName) continue;
    const nameRe = new RegExp(`\\b${escapeRegex(customerName.trim())}\\b`, 'gi');
    s = s.replace(nameRe, ' ');
  }
  s = s
    .replace(/\b(?:i\s+said|i\s+told\s+you|i\s+already\s+(?:said|told\s+you))\s+/gi, ' ')
    .replace(/\bis\s+my\s+name\b/gi, ' ')
    .replace(/(?:my name is|my name's|name is|i'?m|i am|this is|it'?s|it is)\s*(?=[.,;]|$)/gi, ' ')
    .replace(/^[.,;:\s]+/, '')
    .replace(/^(?:hi|hello|hey)\b[\s,;.!?]*/i, '')
    .replace(/^(?:and|so|then|also)\s+/i, '')
    .trim();

  const matches: (ExtractedMatch | null)[] = [
    findAddressMatch(s),
    findCompletionMatch(s),
    findNaturalCompletionMatch(s),
    findCallbackMatch(s),
  ];
  const validMatches = matches
    .filter((m): m is ExtractedMatch => !!m)
    .sort((a, b) => a.startIndex - b.startIndex);

  // The service candidate is whatever lies OUTSIDE the extracted scalar
  // values: text before the first match's extracted value plus text after the
  // last match. Connector-style full matches ("at", "call me") begin the field
  // itself; service-inclusive matches ("I need it done next Friday") keep the
  // service scaffolding before the extracted value. Service text may also
  // follow a match ("I'm at 937 Pine and I need a plumber").
  if (validMatches.length > 0) {
    const first = validMatches[0];
    const last = validMatches[validMatches.length - 1];
    const valueIndex = first.fullMatch.indexOf(first.value);
    const valueStart = valueIndex >= 0 ? valueIndex : 0;
    const valueOffset = CONNECTOR_PREFIX_RE.test(first.fullMatch) ? 0 : valueStart;
    const prefix = s.slice(0, first.startIndex + valueOffset);
    const suffix = s.slice(last.startIndex + last.fullMatch.length);
    s = `${prefix} ${suffix}`;
  }

  s = s.replace(/^[.,;:\s]+/, '').replace(/^(?:and|so|then|also)\s+/i, '');
  s = s
    .replace(/^(?:hi|hello|hey)\b[\s,;.!?]*/i, '')
    .replace(/^(?:i'?m|i am|this is|it'?s|it is)\s+(?=\S)/i, '')
    .trim();
  s = stripServicePrefix(s);
  s = s.replace(/(?:[.,;:\s])+$/, '').trim();
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

/**
 * Same-turn self-correction: "Tomorrow morning. Make that tomorrow after 2 PM."
 * returns the corrected tail "tomorrow after 2 PM" so scalar extraction resolves
 * the latest intended value rather than the first or the whole sentence.
 */
const SAME_TURN_CORRECTION_RE = /\b(?:make\s+that|make\s+it|scratch\s+that|sorry[,.]?\s*(?:i\s+mean(?:t)?\s+)?|actually[,.]?\s*|i\s+mean(?:t)?\s+|i\s+meant\s+to\s+say\s+|no[,.]?\s+|instead[,.]?\s*|let'?s\s+go\s+with\s+|rather[,.]?\s*)\b/gi;

// Continuations after a bare "no" that are conversational, not corrections:
// "no rush", "no problem", "no worries", "no need", etc.
const NO_NON_CORRECTION_TAIL_RE = /^(?:rush|hurry|problem|problems|worries|worry|pressure|preference|particular|specific|deadline|need|offense|big\s+deal|biggie|stress|concern|emergency|trouble|issue|hassle)\b/i;

function splitCorrectionTail(transcript: string): string | null {
  const matches = [...transcript.matchAll(SAME_TURN_CORRECTION_RE)];
  // Use the LAST marker that is followed by real content. A trailing
  // "instead." alone is a postfix marker ("call me Friday instead") whose
  // corrected value precedes it, so it must not split.
  for (let i = matches.length - 1; i >= 0; i--) {
    const tail = transcript
      .slice((matches[i].index || 0) + matches[i][0].length)
      .replace(/^[.,;\s]+/, '')
      .replace(/(?:\s+instead)?[.,;!?\s]*$/i, '')
      .trim();
    if (tail.length < 2) continue;
    // A bare "no" marker followed by a conversational continuation
    // ("no rush", "no problem") is a polite answer, not a correction.
    if (/^no\b/i.test(matches[i][0]) && NO_NON_CORRECTION_TAIL_RE.test(tail)) {
      continue;
    }
    return tail;
  }
  return null;
}

/**
 * Explicit self-identification / name correction:
 *   "I said Michael Turner is my name"
 *   "I already told you my name is X"
 *   "No, my name is X" / "My name is actually X"
 * Returns the name candidate when the caller clearly restates their name.
 *
 * Weak intro forms ("it's X", "i'm X", "this is X") only run when
 * opts.allowNameIntro is set (name-collecting stages); on other stages a
 * phrase like "it's urgent" must never be read as a name.
 */
export function extractExplicitNameCorrection(
  transcript: string,
  opts?: { allowNameIntro?: boolean }
): string | null {
  const t = transcript.trim();
  const strongPatterns = [
    /\b(?:i\s+said|i\s+already\s+(?:said|told\s+you)|i\s+told\s+you)\s+(.+?)\s+is\s+my\s+name\b/i,
    /\b(?:i\s+said|i\s+already\s+(?:said|told\s+you)|i\s+told\s+you)\s+(?:my\s+name\s+is\s+)(.+?)(?:[.,;]|$)/i,
    // Correction-marked name restatements only — a bare "my name is X" is a
    // normal intro handled by name extraction, not an explicit correction.
    /\b(?:no|nope|nah)[,.]?\s+(?:my\s+name\s+is|my\s+name's)\s+(?:actually\s+)?(.+?)(?:[.,;]|\s+and\b|$)/i,
    /\b(?:my\s+name\s+is|my\s+name's)\s+actually\s+(.+?)(?:[.,;]|\s+and\b|$)/i,
    // Bare "I said X" / "I told you X" restatement — the candidate still has to
    // pass isValidCustomerName, so "I said I don't know" is rejected naturally.
    /\b(?:i\s+said|i\s+told\s+you|i\s+already\s+(?:said|told\s+you))\s+(?:it'?s\s+|it\s+is\s+)?(.+?)(?:[.,;]|\s+and\b|$)/i,
  ];
  const introPatterns = [
    /\b(?:it'?s|it\s+is)\s+(?:actually\s+)?(.+?)(?:[.,;]|\s+and\b|$)/i,
    /\b(?:i'?m|i\s+am)\s+(?:actually\s+)?(.+?)(?:[.,;]|\s+and\b|$)/i,
    /\b(?:this\s+is)\s+(?:actually\s+)?(.+?)(?:[.,;]|\s+and\b|$)/i,
  ];
  const patterns = opts?.allowNameIntro ? [...strongPatterns, ...introPatterns] : strongPatterns;
  for (const pattern of patterns) {
    const match = t.match(pattern);
    if (match && match[1]) {
      const candidate = normalizeNameCandidate(match[1].trim());
      if (candidate && isValidCustomerName(candidate) && !NAME_SERVICE_BLOCKERS.test(candidate)) {
        return candidate;
      }
    }
  }
  return null;
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

export function detectCorrectionIntent(transcript: string): { isCorrection: boolean; confidence: 'high' | 'low' } {
  const lower = transcript.toLowerCase();
  const markerCount = CORRECTION_MARKERS.reduce((count, marker) => {
    // Count multi-word markers once.
    if (lower.includes(marker)) return count + 1;
    return count;
  }, 0);

  // High-confidence: explicit correction markers or a "not X, Y" / "Y, not X" structure.
  // Contraction negations ("don't need it tomorrow") count as not-structure so a
  // negated statement followed by a restatement can overwrite a prior value.
  const hasNotStructure = /\b(?:not|n'?t)\s+(?:the\s+|a\s+|an\s+)?[a-z]+\b/.test(lower);
  const hasInsteadStructure = /\binstead\b/.test(lower);
  const hasActually = /\bactually\b/.test(lower);
  const hasMeant = /\bi meant\b/.test(lower);
  const highConfidence = markerCount >= 2 || (markerCount >= 1 && (hasNotStructure || hasInsteadStructure));
  const mediumConfidence = hasActually || hasMeant || hasNotStructure || (markerCount >= 1 && hasNotStructure);

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
  // Negated-fixture relocation: "it's not the toilet. The leak is under the
  // kitchen sink." The negated noun is dropped and the relocated problem
  // clause supplies the corrected service ("kitchen sink leak").
  const relocation = transcript.match(
    /\b(?:it'?s|it is|its)\s+not\s+(?:the|a|an)\s+[a-z][a-z\s\-']*?[.,;]\s*(?:the\s+|my\s+)?(leak|issue|problem|break|crack|drip|damage|noise|smell|flood|damp|mold)\s+is\s+(?:in|inside|under|at|behind|near|on|around|coming\s+from|by)\s+(?:the\s+|my\s+)?([a-z][a-z\s\-']+?)(?=\s*(?:[.,;]|$))/i
  );
  if (relocation && relocation[1] && relocation[2]) {
    const candidate = `${relocation[2].trim()} ${relocation[1].trim()}`.trim();
    if (isValidServiceRequest(candidate)) return candidate;
  }

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
    // A re-uttered identical value is already present, not a new application.
    if (existingTrimmed === trimmed) {
      skipped.push(field as string);
      return;
    }
    // Don't replace with an identical value to avoid noisy applied logs.
    if (existingTrimmed !== trimmed) {
      if (isCorrection && existingTrimmed.length > 0) {
        console.log('[INTAKE CORRECTION]', {
          field,
          action: 'replace',
          oldValue: existingTrimmed,
          newValue: trimmed,
        });
      }
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
 * Stage-gate helpers: expose the semantic candidate for a scalar stage so the
 * answer validator can accept an utterance whose raw text is not itself a
 * clean scalar but contains one ("I'm not sure. Whenever you have availability
 * is fine." -> "whenever").
 */
export function extractCompletionTimeCandidate(transcript: string): string | null {
  return (findCompletionMatch(transcript) ?? findNaturalCompletionMatch(transcript))?.value || null;
}

export function extractCallbackTimeCandidate(transcript: string): string | null {
  return findCallbackMatch(transcript)?.value || null;
}

/**
 * Normalize clearly-vague completion answers to a canonical short phrase.
 * Handles common ASR distortions ("have the ability" -> "availability").
 * Only rewrites unambiguous vagueness; never invents a date.
 */
export function normalizeVagueCompletion(value: string, transcript: string): string {
  const v = (value || '').trim();
  const t = (transcript || '').toLowerCase();
  const vLower = v.toLowerCase();
  // "whenever ..." / "anytime ..." lead-ins with conversational scaffold tails
  // ("is fine", "works best", "you can") normalize to a canonical short value.
  if (/^(?:whenever|any\s?time)\b/.test(vLower)) {
    if (/\b(?:availability|available|the ability|abilities)\b/.test(vLower + ' ' + t)) {
      return 'Whenever available';
    }
    return 'Whenever';
  }
  if (/^no\s+rush\b/.test(vLower)) return 'No rush';
  if (/^as\s+soon\s+as\s+(?:possible|you\s+can)\b|^asap\b/.test(vLower)) return 'As soon as possible';
  return v;
}

// Verbs/phrases that mark a sentence as the service-request carrier.
const SERVICE_INTENT_RE = /\b(?:i\s+need|i\s+want|i'?d\s+like|i\s+would\s+like|i'?m\s+looking|i\s+am\s+looking|looking\s+(?:for|to)|need\s+some(?:one|body)|calling\s+(?:about|because)|get\s+(?:my|some(?:one|body))|fix|repair|replace|install|inspect|check(?:ing)?\s+(?:my|the|a)|clean|remove|cut|mow|paint|patch|service|haul|unclog)\b/i;

/**
 * Split a multi-sentence service utterance into a concise reason (first
 * service-intent sentence) and supporting details (remaining sentences).
 * Single-sentence input returns the whole string as the reason.
 */
export function splitServiceAndDetails(serviceText: string): { reason: string; details: string | null } {
  const text = (serviceText || '').trim();
  if (!text) return { reason: '', details: null };
  const tightenReason = (s: string): string =>
    stripServicePrefix(s)
      .replace(/^(?:someone|somebody)\s+to\s+/i, '')
      .replace(/^[.,;:\s]+/, '')
      .replace(/[.,;:]\s*$/, '')
      .trim();
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
  if (sentences.length <= 1) {
    // Single sentence: split off a trailing "because/due to/which is" detail clause.
    const clause = text.match(/^(.*?)(?:\s*,?\s*(?:because|due to|since)\s+(.+))$/i);
    if (clause && clause[1] && clause[2] && SERVICE_INTENT_RE.test(clause[1])) {
      return { reason: tightenReason(clause[1]), details: clause[2].trim() };
    }
    // "... and it's starting to damage the wood" — the and-it continuation is
    // a supporting fact, not part of the concise reason.
    const andClause = text.match(/^(.*?),?\s+and\s+(it'?s\s+.+|it\s+is\s+.+|it\s+has\s+.+|it\s+keeps\s+.+|it\s+seems\s+.+)$/i);
    // The head may be a problem statement rather than an explicit request
    // ("my sink is leaking under the cabinet") — accept either shape.
    const PROBLEM_STATE_RE = /\b(?:leak|drip|broken|broke|crack|damage|flood|clog|overflow|stuck|rattle|noise|fail|shut|stopped|frozen|mold|damp|spark|smell|sag|rot|peel|chip|dent|scratch)/i;
    if (andClause && andClause[1] && andClause[2] &&
        (SERVICE_INTENT_RE.test(andClause[1]) || PROBLEM_STATE_RE.test(andClause[1]))) {
      return { reason: tightenReason(andClause[1]), details: andClause[2].trim() };
    }
    return { reason: tightenReason(text), details: null };
  }
  const reason = tightenReason(sentences[0]);
  const details = sentences.slice(1).join(' ').replace(/[.,;]\s*$/, '').trim();
  return { reason, details: details.length > 0 ? details : null };
}

// Sentences whose content belongs to a structured field must never be absorbed
// into Details. These markers identify clause ownership, not problem context.
const CALLBACK_OWNED_CLAUSE_RE = /\b(?:don'?t|do\s+not|didn'?t|please\s+don'?t|never)\s+call\b|\bcall\s*back\b|\bcallback\b|\bcall\s+me\b|\byou\s+can\s+call\b|\breach\s+me\b|\bcontact\s+me\b|\bphone\s+me\b|\btext\s+me\b/i;
const ADDRESS_OWNED_CLAUSE_RE = /\b(?:my\s+address\s+is|the\s+address\s+is|address\s+is|i'?m\s+at\b|i\s+am\s+at\b|we'?re\s+at\b|we\s+are\s+at\b|located\s+at|live\s+at|i\s+live\s+at|the\s+property\s+is\s+at|it'?s\s+at)\b/i;
const CORRECTION_SCAFFOLD_CLAUSE_RE = /\b(?:i\s+(?:gave|told)\s+you\s+the\s+wrong|the\s+wrong\s+(?:address|name|number|time|day)|i\s+meant?\b|i\s+said\b|make\s+(?:that|it|the)\b|change\s+(?:that|it|the)\b|scratch\s+that\b|\binstead\b|let\s+me\s+(?:correct|fix)\b)/i;
// A clause that is ONLY a timing expression (no problem/incident content) is a
// timing-field answer, not a detail. Incident-history wording ("it shut off
// around 2 pm yesterday") stays eligible as a detail.
const TIMING_OWNED_CLAUSE_RE = /^\s*(?:(?:yeah|yes|yep|okay|ok|sure|well|so|um|uh)[,.\s]*)*(?:sometime|anytime|whenever|today|tomorrow|tonight|this\s+(?:week|weekend|morning|afternoon|evening)|next\s+(?:week|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|morning|afternoon|evening|no\s+rush|as\s+soon\s+as\s+(?:possible|you\s+can)|asap)\b[^.!?]*$/i;

/**
 * Extract detail sentences from a transcript: sentences that carry supporting
 * facts but are not the name carrier, not the service carrier, and do not
 * overlap an extracted scalar (address/completion/callback) match.
 */
function extractDetailSentences(
  transcript: string,
  consumed: { customerName?: string; serviceSentence?: string; scalarFullMatches: string[]; alreadyExtracted?: string[] }
): string | null {
  const sentences = transcript
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(Boolean);
  const details: string[] = [];
  const lower = (s: string) => s.toLowerCase().replace(/[.,;!?\s]+$/g, '').trim();
  const consumedScalars = consumed.scalarFullMatches.map(m => m.toLowerCase());
  const alreadyExtracted = (consumed.alreadyExtracted || [])
    .map(m => (m || '').toLowerCase().replace(/[.,;!?\s]+$/g, '').trim())
    .filter(m => m.length > 2);
  let serviceSentenceConsumed = false;

  for (const sentence of sentences) {
    const sLower = sentence.toLowerCase();
    // Skip the name carrier sentence
    if (consumed.customerName && sLower.includes(consumed.customerName.toLowerCase())) continue;
    // Skip sentences overlapping an extracted scalar match
    if (consumedScalars.some(m => m && sLower.includes(m))) continue;
    // Skip sentences whose information is already captured by the regex detail
    // extractor or the concise service reason (prevents "behind the toilet.
    // There is water dripping behind the toilet" duplication).
    if (alreadyExtracted.some(m => sLower.includes(m))) continue;
    // Skip meta/filler/refusal sentences
    if (isMetaUtterance(sentence) || isNameRefusal(sentence) || isLocationRefusal(sentence)) continue;
    // Skip clauses owned by other structured fields or by correction
    // scaffolding — callback directives ("don't call me in the morning"),
    // address carriers ("the address is ...", "I'm at ..."), and correction
    // wrappers ("I gave you the wrong address", "make that ... instead")
    // are field content, not supporting details.
    if (CALLBACK_OWNED_CLAUSE_RE.test(sentence)) continue;
    if (ADDRESS_OWNED_CLAUSE_RE.test(sentence)) continue;
    if (CORRECTION_SCAFFOLD_CLAUSE_RE.test(sentence)) continue;
    if (TIMING_OWNED_CLAUSE_RE.test(sentence)) continue;
    // First sentence carrying service intent is the reason carrier, not a detail
    if (!serviceSentenceConsumed && SERVICE_INTENT_RE.test(sentence)) {
      serviceSentenceConsumed = true;
      continue;
    }
    // Skip pure name-introduction sentences ("my name is X")
    if (/^(?:hi|hello|hey)[,\s]*(?:my name is|my name's|this is|i'?m|i am)\s+\S/i.test(sentence)) continue;
    // Need at least 3 words to be a meaningful detail — unless the sentence
    // carries explicit symptom signal ("it's rattling.", "handle feels
    // loose"), which is real supporting context even at 2 words.
    const detailWordCount = (sentence.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
    if (detailWordCount < 3 && !/\b(?:rattl\w*|leak\w*|drip\w*|squeak\w*|grind\w*|vibrat\w*|smell\w*|spark\w*|loose|stuck|broken|crack\w*|pool\w*|swell\w*|snap(?:ped)?|clog\w*|overflow\w*|soaked|frozen|flicker\w*|noisy|loud)\b/i.test(sentence)) continue;
    details.push(sentence.replace(/[.,;!?\s]+$/, ''));
  }
  if (details.length === 0) return null;
  // Dedupe while preserving order
  const seen = new Set<string>();
  const unique = details.filter(d => {
    const k = lower(d);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique.join('. ').trim() || null;
}

/**
 * Merge detail text: preserve existing facts and append non-duplicate new
 * sentences. An explicit correction replaces the details entirely.
 */
function mergeDetails(existing: string | undefined, incoming: string | null, isCorrection: boolean): string | undefined {
  if (!incoming) return existing;
  if (isCorrection) return incoming;
  const oldText = (existing || '').trim();
  if (!oldText) return incoming;
  const existingSentences = oldText.split(/(?<=[.!?])\s+/).map(s => s.trim().toLowerCase().replace(/[.,;!?]+$/, ''));
  const newSentences = incoming.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => {
    const k = s.toLowerCase().replace(/[.,;!?]+$/, '');
    // Skip exact duplicates and sentences already contained in an existing one.
    return k.length > 0 && !existingSentences.includes(k) && !existingSentences.some(e => e.includes(k));
  });
  if (newSentences.length === 0) return oldText;
  return [oldText.replace(/[.,;!?]+$/, ''), ...newSentences].join('. ').trim();
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

  // Meta-conversation guard: channel checks and conversational repair
  // utterances must never produce field candidates or overwrite values.
  if (isMetaUtterance(transcript)) {
    console.log('[INTAKE META REJECTION] =========================================');
    console.log('[INTAKE META REJECTION] stage:', currentStage);
    console.log('[INTAKE META REJECTION] rawTranscript:', transcript);
    console.log('[INTAKE META REJECTION] action: reprompt_current_stage_no_field_mutation');
    console.log('[INTAKE META REJECTION] Timestamp:', new Date().toISOString());
    console.log('[INTAKE META REJECTION] =========================================');
    return { detected, applied, skippedBecauseAlreadyPresent };
  }

  const correctionTail = splitCorrectionTail(transcript);
  const detectedCorrection = detectCorrectionIntent(transcript);
  // A same-turn correction tail ("... make that X") counts as correction intent
  // even when the marker list does not fire (e.g. bare "No, X").
  const isCorrection = detectedCorrection.isCorrection || !!correctionTail;
  const confidence = detectedCorrection.confidence;
  const currentStageField = STAGE_FIELD_MAP[currentStage] || null;

  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] =========================================');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] event: semantic_skip_ahead_extraction');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] callSid:', callSid);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] sourceStage:', currentStage);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] sourceTurnId:', sourceTurnId);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] isCorrection:', isCorrection);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] correctionConfidence:', confidence);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] correctionTail:', correctionTail);
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

  const isNameStageEarly = ['ask_name', 'ask_name_reason'].includes(currentStage);
  const explicitName = extractExplicitNameCorrection(transcript, { allowNameIntro: isNameStageEarly });
  // Same-turn name correction whose corrected half is a bare name:
  // "My name is Jason — sorry, Jason Miller" -> tail "Jason Miller".
  const correctionTailName = (() => {
    if (!isNameStageEarly || !correctionTail) return null;
    const candidate = normalizeNameCandidate(correctionTail);
    if (
      candidate &&
      isValidCustomerName(candidate) &&
      !NAME_SERVICE_BLOCKERS.test(candidate) &&
      !findAddressMatch(candidate)
    ) {
      return candidate;
    }
    return null;
  })();
  // Filler-prefixed bare name ("Uh, Daniel Harris") at a name stage: the whole
  // utterance reduces to a valid name with no service/location/timing content.
  const bareName = (() => {
    if (!isNameStageEarly) return null;
    const candidate = normalizeNameCandidate(transcript);
    if (
      candidate &&
      isValidCustomerName(candidate) &&
      !NAME_SERVICE_BLOCKERS.test(candidate) &&
      !findAddressMatch(transcript) &&
      !SERVICE_INTENT_RE.test(transcript) &&
      !findCompletionMatch(transcript) &&
      !findCallbackMatch(transcript)
    ) {
      return candidate;
    }
    return null;
  })();
  const nameRefused = isNameRefusal(transcript);
  // A name refusal ("No name", "I'd rather not say") owns the whole utterance:
  // no name candidate may be extracted from its correction tail or fallback.
  const name = nameRefused ? null : (explicitName || correctionTailName || extractCustomerName(transcript) || bareName);
  const locationRefused = isLocationRefusal(transcript);

  // A bare name answer at ask_name must not be interpreted as a location, timing,
  // or service request. This is the primary field-ownership guard for name-only turns.
  const nameOnlyTurn =
    currentStage === 'ask_name' &&
    !!intake.customerName &&
    isNameOnlyTurn(transcript, intake.customerName);

  // Name containment: at non-name stages, a name candidate should only be written
  // if it is a clear correction of a previously garbled/unknown name. This prevents
  // garbled or misheard names from contaminating the customerName field when the
  // caller is actually answering a different stage question.
  const isNameStage = ['ask_name', 'ask_name_reason'].includes(currentStage);
  const containNameAtNonNameStage = !isNameStage && name && !isCorrection && !explicitName;

  // Scalar extraction with same-turn correction support. When a correction
  // tail exists ("... make that tomorrow after 2"), a tail match wins for its
  // field; fields with no tail match fall back to full-transcript extraction
  // in fill-only mode so the superseded head value cannot overwrite them.
  // A temporal correction tail names exactly one field, but a multi-sentence
  // tail may carry corrections for several fields ("... the address is 220 Oak
  // Street. I need it Saturday and call me tomorrow afternoon instead"). Split
  // the tail into segments and classify each: anaphoric "it" refers to the job
  // (completion), "call me"/"reach me" markers mean callback, and an
  // unmarked temporal tail defaults to the current stage's field.
  // The anaphora is tested on the full transcript because splitCorrectionTail
  // consumes the marker itself ("make it Monday" → tail "Monday").
  const COMPLETION_ANAPHORA_RE = /\b(?:make|change)\s+it\b|\bi\s+(?:need|want|would\s+like|'?d\s+like)\s+it\b|\bit\s+done\b/i;
  const completionAnaphora = COMPLETION_ANAPHORA_RE.test(transcript);
  const tailIsCallbackContext =
    !!correctionTail &&
    (CALLBACK_CONTEXT_MARKERS.test(transcript) || currentStageField === 'callbackTime') &&
    !completionAnaphora;
  const tailIsCompletionContext =
    !!correctionTail && !tailIsCallbackContext &&
    (currentStageField === 'desiredCompletionTime' || completionAnaphora ||
      /\b(?:done|completed|finished|out|here|install|repair|fix)\b/i.test(correctionTail));
  const tailMatches: { serviceAddress: ExtractedMatch | null; desiredCompletionTime: ExtractedMatch | null; callbackTime: ExtractedMatch | null } | null =
    correctionTail ? { serviceAddress: null, desiredCompletionTime: null, callbackTime: null } : null;
  if (correctionTail && tailMatches) {
    const tailSegments = correctionTail
      .split(/(?<=[.!?])\s+|(?=\b(?:call me|you can call me|reach me|contact me)\b)/i)
      .map(s => s.trim())
      .filter(Boolean);
    // Two passes: segments with explicit markers claim their field first;
    // unmarked temporal segments then default to the current stage's field
    // only if that field is still unclaimed, otherwise they try the sibling
    // temporal field. This keeps "make that Friday, and call me after 3" from
    // assigning Friday to the callback that "call me after 3" already owns.
    const marked: string[] = [];
    const unmarked: string[] = [];
    for (const segment of tailSegments) {
      if (CALLBACK_CONTEXT_MARKERS.test(segment) || COMPLETION_ANAPHORA_RE.test(segment)) {
        marked.push(segment);
      } else {
        unmarked.push(segment);
      }
    }
    // Each segment feeds at most ONE temporal field: try the preferred field
    // first and only fall through to the sibling when the preferred match is
    // absent or already claimed.
    const fillFromSegment = (
      segment: string,
      fields: ('callbackTime' | 'desiredCompletionTime')[]
    ) => {
      if (!tailMatches!.serviceAddress) {
        tailMatches!.serviceAddress = findAddressMatch(segment);
      }
      for (const f of fields) {
        if (tailMatches![f]) continue;
        const m = f === 'callbackTime'
          ? findCallbackMatch(segment)
          : (findCompletionMatch(segment) ?? findNaturalCompletionMatch(segment));
        if (m) {
          tailMatches![f] = m;
          break;
        }
      }
    };
    for (const segment of marked) {
      const segIsCallback = CALLBACK_CONTEXT_MARKERS.test(segment);
      fillFromSegment(segment, segIsCallback
        ? ['callbackTime', 'desiredCompletionTime']
        : ['desiredCompletionTime', 'callbackTime']);
    }
    for (const segment of unmarked) {
      // An unmarked tail answers the question currently being asked; "make it"
      // anaphora targets completion even at the callback stage. If the
      // preferred field is already claimed by a marked sibling, the sibling
      // field still gets its shot.
      const preferCallback = currentStageField === 'callbackTime' && !completionAnaphora;
      const preferCompletion = currentStageField === 'desiredCompletionTime' || completionAnaphora;
      if (preferCallback) {
        fillFromSegment(segment, ['callbackTime', 'desiredCompletionTime']);
      } else if (preferCompletion) {
        fillFromSegment(segment, ['desiredCompletionTime', 'callbackTime']);
      } else {
        fillFromSegment(segment, ['desiredCompletionTime', 'callbackTime']);
      }
    }
  }
  const tailUsable = (m: ExtractedMatch | null, field: keyof IntakeData): ExtractedMatch | null => {
    if (!m) return null;
    if (field === currentStageField) return m;
    // Tail matches are produced by the deliberate two-pass segment
    // classification above — a match stored for a field was assigned to that
    // field, so scaffold presence is no longer required.
    return m;
  };

  // A full-transcript match whose value text lives inside the correction tail
  // is the same span - suppress it for the side the tail does not target.
  const tailLower = correctionTail ? correctionTail.toLowerCase() : null;
  const overlapsTail = (m: ExtractedMatch | null): boolean =>
    !!m && !!tailLower && m.value.trim().length > 0 && tailLower.includes(m.value.trim().toLowerCase());

  const fullAddress = findAddressMatch(transcript);
  const fullCompletionRaw = findCompletionMatch(transcript) ?? findNaturalCompletionMatch(transcript);
  const fullCallbackRaw = findCallbackMatch(transcript);
  const fullCompletion = tailIsCallbackContext && overlapsTail(fullCompletionRaw) ? null : fullCompletionRaw;
  const fullCallback = tailIsCompletionContext && overlapsTail(fullCallbackRaw) ? null : fullCallbackRaw;

  let addressMatch = tailMatches ? (tailUsable(tailMatches.serviceAddress, 'serviceAddress') || fullAddress) : fullAddress;
  let completionMatch = tailMatches ? (tailUsable(tailMatches.desiredCompletionTime, 'desiredCompletionTime') || fullCompletion) : fullCompletion;
  let callbackMatch = tailMatches ? (tailUsable(tailMatches.callbackTime, 'callbackTime') || fullCallback) : fullCallback;

  // Stage-answer ownership: a bare temporal answer at a timing stage belongs
  // to the field being asked. The sibling timing field may only be filled by
  // an explicit scaffold — callback language ("call me", "anytime", "works
  // best") at the completion stage, or service-intent verbs before the match
  // ("I need it done by Monday") at the callback stage. A deliberate tail
  // assignment is always trusted.
  const CALLBACK_SCAFFOLD_RE = /\b(?:call|reach|contact|phone|any\s?time|whenever|available|free|best\s+time|good\s+time|works?|best|fine|easier|prefer)\b/i;
  if (
    currentStageField === 'callbackTime' &&
    completionMatch &&
    !(tailMatches && tailMatches.desiredCompletionTime === completionMatch) &&
    !SERVICE_CONTEXT_VERBS.test(transcript.slice(0, completionMatch.startIndex))
  ) {
    completionMatch = null;
  }
  if (
    currentStageField === 'desiredCompletionTime' &&
    callbackMatch &&
    !(tailMatches && tailMatches.callbackTime === callbackMatch) &&
    !CALLBACK_SCAFFOLD_RE.test(callbackMatch.fullMatch)
  ) {
    callbackMatch = null;
  }

  // Per-field correction flags: a tail match for the field is an explicit
  // correction, and so is any full-transcript match while the utterance carries
  // correction intent — multi-sentence corrections ("Actually it's the shower.
  // The address is 220 Oak. Call me tomorrow instead") must replace every
  // matched field, not only the final tail. Superseded-head protection comes
  // from tail-priority match selection and the overlap guards above.
  const correctionFor = (field: keyof IntakeData, tailMatch: ExtractedMatch | null): boolean =>
    !!tailMatch || isCorrection;

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
    applied.push('nameRefused');
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
    } else if (isServiceStage && !nameRefused) {
      // A name-refusal utterance must never be reinterpreted as a service request.
      const serviceCandidate = extractServiceRequestCandidate(
        transcript,
        [intake.customerName, name]
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

  // Split a multi-sentence service candidate into a concise reason plus
  // supporting details ("I need X repaired. It hums when I turn it on.").
  let detailFromService: string | null = null;
  if (validCleanedService) {
    const split = splitServiceAndDetails(validCleanedService);
    if (split.details && split.reason && isValidServiceRequest(split.reason)) {
      detailFromService = split.details;
      validCleanedService = split.reason;
      console.log('[INTAKE DETAILS SPLIT] =========================================');
      console.log('[INTAKE DETAILS SPLIT] reason:', validCleanedService);
      console.log('[INTAKE DETAILS SPLIT] details:', detailFromService);
      console.log('[INTAKE DETAILS SPLIT] Timestamp:', new Date().toISOString());
      console.log('[INTAKE DETAILS SPLIT] =========================================');
    }
  }

  // Extract an additional details phrase BEFORE applying the service request so
  // the service request can be split from its detail (e.g. "My kitchen sink is
  // leaking underneath the cabinet" -> service "My kitchen sink is leaking",
  // details "underneath the cabinet").
  // Only split on spatial/positional detail phrases (under, behind, next to, etc.)
  // to avoid stripping work verbs or address text from the request.
  const issueDescription = validCleanedService
    ? findIssueDescription(transcript, validCleanedService)
    : null;
  const SPATIAL_PREFIX = /^(?:under|underneath|behind|inside|outside|below|above|next to|near)\b/i;
  const isSpatialDetail = issueDescription && SPATIAL_PREFIX.test(issueDescription.value);
  if (isSpatialDetail && issueDescription.value) {
    const serviceWithoutDetail = cleanServiceRequest(validCleanedService, [issueDescription]);
    if (serviceWithoutDetail && isValidServiceRequest(serviceWithoutDetail)) {
      validCleanedService = serviceWithoutDetail;
    }
  }

  // Sentence-level details: supporting-fact sentences that are not the name,
  // service, or scalar carriers. This preserves volunteered context such as
  // "There's water pooling around the bottom and it seems to be getting worse."
  // Both tail-resolved and full-transcript scalar matches are consumed so a
  // superseded correction head ("Call me tomorrow morning. Make that ...") is
  // not re-captured as a detail.
  const scalarFullMatches = [addressMatch, completionMatch, callbackMatch, fullAddress, fullCompletion, fullCallback]
    .filter((m): m is ExtractedMatch => !!m)
    .map(m => m.fullMatch);
  const transcriptDetails = extractDetailSentences(transcript, {
    customerName: name || intake.customerName,
    scalarFullMatches,
    alreadyExtracted: [issueDescription?.value || '', validCleanedService || '', detailFromService || ''],
  });
  // Merge detail sources: service-split details, regex detail, sentence details.
  // A detail equal to the concise reason is still kept when it carries problem
  // context (the findIssueDescription fallback intentionally reuses the service
  // sentence when it is the only problem description).
  const detailParts = [detailFromService, issueDescription?.value || null, transcriptDetails]
    .filter((d): d is string => !!d && d.trim().length > 0);
  // Drop parts whose content is already contained inside another part so a
  // fact captured by the regex extractor ("the door is stuck halfway") is not
  // repeated after the sentence-level detail that already includes it.
  const normalizedPart = (s: string) => s.toLowerCase().replace(/[.,;!?\s]+$/g, '').trim();
  const dedupedParts = detailParts.filter((part, idx) =>
    !detailParts.some((other, otherIdx) =>
      otherIdx !== idx && normalizedPart(other).includes(normalizedPart(part)) &&
      normalizedPart(other) !== normalizedPart(part)
    )
  );
  let mergedDetailCandidate: string | null = null;
  for (const part of dedupedParts) {
    mergedDetailCandidate = mergeDetails(mergedDetailCandidate || undefined, part, false) || null;
  }
  // Strip dangling connector fragments left behind when a structured-field
  // clause ("I'm at 1260 Highland Ave", "call me after 4") was removed from
  // the residual text ("... warms up. I'm" → "... warms up").
  if (mergedDetailCandidate) {
    mergedDetailCandidate = mergedDetailCandidate
      .replace(/(?:[.,;]\s*|\s+)(?:i'?m|i\s+am|we'?re|we\s+are|it'?s|the\s+address\s+is|you\s+can\s+call\s+me|call\s+me|and|so|at)\s*$/i, '')
      .replace(/[.,;!?\s]+$/, '')
      .trim() || null;
  }

  // Name containment: at non-name stages, suppress name extraction unless it's
  // a clear correction. This prevents garbled/misheard names from contaminating
  // the customerName field when the caller is answering a different question.
  const nameCandidate = containNameAtNonNameStage ? null : name;
  const nameCorrection = isCorrection || !!explicitName;

  applyField(
    intake,
    'customerName',
    nameCandidate,
    () => true,
    applied,
    skippedBecauseAlreadyPresent,
    nameCorrection,
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
    correctionFor('serviceAddress', tailMatches?.serviceAddress || null),
    currentStageField === 'serviceAddress'
  );

  applyField(
    intake,
    'desiredCompletionTime',
    completionMatch ? normalizeVagueCompletion(completionMatch.value, transcript) : null,
    isValidCompletionTime,
    applied,
    skippedBecauseAlreadyPresent,
    correctionFor('desiredCompletionTime', tailMatches?.desiredCompletionTime || null),
    currentStageField === 'desiredCompletionTime'
  );

  applyField(
    intake,
    'callbackTime',
    callbackMatch?.value,
    isValidCallbackTime,
    applied,
    skippedBecauseAlreadyPresent,
    correctionFor('callbackTime', tailMatches?.callbackTime || null),
    currentStageField === 'callbackTime'
  );

  // Details merge rather than overwrite: preserve prior facts and append new
  // non-duplicate sentences. An explicit correction replaces the details so a
  // contradicted fact ("the spring isn't broken actually, it's the cable") is
  // not retained alongside its replacement.
  if (mergedDetailCandidate) {
    const before = intake.issueDescription;
    const merged = mergeDetails(before, mergedDetailCandidate, isCorrection);
    if (merged && merged !== before) {
      intake.issueDescription = merged;
      detected.push('issueDescription');
      if (!applied.includes('issueDescription')) applied.push('issueDescription');
      console.log('[INTAKE DETAILS MERGE] =========================================');
      console.log('[INTAKE DETAILS MERGE] before:', before || '(empty)');
      console.log('[INTAKE DETAILS MERGE] after:', merged);
      console.log('[INTAKE DETAILS MERGE] isCorrection:', isCorrection);
      console.log('[INTAKE DETAILS MERGE] Timestamp:', new Date().toISOString());
      console.log('[INTAKE DETAILS MERGE] =========================================');
    } else if (merged === before) {
      skippedBecauseAlreadyPresent.push('issueDescription');
    }
  }

  // Current-stage scalar fallback: when the stage's own finder produced nothing
  // but the (possibly correction-trimmed) answer is itself a valid scalar, store
  // the cleaned answer so raw correction prose never lands in the field.
  const stageScalarFallback = (field: keyof IntakeData, validator: (v: string) => boolean, normalizer?: (v: string) => string) => {
    const current = (intake as any)[field];
    const alreadySet = typeof current === 'string' && current.trim().length > 0 && validator(current);
    // A correction tail answering the current stage replaces the stored value;
    // otherwise only fill when the field is empty/invalid.
    if (alreadySet && !correctionTail) return;
    if (correctionTail) {
      // The tail belongs to exactly one field. A completion-context tail
      // ("make it Monday") must not be raw-written to callbackTime, and vice
      // versa, even when the tail finder produced no match.
      if (field === 'callbackTime' && tailIsCompletionContext) return;
      if (field === 'desiredCompletionTime' && tailIsCallbackContext) return;
      // If another field's extractor claimed it ("make that 500 Pine Street"
      // → address, not callback) or the tail finder already produced this
      // field's value via applyField, the fallback must not run here.
      const tailClaims: Record<string, ExtractedMatch | null | undefined> = {
        serviceAddress: tailMatches?.serviceAddress,
        desiredCompletionTime: tailMatches?.desiredCompletionTime,
        callbackTime: tailMatches?.callbackTime,
      };
      if (tailClaims[field as string] || Object.entries(tailClaims).some(([f, m]) => f !== field && !!m)) return;
    }
    // Field ownership: when another structured scalar was extracted from this
    // utterance ("call me after 5" at ask_location → callback), the stage
    // fallback must not raw-write that text into this field.
    if (!correctionTail && ['serviceAddress', 'desiredCompletionTime', 'callbackTime'].some(f => f !== field && applied.includes(f as string))) return;
    const source = (correctionTail || transcript).trim();
    const cleaned = source
      .replace(/^[\s,.\-—–]+/, '')
      .replace(/\s+instead(?:\s+of\s+.*)?$/i, '')
      .replace(/[.,;!?\s]+$/, '');
    // Never raw-write clause-laden or negated prose ("within two weeks, not in
    // next month") — the fallback only stores clean single-value scalars.
    // Exception: "not before noon" / "not after 5" are valid negated timing
    // constraints, not clause-laden prose.
    const negatedTiming = /^not\s+(?:before|after|until)\b/i.test(cleaned);
    if (/[,;]|\b(?:but|instead|and)\b/i.test(cleaned) || (!negatedTiming && /\bnot\b/i.test(cleaned))) return;
    // Incident-history prose must never land in a timing field ("the furnace
    // shut off around 2 pm", "it began leaking last night").
    if ((field === 'callbackTime' || field === 'desiredCompletionTime') && INCIDENT_ANSWER_RE.test(cleaned)) return;
    const value = normalizer ? normalizer(cleaned) : cleaned;
    if (value && validator(value) && value !== current) {
      if (alreadySet) {
        console.log('[INTAKE CORRECTION]', {
          field,
          action: 'replace',
          reason: 'correction_tail_stage_answer',
          oldValue: current,
          newValue: value,
        });
      }
      (intake as any)[field] = value;
      detected.push(field as string);
      if (!applied.includes(field as string)) applied.push(field as string);
      console.log('[INTAKE STAGE SCALAR FALLBACK]', { field, value, source: 'stage_answer' });
    }
  };
  if (currentStageField === 'serviceAddress') {
    stageScalarFallback('serviceAddress', isValidServiceAddress);
  } else if (currentStageField === 'desiredCompletionTime') {
    stageScalarFallback('desiredCompletionTime', isValidCompletionTime);
  } else if (currentStageField === 'callbackTime') {
    stageScalarFallback('callbackTime', isValidCallbackTime, normalizeCallbackTime);
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
