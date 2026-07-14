/**
 * Content Sanitization Utility
 *
 * Provides professional masking of offensive words in AI-extracted structured fields.
 * This is a display sanitization layer, not an autocorrection feature.
 *
 * Rules:
 * - Preserve raw transcripts and recordings exactly as captured
 * - Only sanitize business-facing structured display fields
 * - Use token-aware matching to avoid false positives on legitimate names
 * - Field-aware behavior: stricter for names, more permissive for sentences
 * - Never guess corrected names or replace with alternatives
 */

/**
 * Field types for context-aware sanitization
 */
export type SanitizationFieldType = 
  | 'name'           // Customer name - strictest handling
  | 'request'        // Service requested
  | 'details'        // Additional details
  | 'address'        // Service address
  | 'timing'         // Callback time, desired completion
  | 'generic'        // Generic text field

/**
 * Offensive word lexicon for token matching
 * Includes common profanity and offensive terms that should be masked
 * This is a maintainable internal lexicon appropriate for launch
 */
const OFFENSIVE_WORDS = new Set([
  // Common profanity
  'fuck', 'shit', 'damn', 'ass', 'bitch', 'bastard', 'crap', 'hell',
  'dick', 'piss', 'cock', 'pussy', 'whore', 'slut', 'fag', 'nigga',
  'nigger', 'retard', 'idiot', 'moron', 'douche', 'douchebag',
  
  // Compound offensive terms
  'fuckface', 'shithead', 'asshole', 'dickhead', 'bastard', 'bullshit',
  'dumbass', 'jackass', 'dumbfuck', 'shitstain', 'asswipe', 'dickwad',
  
  // Variations and common misspellings
  'dammit', 'damnit', 'fuk', 'sh1t', 'azz', 'biatch', 'b1tch',
])

/**
 * Legitimate names and words that should NOT be masked
 * These are exceptions to prevent false positives
 */
const LEGITIMATE_EXCEPTIONS = new Set([
  // Common surnames and place names
  'dick', 'dickinson', 'dickinson', 'hancock', 'cockburn', 'cocke',
  'ash', 'ashley', 'ashleigh', 'cassandra', 'cass', 'glass', 'glasser',
  'bass', 'bassett', 'scunthorpe', 'middlesex', 'essex', 'sussex',
  'cockermouth', 'cocking', 'cockshot', 'prick', 'prickett',
  
  // Common words that contain offensive substrings
  'assistant', 'class', 'classic', 'grass', 'pass', 'passing', 'passion',
  'mass', 'massive', 'compass', 'happiness', 'bass', 'bassett',
  'glass', 'glasses', 'grass', 'grassy', 'brass', 'brassiere',
  'cocktail', 'cockpit', 'peacock', 'woodpecker', 'hitchcock',
  'shitterton', 'shit', 'shitake', 'mushroom', 'shitake',
])

/**
 * Tokenize text into words while preserving punctuation
 * This ensures we match standalone words, not substrings
 */
function tokenize(text: string): Array<{ word: string; start: number; end: number }> {
  const tokens: Array<{ word: string; start: number; end: number }> = []
  const wordRegex = /([a-zA-Z]+)/g
  let match
  
  while ((match = wordRegex.exec(text)) !== null) {
    tokens.push({
      word: match[1],
      start: match.index,
      end: match.index + match[1].length
    })
  }
  
  return tokens
}

/**
 * Check if a word is a legitimate exception that should not be masked
 */
function isLegitimateException(word: string): boolean {
  const lowerWord = word.toLowerCase()
  return LEGITIMATE_EXCEPTIONS.has(lowerWord)
}

/**
 * Check if a word is offensive
 */
function isOffensiveWord(word: string): boolean {
  const lowerWord = word.toLowerCase()
  return OFFENSIVE_WORDS.has(lowerWord)
}

/**
 * Mask a single offensive word
 * Preserves first and last character, replaces internal letters with asterisks
 * For very short words, masks more aggressively
 */
function maskWord(word: string): string {
  if (word.length <= 2) {
    // Very short words - mask entirely or use minimal
    return word[0] + '*'.repeat(word.length - 1)
  }
  
  if (word.length <= 4) {
    // Short words - preserve first char, mask rest
    return word[0] + '*'.repeat(word.length - 1)
  }
  
  // Longer words - preserve first and last char, mask middle
  return word[0] + '*'.repeat(word.length - 2) + word[word.length - 1]
}

