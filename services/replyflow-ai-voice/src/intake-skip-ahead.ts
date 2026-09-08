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
  return s
    .replace(
      /^(?:i want to|i would like to|i'd like to|i need to|i need|i'm looking to|i am looking to|looking to|calling about|i'm calling about|i am calling about|need someone to|to get my|get my)\s+/i,
      ''
    )
    .replace(/^[.,;:]\s*/, '')
    .trim();
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
      if (normalized && normalized.length > 1 && !isFillerPhrase(normalized)) {
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
        return {
          value: candidate.replace(/[.,;]\s*$/, ''),
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
  /\b((?:i'd like|i would like|i want|i need)\s+(?:someone|somebody)\s+(?:to come\s+)?(?:out|here)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
  /\b((?:can you|could you)\s+(?:come|get here|make it)\s+(?:by|on|in)\s+([^.,;]+?))(?=\s*,?\s*and\b|[.!?](?:\s|$)|;|$)/i,
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
      const value = (match[2] || match[1]).trim();
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

  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] =========================================');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] event: semantic_skip_ahead_extraction');
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] callSid:', callSid);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] sourceStage:', currentStage);
  console.log('[SEMANTIC SKIP-AHEAD EXTRACTION] sourceTurnId:', sourceTurnId);
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
  const completionMatch = findCompletionMatch(transcript);
  const callbackMatch = findCallbackMatch(transcript);

  if (name) detected.push('customerName');
  if (addressMatch) detected.push('serviceAddress');
  if (completionMatch) detected.push('desiredCompletionTime');
  if (callbackMatch) detected.push('callbackTime');

  // Determine a clean service request value.
  const existingService = (intake.serviceRequested || intake.request || '').trim();
  let cleanedService = existingService;

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

  // Apply fills only to missing fields.
  mergeIfMissing(intake, 'customerName', name, () => true, applied, skippedBecauseAlreadyPresent);
  mergeIfMissing(intake, 'serviceRequested', cleanedService, isValidServiceRequest, applied, skippedBecauseAlreadyPresent);
  mergeIfMissing(intake, 'request', intake.serviceRequested, isValidServiceRequest, applied, skippedBecauseAlreadyPresent);
  mergeIfMissing(intake, 'serviceAddress', addressMatch?.value, isValidServiceAddress, applied, skippedBecauseAlreadyPresent);
  mergeIfMissing(intake, 'desiredCompletionTime', completionMatch?.value, isValidCompletionTime, applied, skippedBecauseAlreadyPresent);
  mergeIfMissing(intake, 'callbackTime', callbackMatch?.value, isValidCallbackTime, applied, skippedBecauseAlreadyPresent);

  const issueDescription = findIssueDescription(transcript, intake.serviceRequested || '');
  if (issueDescription) {
    detected.push('issueDescription');
    mergeIfMissing(intake, 'issueDescription', issueDescription, () => true, applied, skippedBecauseAlreadyPresent);
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
