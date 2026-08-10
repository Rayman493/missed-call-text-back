import { sanitizeCustomerName, sanitizeServiceRequested, sanitizeAdditionalDetails, sanitizeServiceAddress, sanitizeTiming } from './content-sanitization'

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
    'Pressure Washing': [/\bpressure\s*(?:wash|wash|clean)/i, /\bdriveway\s*(?:wash|clean)/i],
    'Piano Lessons': [/\bpiano\s*(?:lesson|learn|teach|class|instruction)/i],
    'AC Repair': [/\b(?:air\s*conditioner|ac|a\/c|hvac)\s*(?:repair|fix|not working|broken|leaking|stopped)/i, /\bair\s*(?:conditioning|conditioner)\s*(?:problem|issue|trouble)/i],
    'Fence Installation': [/\bfence\s*(?:install|installation|new|replace|put in|set up)/i],
    'Kitchen Leak Repair': [/\bkitchen\s*(?:sink|faucet|pipe)\s*(?:leak|drip|leaking|dripping)/i, /\bkitchen\s*(?:plumbing|repair|fix)/i],
    'Plumbing Repair': [/\bplumbing\s*(?:repair|fix|issue|problem)/i, /\b(?:sink|faucet|pipe|toilet|drain)\s*(?:leak|drip|leaking|dripping|clogged|blocked)/i],
    'Electrical Repair': [/\belectrical\s*(?:repair|fix|issue|problem|work)/i, /\b(?:outlet|switch|wire|wiring|circuit)\s*(?:repair|fix|broken|not working)/i],
    'Carpet Cleaning': [/\bcarpet\s*(?:clean|wash|shampoo|steam)/i],
    'House Cleaning': [/\bhouse\s*(?:clean|cleaning|maid|service)/i, /\bhome\s*(?:clean|cleaning)/i],
    'Window Cleaning': [/\bwindow\s*(?:clean|wash|cleaning)/i],
    'Roof Repair': [/\broof\s*(?:repair|fix|leak|replace)/i],
    'Painting': [/\bpaint(?:ing)?\s*(?:interior|exterior|house|home|room)/i],
    'Flooring': [/\bfloor(?:ing)?\s*(?:install|installation|repair|replace|refinish)/i],
    'HVAC Service': [/\bhvac\s*(?:service|maintenance|repair|install)/i, /\b(?:heating|cooling|furnace|boiler)\s*(?:service|repair|install)/i],
    'Pool Service': [/\bpool\s*(?:clean|cleaning|maintenance|service|repair)/i],
    'Junk Removal': [/\bjunk\s*(?:remove|removal|haul|pickup)/i],
    'Moving Service': [/\b(?:move|moving)\s*(?:service|help|company)/i],
    'Tree Service': [/\btree\s*(?:trim|prune|remove|removal|cut|service)/i],
    'Landscaping': [/\blandscape\s*(?:design|install|maintenance|service)/i, /\bgarden\s*(?:service|maintenance|design)/i],
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
  };

  // Try to match against service mappings first
  for (const [serviceTitle, patterns] of Object.entries(serviceMappings)) {
    for (const pattern of patterns) {
      if (pattern.test(processed)) {
        // Ensure the result is 2-5 words
        const titleWords = serviceTitle.split(' ');
        if (titleWords.length >= 2 && titleWords.length <= 5) {
          return serviceTitle;
        }
      }
    }
  }

  // Fallback: Extract key service nouns (2-5 words max)
  const priorityNouns = [
    'piano', 'guitar', 'violin', 'drums', 'lesson', 'class', 'training',
    'kitchen', 'bathroom', 'bedroom', 'sink', 'toilet', 'faucet', 'pipe', 'drain',
    'ac', 'air', 'conditioner', 'heater', 'furnace', 'boiler', 'hvac',
    'lawn', 'yard', 'grass', 'tree', 'fence', 'roof', 'gutter',
    'car', 'truck', 'vehicle', 'brake', 'tire', 'oil',
    'carpet', 'floor', 'window', 'paint', 'pool',
    'lock', 'key', 'camera', 'alarm',
    'solar', 'panel', 'photograph', 'consult',
    'wax', 'brazilian', 'hair', 'nail', 'facial', 'massage', 'spa',
  ];

  const extractedWords: string[] = [];
  const usedIndices = new Set<number>();

  // Extract priority nouns
  words.forEach((word, index) => {
    if (priorityNouns.includes(word) && !usedIndices.has(index) && extractedWords.length < 5) {
      extractedWords.push(word);
      usedIndices.add(index);
    }
  });

  // If no priority nouns found, take first 2-3 meaningful words
  if (extractedWords.length === 0) {
    for (let i = 0; i < Math.min(words.length, 3); i++) {
      if (words[i].length > 2) {
        extractedWords.push(words[i]);
      }
    }
  }

  if (extractedWords.length === 0) return 'General Service';

  // Ensure 2-5 words
  const finalWords = extractedWords.slice(0, 5);
  
  // If only 1 word, add generic suffix
  if (finalWords.length === 1) {
    const word = finalWords[0].toLowerCase();
    if (['piano', 'guitar', 'violin', 'drums'].includes(word)) {
      return `${word.charAt(0).toUpperCase() + word.slice(1)} Lessons`;
    } else if (['lawn', 'yard', 'grass', 'tree'].includes(word)) {
      return `${word.charAt(0).toUpperCase() + word.slice(1)} Service`;
    } else if (['sink', 'toilet', 'faucet', 'pipe', 'drain'].includes(word)) {
      return `${word.charAt(0).toUpperCase() + word.slice(1)} Repair`;
    } else if (['ac', 'air', 'conditioner', 'heater', 'furnace'].includes(word)) {
      return `${word.charAt(0).toUpperCase() + word.slice(1)} Repair`;
    } else {
      return `${word.charAt(0).toUpperCase() + word.slice(1)} Service`;
    }
  }

  // Convert to Title Case
  const titleCased = finalWords.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');

  return titleCased || 'General Service';
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
export const normalizeAddressForDisplay = (text: string | null | undefined): string => {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed === '') return '';
  // Remove trailing periods only, preserving internal periods
  return trimmed.replace(/\.+$/, '');
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
  
  // Address/location-specific conversational prefixes (strictly anchored)
  const addressPrefixPatterns = [
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
  ];
  
  // Apply address-specific prefixes
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
  'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
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
  if (parts.length >= 2 && parts.length <= 4) {
    const concat = parseInt(parts.map(p => p.toString()).join(''), 10)
    if (!isNaN(concat)) return { value: concat, consumed }
  }
  return null
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
  // Iteratively consume leading number-word tokens (allow commas/spaces after each token)
  let i = 0
  // skip leading spaces
  while (i < input.length && /\s/.test(input[i])) i++

  const tokens: string[] = []
  let cursor = i
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