/**
 * Sanitize a structured display value based on field type
 *
 * @param value - The text to sanitize
 * @param fieldType - The type of field for context-aware behavior
 * @returns Sanitized display value
 */
export function sanitizeStructuredDisplayValue(
  value: string | null | undefined,
  fieldType: SanitizationFieldType = 'generic'
): string {
  // Handle null/undefined/empty
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return value || ''
  }
  
  const text = value.trim()
  
  // For name fields, apply stricter handling
  if (fieldType === 'name') {
    return sanitizeNameField(text)
  }
  
  // For other fields, apply sentence-level sanitization
  return sanitizeSentenceField(text)
}

/**
 * Sanitize a name field with strict handling
 * If the entire name is clearly profane, mask it professionally
 * If masking cannot be done cleanly, use fallback
 */
function sanitizeNameField(name: string): string {
  const tokens = tokenize(name)
  
  // If only one word and it's offensive, mask it
  if (tokens.length === 1) {
    const { word } = tokens[0]
    
    if (isLegitimateException(word)) {
      return name // Don't mask legitimate names
    }
    
    if (isOffensiveWord(word)) {
      const masked = maskWord(word)
      // If masked result is too short or unclear, use fallback
      if (masked.length < 3) {
        return 'Unclear name'
      }
      return masked
    }
    
    return name // Not offensive, return as-is
  }
  
  // Multi-word name - check each word
  let result = name
  let hasOffensive = false
  
  // Process tokens in reverse order to preserve indices
  for (let i = tokens.length - 1; i >= 0; i--) {
    const { word, start, end } = tokens[i]
    
    if (isLegitimateException(word)) {
      continue // Don't mask legitimate exceptions
    }
    
    if (isOffensiveWord(word)) {
      hasOffensive = true
      const masked = maskWord(word)
      result = result.substring(0, start) + masked + result.substring(end)
    }
  }
  
  // If entire name appears to be profane (multiple offensive words), use fallback
  if (hasOffensive && tokens.length > 0) {
    const offensiveCount = tokens.filter(t => isOffensiveWord(t.word) && !isLegitimateException(t.word)).length
    if (offensiveCount >= tokens.length * 0.5) {
      // More than half the words are offensive - likely a prank name
      return 'Unclear name'
    }
  }
  
  return result
}

/**
 * Sanitize a sentence field (request, details, address, timing)
 * Mask standalone offensive words while preserving context
 */
function sanitizeSentenceField(text: string): string {
  const tokens = tokenize(text)
  
  if (tokens.length === 0) {
    return text
  }
  
  let result = text
  
  // Process tokens in reverse order to preserve indices
  for (let i = tokens.length - 1; i >= 0; i--) {
    const { word, start, end } = tokens[i]
    
    if (isLegitimateException(word)) {
      continue // Don't mask legitimate exceptions
    }
    
    if (isOffensiveWord(word)) {
      const masked = maskWord(word)
      result = result.substring(0, start) + masked + result.substring(end)
    }
  }
  
  return result
}

/**
 * Sanitize customer name specifically
 * Convenience wrapper for sanitizeStructuredDisplayValue with fieldType='name'
 */
export function sanitizeCustomerName(name: string | null | undefined): string {
  return sanitizeStructuredDisplayValue(name, 'name')
}

/**
 * Sanitize service requested
 * Convenience wrapper for sanitizeStructuredDisplayValue with fieldType='request'
 */
export function sanitizeServiceRequested(text: string | null | undefined): string {
  return sanitizeStructuredDisplayValue(text, 'request')
}

/**
 * Sanitize additional details
 * Convenience wrapper for sanitizeStructuredDisplayValue with fieldType='details'
 */
export function sanitizeAdditionalDetails(text: string | null | undefined): string {
  return sanitizeStructuredDisplayValue(text, 'details')
}

/**
 * Sanitize service address
 * Convenience wrapper for sanitizeStructuredDisplayValue with fieldType='address'
 */
export function sanitizeServiceAddress(text: string | null | undefined): string {
  return sanitizeStructuredDisplayValue(text, 'address')
}

/**
 * Sanitize timing field (callback time, desired completion)
 * Convenience wrapper for sanitizeStructuredDisplayValue with fieldType='timing'
 */
export function sanitizeTiming(text: string | null | undefined): string {
  return sanitizeStructuredDisplayValue(text, 'timing')
}
