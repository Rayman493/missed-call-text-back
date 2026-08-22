
import { sanitizeCustomerName, sanitizeServiceRequested, sanitizeAdditionalDetails, sanitizeServiceAddress, sanitizeTiming } from './content-sanitization'
// Placeholder names that should be rejected
const PLACEHOLDER_NAMES = new Set([
  'unknown', 'not provided', 'not collected', 'n/a', 'caller', 'customer',
  'unknown caller', 'unknown customer', 'not provided name'
])
// Placeholder service values that should be treated as missing
const PLACEHOLDER_SERVICES = new Set([
  'general service', 'general', 'service', 'not specified', 'not provided',
  'unknown', 'n/a', 'request', 'help needed', 'service request', 'not collected'
])
// Question patterns that indicate the customer asked about pricing, hours, etc. instead of requesting a service
const QUESTION_PATTERNS = [
  /^(how much|what do you charge|how much do you charge|what's the price|pricing|cost|rates)/i,
  /^(what are your|what time do you|when are you|hours|open|close|business hours)/i,
  /^(do you|can you|will you|are you|is it)/i,
  /^(where are you|what's your address|location|directions)/i,
  /^(who|what|when|where|why|how)\s/i,
  /^(can i|is it possible|do you offer|do you provide)/i
]
// Helper function to detect if a string is a placeholder value
function isPlaceholderValue(text: string | null | undefined, placeholderSet: Set<string>): boolean {
  if (!text || text.trim() === '') return true
  const normalized = text.trim().toLowerCase()
  return placeholderSet.has(normalized)
}
// Helper function to detect if text looks like a question instead of a service request
function looksLikeQuestion(text: string | null | undefined): boolean {
  if (!text || text.trim() === '') return false
  const normalized = text.trim()
  return QUESTION_PATTERNS.some(pattern => pattern.test(normalized))
}
// Helper function to detect if a string looks like a phone number
function looksLikePhoneNumber(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const cleaned = text.replace(/[\s\-\(\)\+]/g, '');
  // Phone numbers are typically 10+ digits
  if (cleaned.length < 10) return false;
  // Check if mostly digits (at least 80%)
  const digitCount = (cleaned.match(/\d/g) || []).length;
  const digitRatio = digitCount / cleaned.length;
  return digitRatio >= 0.8;
}
// Helper function to determine if meaningful details are present and return the details value
// Checks canonical details fields first, then falls back to reasonForCalling if it contains contextual information
// Canonical details fields are always authoritative - reasonForCalling is only checked as a fallback
function hasMeaningfulDetails(intakeData: any): { hasDetails: boolean; detailsValue: string } {
  // Check canonical details fields with full fallback chain
  let detailsValue = intakeData?.requestDetails ?? intakeData?.additionalDetails ?? intakeData?.importantDetails ?? intakeData?.additional_details ?? '';
  if (detailsValue && detailsValue !== 'Not collected' && detailsValue.trim() !== '') {
    return { hasDetails: true, detailsValue };
  }

  // If no dedicated details field, check if reasonForCalling contains meaningful context
  // beyond just a simple service request (e.g., "My kitchen sink is leaking underneath the cabinet")
  const reasonForCalling = intakeData?.reasonForCalling ?? intakeData?.serviceRequested ?? '';
  if (!reasonForCalling || reasonForCalling.trim() === '' || reasonForCalling === 'Not collected') {
    return { hasDetails: false, detailsValue: '' };
  }

  // Check if reasonForCalling contains semantic/context indicators that suggest detailed information
  // Focus on cause/reason, symptom/problem state, duration/timing, severity, location/context,
  // previous troubleshooting, observable condition, consequence/impact
  const contextualPatterns = [
    // Cause/reason indicators (HIGH CONFIDENCE)
    /\bbecause\b/i,
    /\bdue to\b/i,
    /\bas a result\b/i,
    /\bcaused by\b/i,
    // Removed: "since" (can be timing), "reason" (too generic)

    // Symptom/problem state indicators (HIGH CONFIDENCE)
    /\bthe problem is\b/i,
    /\bissue with\b/i,
    /\bwrong with\b/i,
    /\bnot working\b/i,
    /\bstopped working\b/i, // More specific than "stopped" alone
    // Removed: "stopped", "won't", "can't", "doesn't", "failed" (too broad alone)

    // Physical state indicators (HIGH CONFIDENCE)
    /\bleaking\b/i,
    /\bbroken\b/i,
    /\bcracked\b/i,
    /\b damaged\b/i,
    /\bblocked\b/i,
    /\bclogged\b/i,
    /\bstuck\b/i,
    /\boverflowing\b/i,
    /\bfreezing\b/i,
    // Removed: "heating", "shaking" (too context-dependent)

    // Severity/urgency indicators (HIGH CONFIDENCE)
    /\bemergency\b/i,
    /\burgent\b/i,
    /\bcritical\b/i,
    /\bspreading\b/i,
    /\bgetting worse\b/i,
    // Removed: "bad", "worse" (too broad alone)

    // Duration/timing indicators (REMOVED - timing alone is not context)
    // Removed: "since", "ago", "yesterday", "last week", "for \d+ (days|weeks|months)"
    // Removed: "started", "began" (too generic)

    // Location/context indicators (REMOVED - location alone is not context)
    // Removed: "in the", "at the", "under", "behind", "next to", "between", "on the", "inside", "outside"

    // Previous troubleshooting/attempts (REMOVED - too broad without symptom context)
    // Removed: "already", "tried", "attempted", "replaced", "changed", "installed", "fixed"

    // Consequence/impact indicators (HIGH CONFIDENCE)
    /\bcan't use\b/i,
    /\bunable to\b/i,
    /\bno longer\b/i,
    /\baffecting\b/i,
    /\bcausing\b/i,
  ];

  const hasContextualIndicator = contextualPatterns.some(pattern => pattern.test(reasonForCalling));

  if (hasContextualIndicator) {
    return { hasDetails: true, detailsValue: reasonForCalling };
  }

  return { hasDetails: false, detailsValue: '' };
}

// Helper function to safely trim and capitalize text
// This is a low-level helper that does NOT apply conversational filler removal
export const safeTrimAndCapitalize = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  let normalized = text.trim();
  // Remove duplicate punctuation
  normalized = normalized.replace(/([.!?])\1+/g, '$1');
  // Remove trailing punctuation for cleaner display (except for abbreviations)
  if (/^[^.!?]*[.!?]$/.test(normalized) &&
      !/\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|Ave|Blvd|Rd|Ln|Pt|etc|e\.g|i\.e)\.$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  // Capitalize first letter
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  // Trim final whitespace
  normalized = normalized.trim();
  return normalized || 'Not collected';
};
// Helper function to apply sentence capitalization (first letter only)
export const sentenceCapitalize = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  let normalized = text.trim();
  // Remove duplicate punctuation
  normalized = normalized.replace(/([.!?])\1+/g, '$1');
  // Remove trailing punctuation for cleaner display (except for abbreviations)
  if (/^[^.!?]*[.!?]$/.test(normalized) &&
      !/\b(?:Mr|Mrs|Ms|Dr|Jr|Sr|St|Ave|Blvd|Rd|Ln|Pt|etc|e\.g|i\.e)\.$/.test(normalized)) {
    normalized = normalized.slice(0, -1);
  }
  // Capitalize first letter only (sentence case)
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  // Trim final whitespace
  normalized = normalized.trim();
  return normalized || 'Not collected';
};
// Corruption guard: reject normalized result if it looks damaged
function isNormalizationDamaged(original: string, normalized: string): boolean {
  // Reject if result is empty when original was not
  if (!normalized && original) return true;
  // Reject if result is only one character when original had multiple
  if (normalized.length === 1 && original.length > 1) return true;
  // Reject if result lost more than 50% of characters and original was a single word
  if (original.split(/\s+/).length === 1 && normalized.length < original.length * 0.5) return true;
  // Reject if result is only punctuation
  if (/^[^\w\s]+$/.test(normalized)) return true;
  return false;
}
// Field-specific normalization for customer names
// Only removes name-specific conversational prefixes
// Returns null for missing values instead of "Not collected" to avoid treating it as a valid name
export const normalizeCustomerName = (text: string | null | undefined): string | null => {
  if (!text || text.trim() === '') return null;
  const original = text.trim();
  // Reject if the value looks like a phone number
  if (looksLikePhoneNumber(original)) {
    return null;
  }
  let normalized = original;
  // Name-specific conversational prefixes (strictly anchored)
  const namePrefixPatterns = [
    /^\s*yeah[\s,]+my name is[\s,:-]+/i,
    /^\s*my name is\s+/i,
    /^\s*yeah[\s,]+i'?m\s+/i,
    /^\s*i'?m\s+/i,
    /^\s*yeah[\s,]+i am\s+/i,
    /^\s*i am\s+/i,
    /^\s*this is\s+/i,
    /^\s*yeah[\s,]+this is\s+/i,
    /^\s*the name is\s+/i,
    /^\s*i go by\s+/i,
  ];
  // Apply name-specific prefixes
  for (const pattern of namePrefixPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  // Apply safe trimming and capitalization
  normalized = safeTrimAndCapitalize(normalized);
  // Corruption guard: if normalization damaged the value, return original trimmed
  if (isNormalizationDamaged(original, normalized)) {
    return safeTrimAndCapitalize(original);
  }
  // Apply content sanitization for display
  normalized = sanitizeCustomerName(normalized);
  return normalized || null;
};
// Field-specific normalization for service reasons
// Removes intent-specific conversational prefixes
export const normalizeServiceReason = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  const original = text.trim();
  let normalized = original;
  // Remove leading conversational scaffolding like "And", "So", "Well", "Um", "Uh", "Yeah" when used as a standalone prefix
  // Keep the remainder intact for downstream intent-specific normalization
  normalized = normalized.replace(/^\s*(?:and|so|well|um|uh|yeah)[\s,\-–—]+/i, '');
  // First, remove specific "to"-intent prefixes so we don't leave a leading "to " fragment
  const toVariantPrefixes = [
    /^\s*i\s*(?:'d|would)\s+like\s+to\s+/i,   // I'd like to / I would like to
    /^\s*i\s+want\s+to\s+/i,                  // I want to
    /^\s*i\s+need\s+to\s+/i,                  // I need to
    /^\s*i\s*(?:am|'m)\s+calling\s+to\s+/i,  // I'm calling to / I am calling to
    /^\s*i\s+was\s+hoping\s+to\s+/i,         // I was hoping to
    /^\s*we\s*(?:'d|would)\s+like\s+to\s+/i, // We'd like to / We would like to
    /^\s*we\s+need\s+to\s+/i,                 // We need to
  ];
  for (const pattern of toVariantPrefixes) {
    normalized = normalized.replace(pattern, '');
  }
  // Service/intent-specific conversational prefixes (strictly anchored, generic variants)
  const reasonPrefixPatterns = [
    /^\s*i need\s+/i,
    /^\s*i'd like\s+/i,
    /^\s*i want\s+/i,
    /^\s*i'?m calling because\s+/i,
    /^\s*i'?m calling for\s+/i,
    /^\s*i'?m here for\s+/i,
    /^\s*i'?m looking for\s+/i,
    /^\s*i need someone to\s+/i,
    /^\s*i need a\s+/i,
    /^\s*i need an?\s+/i,
    /^\s*i'?m calling about\s+/i,
    /^\s*the reason i'?m calling is\s+/i,
    /^\s*i'?m interested in\s+/i,
  ];
  // Apply reason-specific prefixes
  for (const pattern of reasonPrefixPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  // Apply safe trimming and capitalization
  normalized = safeTrimAndCapitalize(normalized);
  // Corruption guard: if normalization damaged the value, return original trimmed
  if (isNormalizationDamaged(original, normalized)) {
    return safeTrimAndCapitalize(original);
  }
  // Apply content sanitization for display
  normalized = sanitizeServiceRequested(normalized);
  return normalized;
};
// Validate and repair request title to reject conversational filler
// Returns null if the title is invalid and cannot be repaired
export const validateRequestTitle = (title: string | null | undefined): string | null => {
  if (!title || title.trim() === '') return null;
  const normalized = title.trim().toLowerCase();
  // List of bad conversational filler and placeholders to reject
  const badPatterns = [
    /^was looking$/i,
    /^looking for$/i,
    /^i need$/i,
    /^i want$/i,
    /^can you$/i,
    /^could you$/i,
    /^i was wondering$/i,
    /^we need$/i,
    /^looking$/i,
    /^get my$/i,
    /^the customer wants$/i,
    /^service request$/i,
    /^general inquiry$/i,
    /^general service$/i,
    /^request$/i,
    /^inquiry$/i,
    /^not collected$/i,
    /^not provided$/i,
    /^unknown$/i,
    /^n\/a$/i,
    /^none$/i,
    /^general request$/i,
  ];
  // Reject if matches bad pattern
  for (const pattern of badPatterns) {
    if (pattern.test(normalized)) {
      return null;
    }
  }
  // Reject if contains pronouns
  if (/^(i|we|you|my|your|our)\s/i.test(normalized)) {
    return null;
  }
  // Reject if only 1-2 words and they're vague verbs
  const words = normalized.split(/\s+/);
  if (words.length <= 2) {
    const vagueVerbs = ['was', 'looking', 'need', 'want', 'call', 'get', 'have', 'ask'];
    if (vagueVerbs.includes(words[0])) {
      return null;
    }
  }
  // If passes validation, return the original
  return title.trim();
};
/**
 * Generate a concise professional job title using only the primary service requested.
 * Keep the title under five words. Do not include customer names, addresses,
 * scheduling details, property descriptions, conversational filler, or summaries.
 * Use common industry terminology that would naturally appear on an invoice or calendar.
 *
 * Strategy: Extract the core service only, normalize into a 2-5 word professional title
 *
 * Examples:
 * - "I need my grass cut. It's about a quarter acre." → "Lawn Mowing"
 * - "I need beginner piano lessons." → "Piano Lessons"
 * - "My AC is blowing warm air upstairs." → "AC Repair"
 * - "Need a new fence installed." → "Fence Installation"
 * - "Need my driveway pressure washed." → "Driveway Pressure Washing"
 * - "Kitchen sink is leaking." → "Kitchen Leak Repair"
 */
/**
 * Normalize semantic verb+object service pairs into professional titles
 */
function normalizeSemanticService(servicePair: string): string | null {
  const [verb, object] = servicePair.split(' ').map(w => w.toLowerCase());
  // Lawn/yard services
  if (['cut', 'mow', 'trim'].includes(verb) && ['lawn', 'yard', 'grass'].includes(object)) {
    return 'Lawn Mowing';
  }
  if (verb === 'maintain' && ['lawn', 'yard', 'grass'].includes(object)) {
    return 'Lawn Maintenance';
  }
  if (['trim', 'maintain'].includes(verb) && ['tree', 'shrub', 'hedge'].includes(object)) {
    return 'Tree Trimming';
  }
  // Fence/deck services
  if (['install', 'set', 'setup', 'put'].includes(verb) && object === 'fence') {
    return 'Fence Installation';
  }
  if (['repair', 'fix'].includes(verb) && object === 'fence') {
    return 'Fence Repair';
  }
  // Roofing services
  if (['repair', 'fix'].includes(verb) && object === 'roof') {
    return 'Roof Repair';
  }
  if (['replace'].includes(verb) && object === 'roof') {
    return 'Roof Replacement';
  }
  // "is roof" pattern
  if (['is', 'are', 'was', 'were'].includes(verb) && object === 'roof') {
    return 'Roof Repair';
  }
  // Plumbing services (including leak/drip patterns)
  if (['repair', 'fix', 'unclog', 'clear', 'leak', 'leaking', 'drip', 'dripping', 'clog', 'clogged'].includes(verb) &&
      ['drain', 'pipe', 'sink', 'toilet', 'faucet', 'kitchen'].includes(object)) {
    return 'Plumbing Repair';
  }
  if (['install', 'set', 'setup'].includes(verb) && ['pipe', 'sink', 'toilet', 'faucet'].includes(object)) {
    return 'Plumbing Installation';
  }
  // "is [plumbing object]" pattern
  if (['is', 'are', 'was', 'were'].includes(verb) && ['drain', 'pipe', 'sink', 'toilet', 'faucet'].includes(object)) {
    return 'Plumbing Repair';
  }
  // HVAC services
  if (['repair', 'fix'].includes(verb) && ['ac', 'air', 'conditioner', 'heater', 'furnace', 'hvac'].includes(object)) {
    return 'HVAC Repair';
  }
  if (['install', 'set', 'setup'].includes(verb) && ['ac', 'air', 'conditioner', 'heater', 'furnace', 'hvac'].includes(object)) {
    return 'HVAC Installation';
  }
  // "is [hvac object]" pattern
  if (['is', 'are', 'was', 'were'].includes(verb) && ['ac', 'air', 'conditioner', 'heater', 'furnace', 'hvac'].includes(object)) {
    return 'HVAC Repair';
  }
  // Cleaning services
  if (['clean', 'wash', 'pressure'].includes(verb) && ['driveway', 'sidewalk', 'deck', 'patio'].includes(object)) {
    return 'Pressure Washing';
  }
  if (['clean', 'wash'].includes(verb) && ['carpet', 'floor', 'window'].includes(object)) {
    return `${object.charAt(0).toUpperCase() + object.slice(1)} Cleaning`;
  }
  // Painting services
  if (['paint', 'painting', 'stain'].includes(verb) && ['deck', 'fence', 'interior', 'exterior'].includes(object)) {
    return 'Painting';
  }
  // Automotive services
  if (['repair', 'fix'].includes(verb) && ['car', 'truck', 'vehicle', 'brake', 'tire'].includes(object)) {
    return 'Auto Repair';
  }
  // Lessons
  if (['lesson', 'learn', 'teach', 'train', 'tutor'].includes(verb) && ['piano', 'guitar', 'violin', 'drums'].includes(object)) {
    return `${object.charAt(0).toUpperCase() + object.slice(1)} Lessons`;
  }
  // Locksmith
  if (['lock', 'unlock', 'key'].includes(verb) && ['lock', 'key', 'door'].includes(object)) {
    return 'Locksmith Service';
  }
  // Generic fallback for other verb+object pairs
  if (['repair', 'fix', 'leak', 'leaking', 'drip', 'dripping', 'clog', 'clogged'].includes(verb)) {
    return `${object.charAt(0).toUpperCase() + object.slice(1)} Repair`;
  }
  if (['install', 'set', 'setup', 'put'].includes(verb)) {
    return `${object.charAt(0).toUpperCase() + object.slice(1)} Installation`;
  }
  if (['clean', 'wash'].includes(verb)) {
    return `${object.charAt(0).toUpperCase() + object.slice(1)} Cleaning`;
  }
  // "is [object]" pattern for other objects
  if (['is', 'are', 'was', 'were'].includes(verb)) {
    return `${object.charAt(0).toUpperCase() + object.slice(1)} Repair`;
  }
  // If we can't normalize it, return null to trigger the safe fallback
  return null;
}
export const generateCanonicalRequestTitle = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'General Service';
  const original = text.trim().toLowerCase();
  let processed = original;
  // Remove all conversational prefixes and filler
  const conversationalPrefixes = [
    /^i would like /i,
    /^i'd like /i,
    /^i want /i,
    /^i need /i,
    /^i'm /i,
    /^i am /i,
    /^can you /i,
    /^could you /i,
    /^can someone /i,
    /^could someone /i,
    /^looking for /i,
    /^hoping to /i,
    /^wondering if /i,
    /^i was calling because /i,
    /^i'?m calling because /i,
    /^i'?m calling for /i,
    /^i'?m here for /i,
    /^i'?m looking for /i,
    /^i was looking to /i,
    /^i was looking for /i,
    /^i need someone to /i,
    /^i need a /i,
    /^i need an? /i,
    /^i'?m calling about /i,
    /^the reason i'?m calling is /i,
    /^i'?m interested in /i,
    /^we were hoping /i,
    /^we'd like /i,
    /^we want /i,
    /^we need /i,
    /^my wife and i /i,
    /^my husband and i /i,
    /^someone to /i,
    /^somebody to /i,
    /^need help with /i,
    /^help with /i,
    /^and /i,
    /^so /i,
    /^well /i,
    /^um /i,
    /^uh /i,
    /^yeah /i,
    // Critical additions to remove command verbs at start
    /^get /i,
    /^need /i,
    /^want /i,
    /^looking /i,
    /^come /i,
    /^help /i,
    /^someone /i,
    /^trying /i,
    /^see /i,
  ];
  for (const pattern of conversationalPrefixes) {
    processed = processed.replace(pattern, '');
  }
  // Remove pronouns and personal references
  processed = processed.replace(/^my /i, '');
  processed = processed.replace(/^our /i, '');
  processed = processed.replace(/^someone to /i, '');
  processed = processed.replace(/^somebody to /i, '');
  processed = processed.replace(/ my /gi, ' ');
  processed = processed.replace(/ our /gi, ' ');
  processed = processed.replace(/ me /gi, ' ');
  processed = processed.replace(/ us /gi, ' ');
  // Remove trailing conversational filler
  processed = processed.replace(/[.!?,]*\s*(please|thanks|thank you|asap|as soon as possible|when possible|at your earliest convenience)?\s*$/i, '');
  // Remove scheduling and timing information
  processed = processed.replace(/(?:today|tomorrow|this week|next week|this month|next month|as soon as possible|asap|when possible|at your earliest convenience|as soon as you can|whenever|as soon as)\b/gi, '');
  processed = processed.replace(/(?:morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '');
  processed = processed.replace(/\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|a\.m\.|p\.m\.))?/gi, '');
  // Remove property size and descriptions
  processed = processed.replace(/(?:quarter|half|full)\s*(?:acre|acres|sq\s*ft|square\s*foot|square\s*feet)\b/gi, '');
  processed = processed.replace(/\d+\s*(?:bedroom|bath|room|rooms|story|stories|floor|floors)\b/gi, '');
  // Remove common filler words
  const fillerWords = ['a', 'an', 'the', 'to', 'for', 'with', 'by', 'at', 'on', 'in', 'of', 'just', 'really', 'actually', 'basically', 'literally', 'very', 'some', 'any', 'this', 'that'];
  const words = processed.split(/\s+/).filter(w => w.length > 0 && !fillerWords.includes(w));
  if (words.length === 0) return 'General Service';
  // Define industry-specific service mappings with primary focus
  const serviceMappings: Record<string, RegExp[]> = {
    'Lawn Mowing': [/\blawn\s*(?:mow|cut|trim|maintenance|care|service)/i, /\bgrass\s*(?:cut|mow|trim)/i, /\byard\s*(?:mow|cut|trim|work)/i],
    'Recurring Lawn Mowing': [/\blawn\s*(?:mow|cut|trim)\s*(?:every|weekly|biweekly|monthly|recurring)/i, /\bgrass\s*(?:cut|mow)\s*(?:every|weekly|biweekly|monthly|recurring)/i],
    'Pressure Washing': [/\bpressure\s*(?:wash|wash|clean)/i, /\bdriveway\s*(?:wash|clean)/i],
    'Piano Lessons': [/\bpiano\s*(?:lesson|learn|teach|class|instruction)/i],
    'AC Repair': [/\b(?:air\s*conditioner|ac|a\/c|hvac)\s*(?:repair|fix|not working|broken|leaking|stopped)/i, /\bair\s*(?:conditioning|conditioner)\s*(?:problem|issue|trouble)/i],
    'Water Heater Installation': [/\bwater\s*heater\s*(?:install|installation|new|replace)/i],
    'Water Heater Repair': [/\bwater\s*heater\s*(?:repair|fix|not working|broken|leaking)/i],
    'Heater Repair': [/\b(?:water\s*)?heater\s*(?:repair|fix|not working|broken)/i],
    'House Painting': [/\bpaint\s*(?:house|home)/i, /\b(?:interior|exterior)\s*paint/i],
    'Brazilian Wax': [/\bbrazilian\s*wax/i],
    'Waxing Service': [/\bwax(?:ing)?\s*(?:service|brazilian|hair)/i],
    'Fence Installation': [/\bfence\s*(?:install|installation|new|replace|put in|set up)/i],
    'Kitchen Leak Repair': [/\bkitchen\s*(?:sink|faucet|pipe)\s*(?:leak|drip|leaking|dripping)/i, /\bkitchen\s*(?:plumbing|repair|fix)/i],
    // Context-aware plumbing mappings
    // Note: New-Construction Plumbing Installation is handled via upgrade logic after matching Pipe Installation
    // Priority: Check for construction context after matching plumbing installation
    // This is handled by a separate pass below
    'Pipe Installation': [
      /\b(?:pipe|pipes|piping)\s*(?:install|installation|new|set up)(?!\s*(?:new\s*(?:construction|house|home|build)))/i,
      /\bplumbing\s*(?:install|installation|new)(?!\s*(?:new\s*(?:construction|house|home|build)))/i,
      /\b(?:new\s*)?(?:pipe|pipes)\s*(?:install|installation)(?!\s*(?:construction|house|home|build))/i
    ],
    'Drain Cleaning': [
      /\b(?:drain|drains)\s*(?:clean|cleaning|unclog|clog|block|clear)/i,
      /\b(?:clogged|blocked)\s*(?:drain|drains)/i,
      /\b(?:unclog|clear)\s*(?:drain|drains)/i
    ],
    'Plumbing Repair': [
      /\bplumbing\s*(?:repair|fix|issue|problem)/i,
      /\b(?:sink|faucet|pipe|toilet|drain)\s*(?:leak|drip|leaking|dripping|clogged|blocked)(?!\s*(?:new\s*(?:construction|house|home|build)))/i
    ],
    'Plumbing Service': [
      /\bplumbing\s*(?:service|work|help)/i,
      /\b(?:pipe|pipes)\s*(?:service|work|help)/i
    ],
    // HVAC mappings
    'Air Conditioning Repair': [
      /\b(?:air\s*conditioner|ac|a\/c)\s*(?:repair|fix|not working|broken|leaking|stopped|blowing\s*warm)/i,
      /\bair\s*(?:conditioning|conditioner)\s*(?:problem|issue|trouble)/i
    ],
    'Furnace Repair': [
      /\bfurnace\s*(?:repair|fix|not working|broken)/i,
      /\b(?:heating|heater)\s*(?:repair|fix|not working|broken)/i
    ],
    // Electrical mappings
    'Electrical Panel Upgrade': [
      /\belectrical\s*(?:panel)\s*(?:upgrade|replace|update)/i,
      /\bpanel\s*(?:upgrade|replace|update)\s*(?:electrical)/i
    ],
    'Electrical Outlet Repair': [
      /\b(?:outlet|outlets)\s*(?:repair|fix|sparking|broken|not working)/i,
      /\b(?:electrical)\s*(?:outlet)\s*(?:repair|fix)/i
    ],
    // Roofing mappings
    'Storm Damage Roof Inspection': [
      /\broof\s*(?:inspection|inspect|check|look|assess)\s*(?:storm|damage|after\s*storm|hail|wind)/i,
      /\b(?:storm|damage|hail|wind)\s*(?:roof\s*(?:inspection|inspect|check|look|assess))/i
    ],
    'Roof Repair': [
      /\broof\s*(?:repair|fix|leak|replace)/i,
      /\b(?:leaking|leak)\s*(?:roof)/i
    ],
    // Cleaning mappings
    'Move-Out Cleaning': [
      /\b(?:move-?out|moving\s*out)\s*(?:clean|cleaning)/i,
      /\bclean\s*(?:before\s*move|moving)/i
    ],
    'House Cleaning': [
      /\bhouse\s*(?:clean|cleaning|maid|service)/i,
      /\bhome\s*(?:clean|cleaning)/i
    ],
    // Painting mappings
    'Interior House Painting': [
      /\b(?:interior|inside)\s*(?:house|home)\s*(?:paint|painting)/i,
      /\bpaint\s*(?:interior|inside)\s*(?:house|home)/i
    ],
    'Painting': [
      /\bpaint(?:ing)?\s*(?:interior|exterior|house|home|room)/i
    ],
    'Electrical Repair': [/\belectrical\s*(?:repair|fix|issue|problem|work)/i, /\b(?:outlet|switch|wire|wiring|circuit)\s*(?:repair|fix|broken|not working)/i],
    'Carpet Cleaning': [/\bcarpet\s*(?:clean|wash|shampoo|steam)/i],
    'Window Cleaning': [/\bwindow\s*(?:clean|wash|cleaning)/i],
    'Flooring': [/\bfloor(?:ing)?\s*(?:install|installation|repair|replace|refinish)/i],
    'HVAC Service': [/\bhvac\s*(?:service|maintenance|repair|install)/i, /\b(?:heating|cooling|furnace|boiler)\s*(?:service|repair|install)/i],
    'Pool Service': [/\bpool\s*(?:clean|cleaning|maintenance|service|repair)/i],
    'Junk Removal': [/\bjunk\s*(?:remove|removal|haul|pickup)/i],
    'Moving Service': [/\b(?:move|moving)\s*(?:service|help|company)/i],
    'Tree Service': [/\btree\s*(?:trim|prune|remove|removal|cut|service)/i],
    'Landscaping': [/\blandscape\s*(?:design|install|maintenance|service)/i, /\bgarden\s*(?:service|maintenance|design)/i],
    'Gutter Cleaning': [/\bgutter\s*(?:clean|cleaning|clear|remove)/i],
    'Handyman Service': [/\bhandyman\s*(?:service|work|repair)/i],
    'General Contractor': [/\bgeneral\s*contractor/i, /\b(?:remodel|renovation|renovate|construction)/i],
    'Appliance Repair': [/\b(?:appliance|refrigerator|dryer|washer|dishwasher|stove|oven)\s*(?:repair|fix|not working|broken)/i],
    'Auto Repair': [/\b(?:car|auto|vehicle|truck)\s*(?:repair|fix|service|maintenance)/i],
    'Locksmith': [/\blocksmith\s*(?:service|repair|install)/i, /\b(?:lock|key)\s*(?:change|replace|repair|install)/i],
    'Pest Control': [/\bpest\s*(?:control|removal|extermination|treatment)/i],
    'Cleaning Service': [/\bclean(?:ing)?\s*(?:service|company)/i],
    'Home Inspection': [/\bhome\s*(?:inspect|inspection|check)/i],
    'Security Systems': [/\bsecurity\s*(?:system|camera|alarm)/i],
    'Solar Installation': [/\bsolar\s*(?:panel|install|installation)/i],
    'Towing': [/\btow\s*(?:service|truck)/i],
    'Photography': [/\bphotograph(?:y|er)\s*(?:service|session)/i],
    'Lessons': [/\b(?:lesson|learn|teach|train|class|instruction|tutor)/i],
    'Consulting': [/\bconsult(?:ant|ing)\s*(?:service|advice)/i],
    'Financial Services': [/\bfinancial\s*(?:service|advice|planning)/i],
    'Insurance': [/\binsurance\s*(?:service|claim|quote)/i],
    'Property Management': [/\bproperty\s*(?:manage|management)/i],
    'Real Estate': [/\breal\s*estate/i],
    // Noun-phrase services (no verb required)
    'Cat Sitter': [/\bcat\s*(?:sit|sitter|sitting|care)/i],
    'Dog Walker': [/\bdog\s*(?:walk|walker|walking)/i],
    'Pet Sitter': [/\bpet\s*(?:sit|sitter|sitting|care)/i],
    'Plumber': [/\bplumber/i, /\bplumbing/i],
    'Electrician': [/\belectrician/i],
    'Brake Inspection': [/\bbrake\s*(?:inspect|inspection)/i],
  };
  // Try to match against service mappings first
  // Sort mappings by specificity (longer patterns first) to ensure context-aware patterns match before general ones
  const sortedMappings = Object.entries(serviceMappings).sort((a, b) => b[0].length - a[0].length);
  // Priority check: burst, frozen, repair, replacement must match before construction-related patterns
  const priorityPatterns = [
    { title: 'Burst Pipe Repair', patterns: [/\bburst\s*(?:pipe|pipes)/i, /\b(?:pipe|pipes)\s*burst/i] },
    { title: 'Frozen Pipe Repair', patterns: [/\bfrozen\s*(?:pipe|pipes)/i, /\b(?:pipe|pipes)\s*frozen/i] },
    { title: 'Pipe Replacement', patterns: [/\b(?:pipe|pipes)\s*(?:replace|replacement|swap|change)/i, /\b(?:replace|changing)\s*(?:pipe|pipes)/i] },
  ];
  for (const { title, patterns } of priorityPatterns) {
    for (const pattern of patterns) {
      if (pattern.test(processed)) {
        return title;
      }
    }
  }
  let matchedTitle: string | null = null;
  for (const [serviceTitle, patterns] of sortedMappings) {
    for (const pattern of patterns) {
      if (pattern.test(processed)) {
        // Ensure the result is 2-5 words
        const titleWords = serviceTitle.split(' ');
        if (titleWords.length >= 2 && titleWords.length <= 5) {
          matchedTitle = serviceTitle;
          break;
        }
      }
    }
    if (matchedTitle) break;
  }
  // Rule priority: Repair, burst, frozen, replacement intent cannot be overwritten by construction context
  const isRepairPriority = matchedTitle === 'Pipe Repair' || matchedTitle === 'Burst Pipe Repair' || matchedTitle === 'Frozen Pipe Repair' || matchedTitle === 'Pipe Replacement';
  if (matchedTitle && !isRepairPriority && matchedTitle === 'Pipe Installation') {
    const hasPlumbing = /\b(?:pipe|pipes|piping|plumbing)\s*(?:install|installation|new|set up)/i.test(processed);
    // Must have explicit construction context - not just "new" or "house"
    // Exclude patterns like "30-year-old house" or "existing house"
    const hasConstructionContext = /\b(?:getting\s*built|being\s*built|under\s*construction|construction\s*project|building\s*a\s*new)\b/i.test(processed);
    // Must have both plumbing installation language AND explicit construction context
    // "New pipes" or "new house" alone must not trigger new-construction classification
    if (hasPlumbing && hasConstructionContext) {
      matchedTitle = 'New-Construction Plumbing Installation';
    }
  }
  if (matchedTitle) return matchedTitle;
  // Semantic fallback: Look for service action verbs + object pairs
  // This prevents noun-compression like "Grass Fence" from conversational context
  // Instead identifies the actual work being requested
  //
  // HARDENING: Prioritize current intent, handle negation, de-prioritize historical context
  // Current intent markers (highest priority)
  const currentIntentMarkers = [
    'i need', 'i want', 'i\'d like', 'i would like',
    'can you', 'could you', 'could someone',
    'i\'m calling about', 'i am calling about', 'i\'m calling for', 'i am calling for',
    'i\'m looking for', 'i am looking for',
    'i need someone to',
    'what i actually need', 'now i need', 'this time i need',
    'i\'d actually like', 'i would actually like',
    'right now i need', 'currently i need',
  ];
  // Historical context markers (de-prioritize)
  const historicalMarkers = [
    'last year', 'previously', 'before', 'you used to', 'you already', 'we had',
    'you did', 'normally', 'usually', 'in the past', 'earlier',
    'previously', 'back then', 'used to',
  ];
  // Negation markers (skip these pairs)
  const negationMarkers = [
    "don't need", 'do not need', 'not need',
    "i don't", 'i do not', 'i never',
    'no longer need', 'no longer want',
    'never mind', 'nevermind',
    'actually not', "actually don't",
    'but not', 'except not',
    'skip', 'skip the', 'avoid',
  ];
  // Correction/superseded markers (boost pairs after these)
  const correctionMarkers = [
    'but actually', 'but actually i', 'but actually the',
    'never mind', 'nevermind',
    'instead', 'instead i', 'instead of',
    'actually i need', 'actually i want',
    'this time', 'this time i',
    'now i need', 'right now i',
    'what i actually need',
    'but now', 'but now i',
  ];
  const serviceVerbs = [
    'cut', 'mow', 'trim', 'maintain', 'care', 'service',
    'install', 'installation', 'set', 'setup', 'put', 'replace', 'repair', 'fix',
    'clean', 'wash', 'scrub', 'pressure', 'sweep',
    'paint', 'painting', 'stain',
    'plumb', 'plumbing', 'unclog', 'clear', 'drain',
    'inspect', 'check', 'look', 'assess', 'evaluate',
    'remove', 'removal', 'haul', 'demolition', 'teardown',
    'build', 'construct', 'construct', 'frame', 'erect',
    'lesson', 'learn', 'teach', 'train', 'tutor',
    'move', 'moving', 'pack', 'unpack',
    'lock', 'unlock', 'key', 'secure',
    'tow', 'transport', 'deliver',
    'photograph', 'photo', 'video', 'film',
    'consult', 'advice', 'advise',
    // Nouns that imply action
    'leak', 'leaking', 'drip', 'dripping', 'clog', 'clogged', 'block', 'blocked',
    // Helper verb for "is [adjective]" patterns
    'is', 'are', 'was', 'were',
  ];
  const serviceObjects = [
    'lawn', 'yard', 'grass', 'landscape', 'garden', 'tree', 'shrub', 'hedge',
    'fence', 'gate', 'deck', 'patio', 'driveway', 'sidewalk', 'walkway',
    'roof', 'gutter', 'gutters', 'siding', 'window', 'door',
    'kitchen', 'bathroom', 'bedroom', 'basement', 'attic', 'garage', 'house',
    'sink', 'toilet', 'faucet', 'pipe', 'drain', 'shower', 'tub',
    'ac', 'air', 'conditioner', 'heater', 'furnace', 'boiler', 'hvac', 'duct',
    'car', 'truck', 'vehicle', 'brake', 'tire', 'oil', 'engine', 'transmission',
    'carpet', 'floor', 'tile', 'hardwood', 'laminate',
    'pool', 'spa', 'hot', 'tub',
    'lock', 'key', 'camera', 'alarm', 'security',
    'solar', 'panel',
    'piano', 'guitar', 'violin', 'drums',
    'hair', 'nail', 'facial', 'massage', 'wax',
  ];
  // Find positions of all correction markers
  const correctionPositions: number[] = [];
  for (const marker of correctionMarkers) {
    const regex = new RegExp(marker, 'gi');
    let match;
    while ((match = regex.exec(processed)) !== null) {
      correctionPositions.push(match.index);
    }
  }
  // Find verb+object pairs with their positions and context scores
  const serviceCandidates: Array<{
    verb: string,
    object: string,
    verbIndex: number,
    objectIndex: number,
    score: number,
    hasCurrentIntent: boolean,
    hasHistoricalMarker: boolean,
    hasNegation: boolean,
    isAfterCorrection: boolean,
  }> = [];
  const maxDistance = 4; // Look for object within 4 words of verb
  // Scan for verb+object pairs
  for (let i = 0; i < words.length; i++) {
    const word = words[i].toLowerCase();
    if (serviceVerbs.includes(word)) {
      // Check if this verb is negated (look backward for negation markers)
      let hasNegation = false;
      for (let j = Math.max(0, i - 4); j < i; j++) {
        const checkPhrase = words.slice(j, i + 1).join(' ').toLowerCase();
        if (negationMarkers.some(marker => checkPhrase.includes(marker))) {
          hasNegation = true;
          break;
        }
      }
      if (hasNegation) continue; // Skip negated verbs
      // Look for a service object nearby (forward)
      for (let j = i + 1; j < Math.min(i + maxDistance + 1, words.length); j++) {
        const nextWord = words[j].toLowerCase();
        if (serviceObjects.includes(nextWord)) {
          // Check for negation between verb and object
          let pairNegated = false;
          for (let k = i + 1; k < j; k++) {
            const checkPhrase = words.slice(i, k + 1).join(' ').toLowerCase();
            if (negationMarkers.some(marker => checkPhrase.includes(marker))) {
              pairNegated = true;
              break;
            }
          }
          if (pairNegated) continue;
          // Check context around this pair
          const contextStart = Math.max(0, i - 3);
          const contextEnd = Math.min(words.length, j + 4);
          const contextText = words.slice(contextStart, contextEnd).join(' ').toLowerCase();
          const hasCurrentIntent = currentIntentMarkers.some(marker => contextText.includes(marker));
          const hasHistoricalMarker = historicalMarkers.some(marker => contextText.includes(marker));
          // Check if this pair appears after any correction marker
          const pairText = words.slice(i, j + 1).join(' ');
          const pairStartIndex = processed.toLowerCase().indexOf(pairText);
          const isAfterCorrection = correctionPositions.some(pos => pairStartIndex > pos);
          serviceCandidates.push({
            verb: word,
            object: nextWord,
            verbIndex: i,
            objectIndex: j,
            score: 0,
            hasCurrentIntent,
            hasHistoricalMarker,
            hasNegation,
            isAfterCorrection,
          });
        }
      }
    }
  }
  // If no candidates found, try object before verb pattern
  if (serviceCandidates.length === 0) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i].toLowerCase();
      if (serviceObjects.includes(word)) {
        // Check if this object is negated (look backward)
        let hasNegation = false;
        for (let j = Math.max(0, i - 4); j < i; j++) {
          const checkPhrase = words.slice(j, i + 1).join(' ').toLowerCase();
          if (negationMarkers.some(marker => checkPhrase.includes(marker))) {
            hasNegation = true;
            break;
          }
        }
        if (hasNegation) continue;
        // Look for a service verb nearby (forward)
        for (let j = i + 1; j < Math.min(i + maxDistance + 1, words.length); j++) {
          const nextWord = words[j].toLowerCase();
          if (serviceVerbs.includes(nextWord)) {
            // Check for negation between object and verb
            let pairNegated = false;
            for (let k = i + 1; k < j; k++) {
              const checkPhrase = words.slice(i, k + 1).join(' ').toLowerCase();
              if (negationMarkers.some(marker => checkPhrase.includes(marker))) {
                pairNegated = true;
                break;
              }
            }
            if (pairNegated) continue;
            // Check context
            const contextStart = Math.max(0, i - 3);
            const contextEnd = Math.min(words.length, j + 4);
            const contextText = words.slice(contextStart, contextEnd).join(' ').toLowerCase();
            const hasCurrentIntent = currentIntentMarkers.some(marker => contextText.includes(marker));
            const hasHistoricalMarker = historicalMarkers.some(marker => contextText.includes(marker));
            // Check if this pair appears after any correction marker
            const pairText = words.slice(i, j + 1).join(' ');
            const pairStartIndex = processed.toLowerCase().indexOf(pairText);
            const isAfterCorrection = correctionPositions.some(pos => pairStartIndex > pos);
            serviceCandidates.push({
              verb: nextWord,
              object: word,
              verbIndex: j,
              objectIndex: i,
              score: 0,
              hasCurrentIntent,
              hasHistoricalMarker,
              hasNegation,
              isAfterCorrection,
            });
          }
        }
      }
    }
  }
  // Score candidates based on context
  serviceCandidates.forEach(candidate => {
    // Prefer current intent
    if (candidate.hasCurrentIntent) candidate.score += 10;
    // Penalize historical context
    if (candidate.hasHistoricalMarker) candidate.score -= 8;
    // Strongly prefer pairs after correction markers
    if (candidate.isAfterCorrection) candidate.score += 15;
    // Prefer later occurrences (current request likely comes later)
    candidate.score += (candidate.verbIndex * 0.1);
  });
  // Sort by score descending
  serviceCandidates.sort((a, b) => b.score - a.score);
  // If we found semantic services, try to normalize the best one
  if (serviceCandidates.length > 0) {
    const bestCandidate = serviceCandidates[0];
    const normalizedService = normalizeSemanticService(`${bestCandidate.verb} ${bestCandidate.object}`);
    if (normalizedService) {
      return normalizedService;
    }
  }
  // Fallback for short noun-phrase service names (1-3 words)
  // Preserve original if it looks like a valid service name and not a placeholder
  // This is a conservative fallback to avoid rejecting legitimate noun-phrase services
  const fallbackWords = processed.split(/\s+/).filter(w => w.length > 0);
  if (fallbackWords.length >= 1 && fallbackWords.length <= 3) {
    // EXACT PLACEHOLDER PHRASES (whole-phrase matching, not per-word)
    const exactPlaceholders = [
      'what service do you need',
      'what are you looking to have done',
      'service request',
      'service requested',
      'general service',
      'unknown',
      'not provided',
      'n/a',
      'need help',
      'something',
      'question',
      'what service',
      'service',
      'help',
    ];
    const lowerProcessed = processed.toLowerCase();
    if (exactPlaceholders.includes(lowerProcessed)) {
      return 'Service Request';
    }

    // CONVERSATIONAL FRAGMENTS (whole-phrase matching)
    const conversationalPhrases = [
      'hello', 'hi', 'hey', 'thanks', 'thank you', 'please', 'sure', 'okay',
      'yes', 'no', 'nothing', 'anything', 'someone', 'anybody', 'whatever',
      'not sure', 'i don\'t know', 'call me', 'call back',
      'my house', 'my business', 'at home', 'maybe',
    ];
    if (conversationalPhrases.includes(lowerProcessed)) {
      return 'Service Request';
    }

    // SCHEDULING/TIMING TERMS (whole-phrase matching)
    const schedulingTerms = [
      'tomorrow', 'today', 'next week', 'this weekend', 'morning',
      'afternoon', 'asap', 'right away', 'soon', 'later', 'this weekend',
    ];
    if (schedulingTerms.includes(lowerProcessed)) {
      return 'Service Request';
    }

    // PRESERVE ORIGINAL CAPITALIZATION for acronyms and proper names
    // Only capitalize first letter, preserve rest as-is
    return processed.charAt(0).toUpperCase() + processed.slice(1);
  }
  // If no clear service action found, return safe neutral label
  // DO NOT fabricate a title from unrelated nouns
  return 'Service Request';
};
/**
 * Remove trailing periods from structured address display values only.
 * This is a display-only normalization to remove sentence-ending punctuation
 * that was added during AI extraction. Internal periods (e.g., "W. Main St.")
 * are preserved.
 *
 * Examples:
 * - "1632 Southpine Drive." → "1632 Southpine Drive"
 * - "1632 Southpine Drive..." → "1632 Southpine Drive"
 * - "123 W. Main St." → "123 W. Main St" (removes trailing but keeps internal)
 * - "45 St. James Ave." → "45 St. James Ave"
 * - "Apt. 4B, 123 Main St." → "Apt. 4B, 123 Main St"
 * - "123 W. Main St., Apt. 4B" → unchanged (no trailing period)
 * - null → ""
 * - "" → ""
 */