// Field-specific normalization for timing preferences
// Preserves timing values like "Wednesday", "This week", "Whenever"
export const normalizeTiming = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  
  const original = text.trim();
  let normalized = original;
  
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

// Helper function to format AI intake summary (used by SMS and dashboard)
// Accepts both Simple Mode field names and canonical field names interchangeably.
export const formatAiIntakeSummary = (
  intakeData: any,
  callerPhone: string,
  businessName?: string,
  prefixNotice?: string
): string => {
  // Read Simple Mode field names first, fall back to canonical aliases
  const customerName = normalizeCustomerName(
    intakeData?.customerName ?? intakeData?.callerName
  );
  const serviceAddress = normalizeAddressForDisplay(
    normalizeAddress(
      intakeData?.serviceAddress ?? intakeData?.addressOrLocation
    )
  );
  const desiredCompletionTime = normalizeTiming(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeTiming(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );

  // Combine serviceRequested and issueDescription into single Request field
  const serviceRequested = normalizeServiceReason(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling
  );
  const issueDescription = normalizeAdditionalDetails(
    intakeData?.issueDescription ?? intakeData?.importantDetails
  );
  
  // Build combined Request field
  let request = serviceRequested;
  if (issueDescription && issueDescription !== 'Not collected' && issueDescription !== serviceRequested) {
    request = serviceRequested === 'Not collected' 
      ? issueDescription 
      : `${serviceRequested}\n\n${issueDescription}`;
  }
  
  // Always generate a concise canonical title for the SMS Request line
  // Apply sentence capitalization for natural reading in SMS
  // Priority: intakeData.request (canonical) → serviceRequested (canonicalized) → fallback
  const canonicalTitle = intakeData?.request 
    ? generateCanonicalRequestTitle(intakeData.request)
    : generateCanonicalRequestTitle(serviceRequested);
  const finalRequest = sentenceCapitalize(canonicalTitle);

  const displayName = businessName || 'us';
  const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';

  // Check which fields have actual values (not "Not collected" or empty)
  const hasName = customerName && customerName !== 'Not collected' && customerName.trim() !== '';
  const hasRequest = finalRequest && finalRequest !== 'Not collected' && finalRequest.trim() !== '';
  const hasAddress = serviceAddress && serviceAddress !== 'Not collected' && serviceAddress.trim() !== '';
  const hasCompletionTime = desiredCompletionTime && desiredCompletionTime !== 'Not collected' && desiredCompletionTime.trim() !== '';
  const hasCallbackTime = callbackTime && callbackTime !== 'Not collected' && callbackTime.trim() !== '';

  // If no fields captured, return generic acknowledgment
  if (!hasName && !hasRequest && !hasAddress && !hasCompletionTime && !hasCallbackTime) {
    return `Thanks for calling ${displayName}. We received your call and shared it with the business. They'll follow up as soon as possible.`;
  }

  // Build partial summary with Captured/Still Needed sections
  let body = `Thanks for calling ${displayName}!\n\n`;
  if (prefix) {
    body += prefix;
  }
  
  // Captured section
  const capturedFields = [];
  if (hasName) capturedFields.push(`✓ Customer: ${customerName}`);
  if (hasRequest) capturedFields.push(`✓ Request: ${finalRequest}`);
  if (hasAddress) capturedFields.push(`✓ Location: ${serviceAddress}`);
  if (hasCompletionTime) capturedFields.push(`✓ Desired Completion: ${desiredCompletionTime}`);
  if (hasCallbackTime) capturedFields.push(`✓ Best Callback Time: ${callbackTime}`);
  
  if (capturedFields.length > 0) {
    body += `Captured:\n${capturedFields.join('\n')}\n\n`;
  }
  
  // Still Needed section
  const stillNeededFields = [];
  if (!hasName) stillNeededFields.push('○ Customer');
  if (!hasRequest) stillNeededFields.push('○ Request');
  if (!hasAddress) stillNeededFields.push('○ Location');
  if (!hasCompletionTime) stillNeededFields.push('○ Desired Completion');
  if (!hasCallbackTime) stillNeededFields.push('○ Best Callback Time');
  
  if (stillNeededFields.length > 0) {
    body += `Still Needed:\n${stillNeededFields.join('\n')}\n\n`;
  }
  
  body += `We'll share this with the business. They'll follow up as soon as possible.`;
  
  return body;
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
  const customerName = normalizeCustomerName(
    intakeData?.customerName ?? intakeData?.callerName
  );
  const serviceAddress = normalizeAddressForDisplay(
    normalizeAddress(
      intakeData?.serviceAddress ?? intakeData?.addressOrLocation
    )
  );
  const desiredCompletionTime = normalizeTiming(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeTiming(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );
  const serviceRequested = normalizeServiceReason(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling
  );

  // Determine which fields have actual meaningful values
  const hasName = customerName && customerName !== 'Not collected' && customerName.trim() !== '';
  const hasRequest = serviceRequested && serviceRequested !== 'Not collected' && serviceRequested.trim() !== '';
  const hasAddress = serviceAddress && serviceAddress !== 'Not collected' && serviceAddress.trim() !== '';
  const hasCompletionTime = desiredCompletionTime && desiredCompletionTime !== 'Not collected' && desiredCompletionTime.trim() !== '';
  const hasCallbackTime = callbackTime && callbackTime !== 'Not collected' && callbackTime.trim() !== '';

  // Business name: use if available, otherwise omit entirely
  const displayName = businessName && businessName.trim() ? businessName : null;
  const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';

  // Determine if location should be shown (for non-onsite businesses, location may not be relevant)
  const mode = typeof serviceLocationType === 'string' ? serviceLocationType.trim().toLowerCase() : 'onsite';
  const normalizedMode = (mode === 'onsite' || mode === 'customer_comes_to_business' || mode === 'remote') ? mode : 'onsite';
  const shouldShowLocation = normalizedMode === 'onsite' || hasAddress;

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

  // Level A: Minimal information - no useful details
  if (meaningfulFieldCount === 0) {
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    return `${prefix}${greeting}${businessPart} Reply here with what you need help with and we'll make sure the business gets it.`;
  }

  // Level B: Service only - personalized acknowledgment
  if (meaningfulFieldCount === 1 && hasRequest) {
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    return `${prefix}${greeting}${businessPart}\n\nWe got your request for ${serviceRequested.toLowerCase()}.\n\nWe'll pass this along. Reply here if you'd like to add or change anything.`;
  }

  // Level C: Partial intake - service + some context
  if (meaningfulFieldCount === 2) {
    const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
    const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
    let body = `${prefix}${greeting}${businessPart}\n\nHere's what we got:\n`;

    // Service (always show if available)
    if (hasRequest) {
      body += `• ${serviceRequested}`;
    }

    // Location (without emoji to avoid UCS-2 encoding)
    if (shouldShowLocation && hasAddress) {
      body += `\n• ${serviceAddress}`;
    }

    // Timing (without emoji)
    if (hasCompletionTime) {
      body += `\n• ${desiredCompletionTime}`;
    }

    // Callback (without emoji)
    if (hasCallbackTime) {
      body += `\n• Best callback: ${callbackTime}`;
    }

    body += `\n\nWe'll pass this along. Reply here if you'd like to add or change anything.`;

    return body.trim();
  }

  // Level D: Complete intake - sufficient information
  const greeting = hasName ? `Hi ${customerName}!` : 'Hi!';
  const businessPart = displayName ? ` Thanks for reaching out to ${displayName}.` : ' Thanks for reaching out.';
  let body = `${prefix}${greeting}${businessPart}\n\nHere's what we got:\n`;

  if (hasRequest) {
    body += `• ${serviceRequested}`;
  }

  if (shouldShowLocation && hasAddress) {
    body += `\n• ${serviceAddress}`;
  }

  if (hasCompletionTime) {
    body += `\n• ${desiredCompletionTime}`;
  }

  if (hasCallbackTime) {
    body += `\n• Best callback: ${callbackTime}`;
  }

  body += `\n\nWe've got everything we need for now. We'll share this with the business and they'll follow up soon. Reply here if anything changes.`;

  return body.trim();
};

// Wrapper that applies service-location omission logic for Location block
export const formatAiIntakeSummaryWithMode = (
  intakeData: any,
  callerPhone: string,
  businessName?: string,
  prefixNotice?: string,
  serviceLocationType?: 'onsite' | 'customer_comes_to_business' | 'remote' | string | null
): string => {
  const mode = typeof serviceLocationType === 'string' ? serviceLocationType.trim().toLowerCase() : 'onsite';
  const normalizedMode = (mode === 'onsite' || mode === 'customer_comes_to_business' || mode === 'remote') ? mode : 'onsite';
  const locationProvided = Boolean(intakeData?.serviceAddress || intakeData?.addressOrLocation);
  
  let body = formatAiIntakeSummary(intakeData, callerPhone, businessName, prefixNotice);
  
  // For non-onsite modes, remove Location from Still Needed section if not provided
  if ((normalizedMode === 'customer_comes_to_business' || normalizedMode === 'remote') && !locationProvided) {
    body = body.replace(/○ Location\n/, '');
    // Also remove empty "Still Needed:" section if Location was the only missing field
    body = body.replace(/Still Needed:\n\n/, '');
  }
  
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
