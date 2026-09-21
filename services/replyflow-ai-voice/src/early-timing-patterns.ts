/**
 * Early timing/callback extraction patterns
 * Extracted from index.ts for testability
 * These patterns require strong intent context to avoid false positives
 */

/**
 * Patterns for early desiredCompletionTime extraction
 * Only match when temporal language clearly expresses requested service timing intent
 */
export const EARLY_COMPLETION_PATTERNS = [
  /(?:i'd like|i would like|i want|i need)\s+(?:it\s+)?(?:done|completed|finished)\s+(?:by|on|in|sometime|this|next|today|tomorrow|this week|next week|no rush|whenever|as soon as possible|asap)([^.!?]*)/i,
  /(?:i'd like|i would like|i want|i need)\s+(?:someone|somebody)\s+(?:to come\s+)?(?:out|here)\s+(?:by|on|in|sometime|this|next|today|tomorrow|this week|next week|monday|tuesday|wednesday|thursday|friday)([^.!?]*)/i,
  /(?:can you|could you)\s+(?:come|get here|make it)\s+(?:by|on|in|sometime|this|next|today|tomorrow|this week|next week)([^.!?]*)/i,
  /(?:hopefully|maybe)\s+(?:sometime|this|next|today|tomorrow|this week|next week)([^.!?]*)/i,
  /(?:no rush|whenever|as soon as possible|asap)([^.!?]*)/i,
];

/**
 * Patterns for early callbackTime extraction
 * Only match when temporal language clearly expresses contact/availability preference
 */
export const EARLY_CALLBACK_PATTERNS = [
  /(?:best time|good time|prefer)\s+(?:to|at|in|on|after|before|between|anytime|morning|afternoon|evening|night|today|tomorrow)\b([^.!?]*?(?=\s+if you\s+|[.!?]|$))/i,
  /(?:call me|call back|reach me|contact me)\s+(?:at|in|on|after|before|between|anytime|morning|afternoon|evening|night|today|tomorrow)\b([^.!?]*?(?=\s+if you\s+|[.!?]|$))/i,
  /(?:i'm|i am)\s+(?:available|free)\s+(?:anytime|morning|afternoon|evening|night|after \d+|before \d+|between \d+ and \d+)([^.!?]*?(?=\s+if you\s+|[.!?]|$))/i,
  // "ok" must be word-bounded so it does not match inside "okay" and leave a
  // mid-word capture ("ay, but ...") as the extracted callback value.
  /(?:anytime|morning|afternoon|evening|night)s?\s+(?:are|work|is)\s+(?:best|good|fine|ok(?:ay)?)\b([^.!?]*?(?=\s+if you\s+|[.!?]|$))/i,
  /(?:morning|afternoon|evening|night)s?\s+(?:would|will|'d|'ll)\s+(?:be\s+)?(?:best|good|fine|ok(?:ay)?|easier|easiest|prefer(?:red)?)\b([^.!?]*?(?=\s+if you\s+|[.!?]|$))/i,
  /(?:you can reach me|reach me|contact me)\s+(?:at|in|on|after|before|between|anytime|morning|afternoon|evening|night)\b([^.!?]*?(?=\s+if you\s+|[.!?]|$))/i,
];

/**
 * Extract early desiredCompletionTime using production patterns
 */
export function extractEarlyCompletionTime(transcript: string): string | null {
  for (const pattern of EARLY_COMPLETION_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}

/**
 * Extract early callbackTime using production patterns
 */
export function extractEarlyCallbackTime(transcript: string): string | null {
  for (const pattern of EARLY_CALLBACK_PATTERNS) {
    const match = transcript.match(pattern);
    if (match) {
      return match[0].trim();
    }
  }
  return null;
}