// ----------------------------
// Address normalization (storage)
// ----------------------------
/**
 * Normalize address for storage by removing trailing sentence-ending punctuation
 * Preserves internal punctuation (periods in abbreviations, commas in addresses)
 *
 * Examples:
 * - "1632 Southpine Drive." → "1632 Southpine Drive"
 * - "123 W. Main St." → "123 W. Main St" (removes trailing but keeps internal)
 * - "45 St. James Ave." → "45 St. James Ave"
 * - "Apt. 4B, 123 Main St." → "Apt. 4B, 123 Main St"
 * - "123 W. Main St., Apt. 4B" → unchanged (no trailing punctuation)
 * - "100 Route 51, Suite 200;" → "100 Route 51, Suite 200"
 * - null → ""
 * - "" → ""
 */
export const normalizeAddressForStorage = (text: string | null | undefined): string => {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === '') return '';
  // Remove trailing sentence-ending punctuation: . , ; : ! ?
  return trimmed.replace(/[.,;:!?]+$/, '');
};
// ----------------------------
// Address normalization (display)
// ----------------------------
/**
 * Normalize address for display by removing trailing periods only
 * that was added during AI extraction. Internal periods (e.g., "W. Main St.")
 * are preserved.
 *
 * Examples:
 * - "1632 Southpine Drive." → "1632 Southpine Drive"
 * - "1632 Southpine Drive..." → "1632 Southpine Drive"
 * - "123 W. Main St." → "123 W. Main St" (removes trailing but keeps internal)
 * - "45 St. James Ave." → "45 St. James Ave"
 * - "Apt. 4B, 123 Main St." → "Apt. 4B, 123 Main St"
 * - "123 W. Main St., Apt. 4B" → unchanged (no trailing period)
 * - null → ""
 * - "" → ""
 */
