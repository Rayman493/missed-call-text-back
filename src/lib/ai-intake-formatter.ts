import { sanitizeCustomerName, sanitizeServiceRequested, sanitizeAdditionalDetails, sanitizeServiceAddress, sanitizeTiming } from './content-sanitization'

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
export const normalizeCustomerName = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  
  const original = text.trim();
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
  
  return normalized;
};

// Field-specific normalization for service reasons
// Removes intent-specific conversational prefixes
export const normalizeServiceReason = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  
  const original = text.trim();
  let normalized = original;
  
  // Service/intent-specific conversational prefixes (strictly anchored)
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

// Field-specific normalization for addresses
// Removes location-specific conversational prefixes
export const normalizeAddress = (text: string | null | undefined): string => {
  if (!text || text.trim() === '') return 'Not collected';
  
  const original = text.trim();
  let normalized = original;
  
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
  const serviceRequested = normalizeServiceReason(
    intakeData?.serviceRequested ?? intakeData?.reasonForCalling
  );
  const serviceAddress = normalizeAddress(
    intakeData?.serviceAddress ?? intakeData?.addressOrLocation
  );
  const desiredCompletionTime = normalizeTiming(
    intakeData?.desiredCompletionTime
  );
  const callbackTime = normalizeTiming(
    intakeData?.callbackTime ?? intakeData?.preferredCallbackTime
  );
  const issueDescription = normalizeAdditionalDetails(
    intakeData?.issueDescription ?? intakeData?.importantDetails
  );

  const displayName = businessName || 'us';
  const prefix = prefixNotice ? `${prefixNotice}\n\n` : '';

  return `Thanks for calling ${displayName}!

${prefix}📋 NEW CUSTOMER REQUEST

👤 Customer
${customerName}

📞 Phone
${callerPhone}

🛠️ Service Requested
${serviceRequested}

📍 Service Address
${serviceAddress}

📅 Desired Completion
${desiredCompletionTime}

☎️ Best Callback Time
${callbackTime}

📝 Additional Details
${issueDescription}

Reply to this message if you'd like to update or add any information.`;
};
