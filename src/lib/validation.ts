/**
 * Validation utilities for business type and other user inputs
 */

/**
 * Validate custom business type
 * Returns { valid: boolean, error: string | null }
 */
export function validateBusinessTypeOther(value: string | null | undefined): { valid: boolean; error: string | null } {
  if (!value || value.trim() === '') {
    return { valid: false, error: 'Please specify your business type' }
  }

  const trimmed = value.trim()

  // Length validation
  if (trimmed.length < 2) {
    return { valid: false, error: 'Business type must be at least 2 characters' }
  }

  if (trimmed.length > 60) {
    return { valid: false, error: 'Business type must be 60 characters or less' }
  }

  // Reject URLs
  const urlPatterns = [
    /https?:\/\//i,
    /www\./i,
    /\.com$/i,
    /\.org$/i,
    /\.net$/i,
    /\.io$/i,
    /\.co$/i,
  ]
  for (const pattern of urlPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Business type cannot contain URLs' }
    }
  }

  // Reject email addresses
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, error: 'Business type cannot be an email address' }
  }

  // Reject phone numbers
  if (/^[\d\s\-\(\)\+]{10,}$/.test(trimmed)) {
    return { valid: false, error: 'Business type cannot be a phone number' }
  }

  // Reject prompt injection patterns
  const promptInjectionPatterns = [
    /ignore\s+(previous|all)\s+instructions/i,
    /act\s+as/i,
    /you\s+are\s+(chatgpt|gpt|claude|ai|assistant)/i,
    /system\s*:/i,
    /user\s*:/i,
    /assistant\s*:/i,
    /prompt\s*:/i,
    /instruction\s*:/i,
    /override/i,
    /bypass/i,
    /execute/i,
    /run\s+code/i,
    /eval/i,
    /script/i,
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
  ]
  for (const pattern of promptInjectionPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Invalid business type format' }
    }
  }

  // Reject profanity (basic list - can be expanded)
  const profanityPatterns = [
    /\b(fuck|shit|damn|hell|ass|bitch|bastard|crap|piss)\b/i,
  ]
  for (const pattern of profanityPatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Business type contains inappropriate language' }
    }
  }

  // Reject obviously inappropriate values
  const inappropriatePatterns = [
    /test/i,
    /demo/i,
    /fake/i,
    /spam/i,
    /scam/i,
    /xxx/i,
    /adult/i,
    /porn/i,
  ]
  for (const pattern of inappropriatePatterns) {
    if (pattern.test(trimmed)) {
      return { valid: false, error: 'Invalid business type' }
    }
  }

  return { valid: true, error: null }
}