export const normalizeAddressForDisplay = (text: string | null | undefined): string => {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === '') return '';
  // Remove trailing periods only, preserving internal periods
  return trimmed.replace(/\.+$/, '');
};
/**
 * Truncate text for SMS display while preserving meaning
 * Adds ellipsis only when truncation occurs
 * Avoids breaking Unicode/surrogate pairs
 */
export const truncateForSms = (text: string | null | undefined, maxLength: number = 200): string => {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  // Truncate at maxLength, but avoid breaking Unicode surrogate pairs
  let truncated = trimmed.slice(0, maxLength);
  // Check if we cut a surrogate pair and adjust
  if (truncated.charCodeAt(truncated.length - 1) >= 0xD800 && truncated.charCodeAt(truncated.length - 1) <= 0xDBFF) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
};
/**
 * Normalize structured field values by removing incidental trailing sentence punctuation.
 * This is for structured scalar fields where terminal punctuation is clearly formatting noise.
 * Does NOT strip punctuation from free-text fields like details, notes, or descriptions.
 *
 * Behavior:
 * - Trim leading/trailing whitespace
 * - Remove one trailing sentence punctuation mark when safe: ".", ",", ";", ":"
 * - Preserve internal punctuation
 * - Preserve unit/apartment markers
 * - Preserve abbreviations where punctuation is semantically meaningful
 *
 * Examples:
 * - "1632 Southpine Drive." → "1632 Southpine Drive"
 * - "1632 Southpine Drive" → "1632 Southpine Drive" (unchanged)
 * - "1632 Southpine Dr., Apt. 2B" → "1632 Southpine Dr., Apt. 2B" (internal punctuation preserved)
 * - "123 St. James St." → "123 St. James St." (internal periods preserved)
 * - "  1632 Southpine Drive.  " → "1632 Southpine Drive" (whitespace trimmed)
 * - null → ""
 * - "" → ""
 */
export const normalizeStructuredFieldValue = (text: string | null | undefined): string => {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === '') return '';
  // Remove trailing sentence punctuation: .,;: (only one occurrence at the end)
  // This preserves internal punctuation like "St." or "Apt."
  return trimmed.replace(/[.,;:]$/, '');
};
// Field-specific normalization for addresses
// Removes location-specific conversational prefixes
export const normalizeAddress = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  const original = text.trim();
  let normalized = original;
  // Attempt to convert a clearly spoken street number at the very start
  // into digits, preserving the remainder of the address as-is (aside from
  // minimal whitespace cleanup). This runs BEFORE split-digit joining.
  normalized = convertLeadingSpokenStreetNumber(normalized);
  // Join obvious split street numbers at the very beginning of the address.
  // Examples: "16 32 South Pines Drive" -> "1632 South Pines Drive"
  //           "1 632 South Pine Drive" -> "1632 South Pine Drive"
  // Only when the first two tokens are pure digits and are immediately followed by a street word.
  // Do NOT affect ordinals like "34th" or non-leading occurrences (e.g., "Route 16 32").
  normalized = normalized.replace(/^\s*(\d{1,5})\s+(\d{1,5})(?=\s+[A-Za-z])/, (_m, a: string, b: string) => `${a}${b}`);
  // Normalize spoken ZIP codes (e.g., "one five two oh seven" → "15207")
  normalized = normalizeSpokenZipInAddress(normalized);
  // Address/location-specific conversational prefixes (strictly anchored)
  // Only apply if the text looks like an actual address (contains street-like content)
  const hasStreetContent = STREET_SUFFIXES.has(normalized.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '') || '') ||
                           DIRECTIONS.has(normalized.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, '') || '') ||
                           /^\d+/.test(normalized)
  const addressPrefixPatterns = hasStreetContent ? [
    /^\s*my address is\s+/i,
    /^\s*i live at\s+/i,
    /^\s*we'?re located at\s+/i,
    /^\s*it'?s at\s+/i,
    /^\s*we'?re at\s+/i,
    /^\s*the address is\s+/i,
    /^\s*located at\s+/i,
    /^\s*my location is\s+/i,
    /^\s*the location is\s+/i,
    /^\s*at\s+/i,  // Only if "at" is followed by a number or street name
  ] : [];
  // Apply address-specific prefixes only if it looks like an address
  for (const pattern of addressPrefixPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  // Apply safe trimming and capitalization
  normalized = safeTrimAndCapitalize(normalized);
  // Corruption guard: if normalization damaged the value, return original trimmed
  if (isNormalizationDamaged(original, normalized)) {
    return safeTrimAndCapitalize(original);
  }
  // Apply content sanitization for display
  normalized = sanitizeServiceAddress(normalized);
  return normalized;
};
// ----------------------------
// Internal helpers (address)
// ----------------------------
// Minimal set of number words for leading house numbers
const UNITS: Record<string, number> = {
  'zero': 0, 'oh': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
  'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19,
}
const TENS: Record<string, number> = {
  'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
}
const SCALES: Record<string, number> = { 'hundred': 100, 'thousand': 1000 }
const STREET_SUFFIXES = new Set([
  'street','st','road','rd','avenue','ave','drive','dr','lane','ln','boulevard','blvd','court','ct','circle','way','parkway','pkwy','pike','highway','hwy','terrace','trl','trail','place','pl'
])
const DIRECTIONS = new Set(['north','n','south','s','east','e','west','w','northeast','ne','northwest','nw','southeast','se','southwest','sw'])
// Ordinal words that indicate street names, not house numbers
const ORDINALS = new Set(['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth','sixteenth','seventeenth','eighteenth','nineteenth','twentieth','thirtieth','fortieth','fiftieth','sixtieth','seventieth','eightieth','ninetieth','hundredth','fifth'])
// Check if the tokens form an ordinal street name (e.g., "Fifty Fifth Street")
function isOrdinalStreetName(tokens: string[]): boolean {
  if (tokens.length < 2) return false
  const first = tokens[0].toLowerCase().replace(/[^a-z]/g, '')
  const second = tokens[1].toLowerCase().replace(/[^a-z]/g, '')
  // Check if first word is TENS and second is ORDINAL (e.g., "Fifty Fifth")
  const firstIsTens = TENS[first] !== undefined
  const secondIsOrdinal = ORDINALS.has(second)
  // Check if first word itself is an ordinal (e.g., "First Street")
  const firstIsOrdinal = ORDINALS.has(first)
  return firstIsOrdinal || (firstIsTens && secondIsOrdinal)
}
function isNumberWordToken(token: string): boolean {
  const t = token.toLowerCase()
  if (t === 'and') return true // allow filler within numeric phrases
  if (UNITS[t] !== undefined) return true
  if (TENS[t] !== undefined) return true
  if (SCALES[t] !== undefined) return true
  // hyphenated like twenty-one
  if (t.includes('-')) {
    const [a,b] = t.split('-')
    if ((TENS[a] !== undefined && (UNITS[b] !== undefined || b === 'one')) || (UNITS[a] !== undefined && UNITS[b] !== undefined)) return true
  }
  return false
}
// Check if token is an ordinal (for street name protection)
function isOrdinalToken(token: string): boolean {
  const t = token.toLowerCase().replace(/[^a-z]/g, '')
  return ORDINALS.has(t)
}
function parseHyphenNumber(token: string): number | null {
  const t = token.toLowerCase()
  if (!t.includes('-')) return null
  const [a,b] = t.split('-')
  if (TENS[a] !== undefined && UNITS[b] !== undefined) return TENS[a] + UNITS[b]
  // support e.g., twenty-one, twenty-two, etc.
  if (UNITS[a] !== undefined && UNITS[b] !== undefined) return UNITS[a] * 10 + UNITS[b]
  return null
}
function parseSingleNumberWord(token: string): number | null {
  const t = token.toLowerCase()
  if (UNITS[t] !== undefined) return UNITS[t]
  if (TENS[t] !== undefined) return TENS[t]
  if (SCALES[t] !== undefined) return SCALES[t]
  const hy = parseHyphenNumber(t)
  if (hy !== null) return hy
  return null
}
// Parse standard cardinal phrase like "one thousand six hundred thirty-two" or "sixteen hundred thirty-two"
function tryParseCardinal(tokens: string[]): number | null {
  let total = 0
  let current = 0
  let used = 0
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    if (t === 'and') { used++; continue }
    if (UNITS[t] !== undefined) { current += UNITS[t]; used++; continue }
    if (TENS[t] !== undefined) { current += TENS[t]; used++; continue }
    if (t.includes('-')) {
      const hv = parseHyphenNumber(t)
      if (hv !== null) { current += hv; used++; continue }
    }
    if (t === 'hundred') { if (current === 0) current = 1; current *= 100; used++; continue }
    if (t === 'thousand') { if (current === 0) current = 1; total += current * 1000; current = 0; used++; continue }
    break
  }
  const value = total + current
  if (used === 0) return null
  if (value > 0) return value
  return null
}
// Parse digit-group style like "sixteen thirty-two" or sequence like "one six three two"
// Also handles grouped patterns like "fifty five ten" → 55-10 → 5510
// And "twelve thirty four" → 12-34 → 1234
function tryParseConcatenated(tokens: string[]): { value: number, consumed: number } | null {
  const parts: number[] = []
  let consumed = 0
  for (const raw of tokens) {
    const t = raw.toLowerCase()
    if (t === 'and') { consumed++; continue } // ignore ands in this mode
    let n: number | null = null
    if (t.includes('-')) {
      n = parseHyphenNumber(t)
    } else {
      n = parseSingleNumberWord(t)
    }
    if (n === null) break
    // Only accept 1- or 2-digit chunks for concatenation
    if (n >= 0 && n <= 99) {
      parts.push(n)
      consumed++
    } else {
      break
    }
  }
  // Allow a single hyphenated token like "twenty-one" as 21
  if (parts.length === 1 && tokens[0].toLowerCase().includes('-')) {
    const single = parts[0]
    if (single >= 10 && single <= 99) return { value: single, consumed }
  }
  // Handle grouped patterns like "fifty five ten" → 55-10 → 5510
  // Pattern: TENS followed by UNIT followed by... should be grouped as (TENS+UNIT)
  if (parts.length >= 3) {
    const firstIsTens = TENS[tokens[0].toLowerCase()] !== undefined
    const secondIsUnit = UNITS[tokens[1].toLowerCase()] !== undefined && tokens[1].toLowerCase() !== 'oh'
    if (firstIsTens && secondIsUnit) {
      const grouped = (parts[0] + parts[1]).toString()
      const remaining = parts.slice(2).map(p => p.toString()).join('')
      const concat = parseInt(grouped + remaining, 10)
      if (!isNaN(concat)) return { value: concat, consumed: 2 + (parts.length - 2) }
    }
  }
  // Handle patterns like "twelve thirty four" → 12-34 → 1234
  // Pattern: UNIT followed by TENS followed by UNIT should be grouped as UNIT+(TENS+UNIT)
  if (parts.length >= 3) {
    const firstIsUnit = UNITS[tokens[0].toLowerCase()] !== undefined && tokens[0].toLowerCase() !== 'oh'
    const secondIsTens = TENS[tokens[1].toLowerCase()] !== undefined
    const thirdIsUnit = UNITS[tokens[2].toLowerCase()] !== undefined && tokens[2].toLowerCase() !== 'oh'
    if (firstIsUnit && secondIsTens && thirdIsUnit) {
      const firstPart = parts[0].toString()
      const grouped = (parts[1] + parts[2]).toString()
      const remaining = parts.slice(3).map(p => p.toString()).join('')
      const concat = parseInt(firstPart + grouped + remaining, 10)
      if (!isNaN(concat)) return { value: concat, consumed: 3 + (parts.length - 3) }
    }
  }
  if (parts.length >= 2 && parts.length <= 4) {
    const concat = parseInt(parts.map(p => p.toString()).join(''), 10)
    if (!isNaN(concat)) return { value: concat, consumed }
  }
  return null
}
// Normalize spoken ZIP codes in address strings
// Detects patterns like "one five two oh seven" → "15207"
function normalizeSpokenZipInAddress(address: string): string {
  // Pattern: comma followed by 5 spoken digits/oh, possibly with spaces or "zero"
  const zipPattern = /,\s*(zero|one|two|three|four|five|six|seven|eight|nine|oh)(?:\s+(zero|one|two|three|four|five|six|seven|eight|nine|oh)){4}(?:\s*$)/gi
  return address.replace(zipPattern, (match) => {
    const hasComma = match.includes(',')
    const digits = match.toLowerCase().split(/\s+/).filter(t => t && t !== ',').map(t => {
      if (t === 'zero' || t === 'oh') return '0'
      return UNITS[t]?.toString() || t
    })
    if (digits.length === 5 && digits.every(d => /^\d$/.test(d))) {
      return hasComma ? `, ${digits.join('')}` : digits.join('')
    }
    return match
  })
}
function looksLikeStreetRemainder(text: string): boolean {
  const rest = text.trim().replace(/^,\s*/, '')
  if (!rest) return false
  const tokens = rest.split(/\s+/)
  if (tokens.length >= 2) return true // at least two words after number
  // or if a direction then a word
  if (tokens.length >= 1 && DIRECTIONS.has(tokens[0].toLowerCase())) return true
  // or contains a known suffix anywhere in first few tokens
  const firstFew = tokens.slice(0, 6).map(t => t.replace(/[^a-zA-Z]/g,'').toLowerCase())
  return firstFew.some(t => STREET_SUFFIXES.has(t))
}
function convertLeadingSpokenStreetNumber(address: string): string {
  const input = address
  // Early check for ordinal street names (e.g., "Fifty Fifth Street")
  // Collect first few words to check for ordinal patterns
  const firstWords: string[] = []
  let i = 0
  while (i < input.length && /\s/.test(input[i])) i++
  let cursor = i
  for (let j = 0; j < 3 && cursor < input.length; j++) {
    const wordMatch = /([A-Za-z\-]+)/y
    wordMatch.lastIndex = cursor
    const m = wordMatch.exec(input)
    if (!m) break
    firstWords.push(m[1])
    cursor = wordMatch.lastIndex
    // Skip separators
    const sepMatch = /([\s,]+)/y
    sepMatch.lastIndex = cursor
    const sm = sepMatch.exec(input)
    if (sm) cursor = sepMatch.lastIndex
  }
  if (isOrdinalStreetName(firstWords)) {
    return address // Don't convert ordinal street names
  }
  // Iteratively consume leading number-word tokens (allow commas/spaces after each token)
  cursor = i
  const tokens: string[] = []
  let tokenCount = 0
  const MAX_TOKENS = 7
  while (tokenCount < MAX_TOKENS && cursor < input.length) {
    const wordMatch = /([A-Za-z\-]+)/y
    wordMatch.lastIndex = cursor
    const m = wordMatch.exec(input)
    if (!m) break
    const word = m[1]
    const nextPos = wordMatch.lastIndex
    // Peek following separators (spaces/commas)
    const sepMatch = /([\s,]+)/y
    sepMatch.lastIndex = nextPos
    const sm = sepMatch.exec(input)
    const afterSep = sm ? sepMatch.lastIndex : nextPos
    if (!isNumberWordToken(word)) break
    tokens.push(word)
    tokenCount++
    cursor = afterSep
  }
  if (tokens.length === 0) return address
  // Build rest from cursor onward
  const rest = input.slice(cursor)
  // Prefer concatenation-style parsing first (e.g., "sixteen thirty-two", "one twenty-five")
  let consumed = tokens.length
  let num: number | null = null
  const conc = tryParseConcatenated(tokens)
  if (conc) { num = conc.value; consumed = conc.consumed }
  if (num === null) {
    // Fallback to cardinal phrase parsing (e.g., "five hundred", "one thousand six hundred thirty-two")
    num = tryParseCardinal(tokens)
    consumed = tokens.length
  }
  if (num === null) return address
  if (num < 10) return address // plausible house number check
  if (!looksLikeStreetRemainder(rest)) return address
  // If there are leftover tokens (beyond consumed) prepend them to rest
  const leftoverTokens = tokens.slice(consumed)
  const adjustedRest = (leftoverTokens.length > 0 ? leftoverTokens.join(' ') + ' ' : '') + rest
  const cleanedRest = adjustedRest.trim().replace(/^,\s*/, '')
  return `${num} ${cleanedRest}`.trim()
}
// Remove leading conversational filler words from timing fields
// Boundary-aware: only removes from the start, not from within meaningful phrases
function stripLeadingFillerWords(text: string): string {
  let normalized = text.trim();
  // Remove leading filler words (case-insensitive, with optional punctuation/whitespace)
  // Use word boundary \b to avoid matching parts of other words (e.g., "so" in "sometime")
  const fillerPatterns = [
    /^\s*uhh?\b[\s.,;:—\-–]*\s*/i,
    /^\s*umm?\b[\s.,;:—\-–]*\s*/i,
    /^\s*yeah\b[\s.,;:—\-–]*\s*/i,
    /^\s*yep\b[\s.,;:—\-–]*\s*/i,
    /^\s*okay\b[\s.,;:—\-–]*\s*/i,
    /^\s*ok\b[\s.,;:—\-–]*\s*/i,
    /^\s*alright\b[\s.,;:—\-–]*\s*/i,
    /^\s*so\b[\s.,;:—\-–]*\s*/i,
  ];
  // Apply each filler pattern repeatedly to handle multiple consecutive fillers
  let changed = true;
  let iterations = 0;
  const MAX_ITERATIONS = 5; // Increased to handle filler+punctuation chains
  while (changed && iterations < MAX_ITERATIONS) {
    changed = false;
    for (const pattern of fillerPatterns) {
      const before = normalized;
      normalized = normalized.replace(pattern, '');
      if (before !== normalized) {
        changed = true;
      }
    }
    iterations++;
  }
  // Clean up any remaining leading punctuation after filler removal
  // This catches cases like "... after 5" where the filler is gone but punctuation remains
  normalized = normalized.replace(/^[\s.,;:—\-–]+/, '');
  return normalized.trim();
}
// Field-specific normalization for timing preferences
// Preserves timing values like "Wednesday", "This week", "Whenever"
export const normalizeTiming = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  const original = text.trim();
  let normalized = original;
  // Remove leading filler words (uh, um, yeah, okay, etc.)
  normalized = stripLeadingFillerWords(normalized);
  // Timing-specific conversational prefixes (strictly anchored)
  const timingPrefixPatterns = [
    /^\s*i would like it\s+/i,
    /^\s*i need it\s+/i,
    /^\s*i prefer\s+/i,
    /^\s*my preferred time is\s+/i,
    /^\s*the best time is\s+/i,
    /^\s*i'?m available\s+/i,
  ];
  // Apply timing-specific prefixes
  for (const pattern of timingPrefixPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  // Apply safe trimming and capitalization
  normalized = safeTrimAndCapitalize(normalized);
  // Corruption guard: if normalization damaged the value, return original trimmed
  if (isNormalizationDamaged(original, normalized)) {
    return safeTrimAndCapitalize(original);
  }
  // Apply content sanitization for display
  normalized = sanitizeTiming(normalized);
  return normalized;
};
// Field-specific normalization for additional details
// More permissive for conversational text, but still conservative
export const normalizeAdditionalDetails = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  const original = text.trim();
  let normalized = original;
  // Details-specific conversational prefixes (strictly anchored)
  const detailsPrefixPatterns = [
    /^\s*additional details:\s*/i,
    /^\s*notes:\s*/i,
    /^\s*please note that\s+/i,
    /^\s*also\s+/i,
  ];
  // Apply details-specific prefixes
  for (const pattern of detailsPrefixPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  // Apply safe trimming and capitalization
  normalized = safeTrimAndCapitalize(normalized);
  // Corruption guard: if normalization damaged the value, return original trimmed
  if (isNormalizationDamaged(original, normalized)) {
    return safeTrimAndCapitalize(original);
  }
  // Apply content sanitization for display
  normalized = sanitizeAdditionalDetails(normalized);
  return normalized;
};
// Legacy function for backward compatibility
// Maps to field-specific functions based on context
// DEPRECATED: Use field-specific functions instead
export const normalizeText = (text: string | null | undefined): string => {
  return safeTrimAndCapitalize(text);
};
// Normalize business name for SMS interpolation
// Trims whitespace and rejects placeholders
export const normalizeBusinessNameForSms = (businessName: string | null | undefined): string | null => {
  if (!businessName || businessName.trim() === '') return null;
  const trimmed = businessName.trim();
  // Reject placeholders
  const lower = trimmed.toLowerCase();
  if (PLACEHOLDER_NAMES.has(lower)) {
    return null;
  }
  // Collapse multiple internal spaces to single space
  const normalized = trimmed.replace(/\s+/g, ' ').trim();
  return normalized || null;
};
// Normalize customer name for SMS greeting
// Rejects placeholders and phone numbers
export const normalizeCustomerNameForSms = (customerName: string | null | undefined): string | null => {
  const normalized = normalizeCustomerName(customerName);
  // Reject placeholders
  if (normalized && PLACEHOLDER_NAMES.has(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
};
// Polish conversational timing wrappers without changing meaning
export const polishTimingWrapper = (timing: string | null | undefined): string => {
  if (!timing || timing.trim() === '') return 'Not collected';
  let normalized = timing.trim();
  // Remove common conversational wrappers while preserving the core timing
  const wrapperPatterns = [
    { pattern: /^sometime in the (next|following)/i, replacement: '$1' },
    { pattern: /^sometime in (next|following)/i, replacement: '$1' },
    { pattern: /^sometime (next|following)/i, replacement: '$1' },
    { pattern: /, if that'?s possible$/i, replacement: '' },
    { pattern: /, if possible$/i, replacement: '' },
    { pattern: /^as soon as you (?:guys )?can get here$/i, replacement: 'As soon as possible' },
    { pattern: /^as soon as (?:you )?can$/i, replacement: 'As soon as possible' },
    { pattern: /^whenever (?:you )?can$/i, replacement: 'Whenever' },
    // Completion-time specific patterns
    { pattern: /^i'?d like it completed /i, replacement: '' },
    { pattern: /^i would like it completed /i, replacement: '' },
    { pattern: /^i'?d like it done /i, replacement: '' },
    { pattern: /^i would like it done /i, replacement: '' },
    { pattern: /^i'?d like to have it finished /i, replacement: '' },
    { pattern: /^i would like to have it finished /i, replacement: '' },
    { pattern: /^i need it done /i, replacement: '' },
    { pattern: /^there'?s no rush$/i, replacement: 'No rush' },
  ];
  for (const { pattern, replacement } of wrapperPatterns) {
    normalized = normalized.replace(pattern, replacement);
  }
  // Trim trailing comma, period, or space
  normalized = normalized.replace(/[.,\s]+$/, '').trim();
  // Sentence capitalize
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  return normalized || 'Not collected';
};
// Normalize callback timing specifically
// Removes conversational wrappers while preserving meaningful qualifiers
export const normalizeCallbackTime = (callbackTime: string | null | undefined): string => {
  if (!callbackTime || callbackTime.trim() === '') return 'Not collected';
  let normalized = callbackTime.trim();
  // Remove leading filler words (uh, um, yeah, okay, etc.)
  normalized = stripLeadingFillerWords(normalized);
  // Remove callback-specific conversational wrappers
  const callbackPatterns = [
    { pattern: / are best for calling me$/i, replacement: '' },
    { pattern: / is best for calling me$/i, replacement: '' },
    { pattern: / are best$/i, replacement: '' },
    { pattern: / is best$/i, replacement: '' },
    { pattern: / work best$/i, replacement: '' },
    { pattern: / works best$/i, replacement: '' },
    { pattern: /^you can call me /i, replacement: '' },
    { pattern: /^call me /i, replacement: '' },
    { pattern: /^sometime in the (morning|afternoon|evening)$/i, replacement: '$1' },
    { pattern: /^sometime in (morning|afternoon|evening)$/i, replacement: '$1' },
    { pattern: / is fine$/i, replacement: '' },
  ];
  for (const { pattern, replacement } of callbackPatterns) {
    normalized = normalized.replace(pattern, replacement);
  }
  // Trim trailing comma, period, or space
  normalized = normalized.replace(/[.,\s]+$/, '').trim();
  // Sentence capitalize
  normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
  return normalized || 'Not collected';
};
// Helper function to format AI intake summary (used by SMS and dashboard)
// Accepts both Simple Mode field names and canonical field names interchangeably.
// Uses polished, customer-friendly presentation with clear captured/missing separation.
export const formatAiIntakeSummary = (
  intakeData: any,
  callerPhone: string,
  businessName?: string,
  prefixNotice?: string,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): string => {
  // Read canonical field names with backward compatibility
  const customerName = normalizeCustomerNameForSms(
    intakeData?.customerName ?? intakeData?.callerName
  );
  const serviceAddress = normalizeAddressForDisplay(
    normalizeAddress(
      intakeData?.serviceAddress ?? intakeData?.addressOrLocation
    )
  );
  const desiredCompletionTime = polishTimingWrapper(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeCallbackTime(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );
  // Extract details field separately from request
  const { hasDetails, detailsValue } = hasMeaningfulDetails(intakeData);
  // Use canonical request field for SMS (concise, professional summary)
  // Match completion checker alias resolution: serviceRequested || reasonForCalling || request || issueDescription
  const serviceRequestedRaw = normalizeServiceReason(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling ?? intakeData?.request ?? intakeData?.issueDescription
  );
  const serviceRequested = intakeData?.request
    ? generateCanonicalRequestTitle(intakeData.request)
    : generateCanonicalRequestTitle(serviceRequestedRaw);
  // Determine which fields have actual meaningful values
  const hasName = customerName && customerName.trim() !== '' && !isPlaceholderValue(customerName, PLACEHOLDER_NAMES);
  const hasRequest = serviceRequested &&
                     serviceRequested.trim() !== '' &&
                     serviceRequested !== 'General Service' &&
                     serviceRequested !== 'Not collected' &&
                     !isPlaceholderValue(serviceRequested, PLACEHOLDER_SERVICES);
  const hasAddress = serviceAddress && serviceAddress.trim() !== '' && serviceAddress !== 'Not collected';
  const hasCompletionTime = desiredCompletionTime && desiredCompletionTime !== 'Not collected' && desiredCompletionTime.trim() !== '';
  const hasCallbackTime = callbackTime && callbackTime !== 'Not collected' && callbackTime.trim() !== '';
  // Business name: normalize and reject placeholders
  const displayName = normalizeBusinessNameForSms(businessName);
  const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';
  // Determine if address is applicable based on service location type
  const mode = typeof serviceLocationType === 'string' ? serviceLocationType.trim().toLowerCase() : 'onsite';
  const normalizedMode = (mode === 'onsite' || mode === 'customer_comes_to_business' || mode === 'remote') ? mode : 'onsite';
  const addressIsApplicable = normalizedMode === 'onsite';
  // Build greeting
  let greeting: string;
  if (hasName && displayName) {
    greeting = `Hi ${customerName}, thanks for reaching out to ${displayName}.`;
  } else if (hasName) {
    greeting = `Hi ${customerName}, thanks for reaching out.`;
  } else if (displayName) {
    greeting = `Thanks for reaching out to ${displayName}.`;
  } else {
    greeting = 'Thanks for reaching out.';
  }
  // Determine which meaningful fields are captured (only show actual captured values, not "Not collected")
  const capturedFields: string[] = [];
  if (hasRequest) capturedFields.push(`• Request: ${serviceRequested}`);
  if (hasDetails) capturedFields.push(`• Details: ${truncateForSms(detailsValue, 200)}`);
  if (hasAddress) capturedFields.push(`• Address: ${serviceAddress}`);
  if (hasCompletionTime) capturedFields.push(`• Desired completion: ${desiredCompletionTime}`);
  if (hasCallbackTime) capturedFields.push(`• Preferred callback: ${callbackTime}`);
  // Determine which fields are still needed (customer-friendly prompts)
  // Note: details are optional - do not ask for them
  const stillNeededFields: string[] = [];
  if (!hasName) stillNeededFields.push('• Your name');
  if (!hasRequest) stillNeededFields.push('• What you\'re looking to have done');
  // Additional details are optional - do not add to still-needed list
  if (addressIsApplicable && !hasAddress) stillNeededFields.push('• Service address');
  if (!hasCompletionTime) stillNeededFields.push('• When you\'d like it completed');
  if (!hasCallbackTime) stillNeededFields.push('• Best time to call you');
  // Build message
  let body = `${prefix}${greeting}\n\n`;
  // Case 1: Near-empty intake - ask for what's needed
  if (capturedFields.length === 0) {
    body += `To help the team follow up, reply with:\n${stillNeededFields.join('\n')}\n\n`;
    body += `Send whatever you know — we'll pass it along to the team.`;
    return body.trim();
  }
  // Case 2: Partial intake - show captured and ask for missing
  if (stillNeededFields.length > 0) {
    body += `Here's what we captured:\n${capturedFields.join('\n')}\n\n`;
    body += `Still needed:\n${stillNeededFields.join('\n')}\n\n`;
    body += `Reply here with the missing details or anything else you'd like to add.`;
    return body.trim();
  }
  // Case 3: Complete intake - show captured and confirm
  body += `Here's what we captured:\n${capturedFields.join('\n')}\n\n`;
  body += `We've shared this with the team. Reply here if you'd like to add anything.`;
  return body.trim();
};
/**
 * Generate adaptive SMS message based on intake completeness level
 * Uses friendly, natural copy that sounds like a business message
 *
 * Message Levels:
 * - Level A (Minimal): No useful information collected → simple reply prompt
 * - Level B (Some): Service known → personalized acknowledgment
 * - Level C (Partial): Service + some context → structured summary with partial ending
 * - Level D (Complete): Sufficient information → structured summary with complete ending
 */
export const formatAdaptiveIntakeSms = (
  intakeData: any,
  callerPhone: string,
  businessName?: string,
  prefixNotice?: string,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): string => {
  // Read canonical field names with backward compatibility
  const customerName = normalizeCustomerNameForSms(
    intakeData?.customerName ?? intakeData?.callerName
  );
  const serviceAddress = normalizeAddressForDisplay(
    normalizeAddress(
      intakeData?.serviceAddress ?? intakeData?.addressOrLocation
    )
  );
  const desiredCompletionTime = polishTimingWrapper(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeCallbackTime(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );
  const serviceRequestedRaw = normalizeServiceReason(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling ?? intakeData?.request ?? intakeData?.issueDescription
  );
  // Extract details field
  const { hasDetails, detailsValue } = hasMeaningfulDetails(intakeData);
  // Use canonical title for SMS Service field (concise, professional summary)
  // Priority: intakeData.request (canonical) → serviceRequested (canonicalized) → fallback
  const serviceRequested = intakeData?.request
    ? generateCanonicalRequestTitle(intakeData.request)
    : generateCanonicalRequestTitle(serviceRequestedRaw);
  // Determine which fields have actual meaningful values
  const hasName = customerName && customerName.trim() !== '' && !isPlaceholderValue(customerName, PLACEHOLDER_NAMES);
  const hasRequest = serviceRequested &&
                     serviceRequested.trim() !== '' &&
                     serviceRequested !== 'General Service' &&
                     serviceRequested !== 'Not collected' &&
                     !isPlaceholderValue(serviceRequested, PLACEHOLDER_SERVICES);
  const hasAddress = serviceAddress && serviceAddress.trim() !== '';
  const hasCompletionTime = desiredCompletionTime && desiredCompletionTime !== 'Not collected' && desiredCompletionTime.trim() !== '';
  const hasCallbackTime = callbackTime && callbackTime !== 'Not collected' && callbackTime.trim() !== '';
  // Detect potential quality issues
  const serviceLooksLikeQuestion = hasRequest && looksLikeQuestion(serviceRequestedRaw);
  const serviceIsQuestionOrPlaceholder = serviceLooksLikeQuestion || !hasRequest;
  // Business name: normalize and reject placeholders
  const displayName = normalizeBusinessNameForSms(businessName);
  const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';
  // Determine if location should be shown (for non-onsite businesses, location may not be relevant)
  const mode = typeof serviceLocationType === 'string' ? serviceLocationType.trim().toLowerCase() : 'onsite';
  const normalizedMode = (mode === 'onsite' || mode === 'customer_comes_to_business' || mode === 'remote') ? mode : 'onsite';
  const shouldShowLocation = normalizedMode === 'onsite' && hasAddress;
  // Semantic completeness: prioritize useful information
  // Customer name improves personalization but doesn't make intake substantially complete
  // Phone number doesn't count since ReplyFlow already has it
  const meaningfulFields = [
    hasRequest, // Service/request is most important
    shouldShowLocation && hasAddress, // Location when relevant
    hasCompletionTime, // Timing
    hasCallbackTime // Callback preference
  ];
  const meaningfulFieldCount = meaningfulFields.filter(Boolean).length;
  // OBSERVABILITY: Log field presence for debugging and monitoring
  console.log('[AI SMS FORMATTER FIELD PRESENCE]', {
    callerPhone,
    businessName: displayName,
    hasName,
    hasRequest,
    hasAddress,
    hasCompletionTime,
    hasCallbackTime,
    shouldShowLocation,
    meaningfulFieldCount,
    normalizedMode,
    serviceLocationType: mode,
    extractedInfoKeys: Object.keys(intakeData || {}),
    // Quality issue flags for trust
    serviceLooksLikeQuestion,
    serviceIsQuestionOrPlaceholder,
    timestamp: new Date().toISOString()
  });
  // Level A: Minimal information - no useful details
  if (meaningfulFieldCount === 0) {
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    // Build dynamic list of missing fields to request
    // Canonical intake requirements from voice flow:
    // - Always required: request, timing, callback
    // - Conditional (onsite only): address
    // - Optional: details
    const { hasDetails } = hasMeaningfulDetails(intakeData);
    const missingFields = [];
    if (!hasRequest) missingFields.push('What you need help with');
    // Details are optional - do not ask for them
    if (!hasAddress && shouldShowLocation) missingFields.push('Service address');
    if (!hasCompletionTime) missingFields.push('When you\'d like the work completed');
    if (!hasCallbackTime) missingFields.push('Best time to call you back');
    let missingFieldsText;
    if (missingFields.length === 0) {
      missingFieldsText = 'Reply here if you\'d like to add or change anything.';
    } else if (missingFields.length === 1) {
      missingFieldsText = `Reply here with ${missingFields[0].toLowerCase()}.`;
    } else {
      missingFieldsText = `To help us get everything ready, reply with:\n${missingFields.map(f => `• ${f}`).join('\n')}`;
    }
    return `${prefix}${greeting}${businessPart}\n\n${missingFieldsText}`;
  }
  // Level B: Service only - personalized acknowledgment
  if (meaningfulFieldCount === 1 && hasRequest) {
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    // Build dynamic list of missing fields to request
    // Details are optional - do not ask for them
    const { hasDetails } = hasMeaningfulDetails(intakeData);
    const missingFields = [];
    // Details are optional - do not ask for them
    if (!hasAddress && shouldShowLocation) missingFields.push('Service address');
    if (!hasCompletionTime) missingFields.push('When you\'d like the work completed');
    if (!hasCallbackTime) missingFields.push('Best time to call you back');
    let missingFieldsText;
    if (missingFields.length === 0) {
      missingFieldsText = 'We\'ll share these details with the team, and they\'ll follow up soon. Reply here if you\'d like to add anything.';
    } else if (missingFields.length === 1) {
      missingFieldsText = `We'll share these details with the team, and they'll follow up soon. Reply here with ${missingFields[0].toLowerCase()}.`;
    } else {
      missingFieldsText = `To help us get everything ready, reply with:\n${missingFields.map(f => `• ${f}`).join('\n')}`;
    }
    return `${prefix}${greeting}${businessPart}\n\nWe got your request for ${serviceRequested}.\n\n${missingFieldsText}`;
  }
  // Level C: Partial intake - service + some context
  if (meaningfulFieldCount === 2) {
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    let body = `${prefix}${greeting}${businessPart}\n\nHere's what we captured:\n`;
    // Service (always show if available)
    if (hasRequest) {
      body += `• Service: ${serviceRequested}`;
    }
    // Details (if available)
    if (hasDetails) {
      body += `\n\n• Details: ${truncateForSms(detailsValue, 200)}`;
    }
    // Location (without emoji to avoid UCS-2 encoding)
    if (shouldShowLocation && hasAddress) {
      body += `\n\n• Address: ${serviceAddress}`;
    }
    // Timing (without emoji)
    if (hasCompletionTime) {
      body += `\n\n• Preferred timing: ${desiredCompletionTime}`;
    }
    // Callback (without emoji)
    if (hasCallbackTime) {
      body += `\n\n• Best callback time: ${callbackTime}`;
    }
    // Partial intake closing
    body += `\n\nWe've shared these details with the team, and they'll follow up soon. Reply here if you'd like to add anything.`;
    return body.trim();
  }
  // Level D: Complete intake - sufficient information
  // Request is REQUIRED for complete intake
  if (!hasRequest) {
    // Fall back to partial intake if request is missing
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    let body = `${prefix}${greeting}${businessPart}\n\nHere's what we captured:\n`;
    // Service (missing)
    // Details (if available)
    if (hasDetails) {
      body += `• Details: ${truncateForSms(detailsValue, 200)}`;
    }
    // Location (without emoji)
    if (shouldShowLocation && hasAddress) {
      body += `\n\n• Address: ${serviceAddress}`;
    }
    // Timing (without emoji)
    if (hasCompletionTime) {
      body += `\n\n• Preferred timing: ${desiredCompletionTime}`;
    }
    // Callback (without emoji)
    if (hasCallbackTime) {
      body += `\n\n• Best callback time: ${callbackTime}`;
    }
    // Ask for missing request
    body += `\n\nStill needed:\n• What you need help with\n\n`;
    body += `Reply here with the missing details or anything else you'd like to add.`;
    return body.trim();
  }
  const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
  const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
  let body = `${prefix}${greeting}${businessPart}\n\nHere's what we captured:\n`;
  if (hasRequest) {
    body += `• Service: ${serviceRequested}`;
  }
  // Details (if available)
  if (hasDetails) {
    body += `\n\n• Details: ${truncateForSms(detailsValue, 200)}`;
  }
  // Location (without emoji to avoid UCS-2 encoding)
  if (shouldShowLocation && hasAddress) {
    body += `\n\n• Address: ${serviceAddress}`;
  }
  // Timing (without emoji)
  if (hasCompletionTime) {
    body += `\n\n• Preferred timing: ${desiredCompletionTime}`;
  }
  // Callback (without emoji)
  if (hasCallbackTime) {
    body += `\n\n• Best callback time: ${callbackTime}`;
  }
  // Complete intake closing
  body += `\n\nWe've shared this with the team, and they'll follow up soon. Reply here if anything changes.`;
  return body.trim();
};
// Wrapper that applies service-location omission logic for Address field
// For non-onsite businesses, address is not applicable and should not be requested
export const formatAiIntakeSummaryWithMode = (
  intakeData: any,
  callerPhone: string,
  businessName?: string,
  prefixNotice?: string,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): string => {
  // Pass serviceLocationType directly to the main formatter
  // The formatter will handle address applicability logic
  let body = formatAiIntakeSummary(intakeData, callerPhone, businessName, prefixNotice, serviceLocationType);
  return body;
}
/**
 * Generate an office-assistant style summary for the AI Intake UI
 * This is different from the SMS summary - it's designed to feel like a helpful receptionist's note
 *
 * Requirements:
 * - Lead with the customer
 * - Describe what happened naturally
 * - Remove internal implementation language
 * - Never mention database state
 * - Never say "AI Intake completed successfully"
 * - Never sound robotic
 * - Keep summaries concise (2-4 sentences)
 * - End with a useful suggested next step when appropriate
 *
 * Example style:
 * "Amber is a new customer who called about scheduling a Brazilian wax. A follow-up text has already been sent, but she hasn't replied yet. No appointment has been scheduled, so consider following up tomorrow if you don't hear back."
 */
export const generateOfficeAssistantSummary = (
  intakeData: any,
  outcome?: string,
  isNewCustomer?: boolean
): string => {
  // Read Simple Mode field names first, fall back to canonical aliases
  const customerName = normalizeCustomerName(
    intakeData?.customerName ?? intakeData?.callerName
  );
  const serviceRequested = normalizeServiceReason(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling
  );
  const desiredCompletionTime = normalizeTiming(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeTiming(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );
  const hasName = customerName && customerName !== 'Not collected';
  const hasRequest = serviceRequested && serviceRequested !== 'Not collected';
  const hasCompletionTime = desiredCompletionTime && desiredCompletionTime !== 'Not collected';
  const hasCallbackTime = callbackTime && callbackTime !== 'Not collected';
  const name = hasName ? customerName : 'This customer';
  const isNew = isNewCustomer !== false; // Default to true if not specified
  // Build the summary naturally
  let sentences: string[] = [];
  // Sentence 1: Who they are and why they called
  if (isNew) {
    sentences.push(`${name} is a new customer`);
  } else {
    sentences.push(`${name} is a returning customer`);
  }
  if (hasRequest) {
    sentences[sentences.length - 1] += ` who called about ${serviceRequested.toLowerCase()}`;
  } else {
    sentences[sentences.length - 1] += ` who called`;
  }
  // Sentence 2: Timing information if available
  if (hasCompletionTime) {
    sentences.push(`They're looking for completion around ${desiredCompletionTime.toLowerCase()}`);
  } else if (hasCallbackTime) {
    sentences.push(`The best time to reach them is ${callbackTime.toLowerCase()}`);
  }
  // Sentence 3: Suggested next step based on outcome
  if (outcome === 'early_hangup' || outcome === 'no_speech') {
    sentences.push('A recovery text was sent automatically, but they haven\'t responded yet');
  } else if (hasRequest) {
    sentences.push('Consider following up to schedule an appointment');
  } else {
    sentences.push('Consider following up to learn more about their needs');
  }
  // Combine sentences into a natural paragraph
  let summary = sentences.join('. ');
  // Ensure proper capitalization and punctuation
  summary = summary.charAt(0).toUpperCase() + summary.slice(1);
  if (!summary.endsWith('.')) {
    summary += '.';
  }
  return summary;
}
