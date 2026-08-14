/**
 * Payment Label Validation
 *
 * Validates user-provided payment display labels according to ReplyFlow requirements.
 */

export interface ValidationResult {
  isValid: boolean
  error?: string
  normalized?: string | null
}

const MAX_LENGTH = 80

/**
 * Validate and normalize a payment display label.
 *
 * Rules:
 * - Trim surrounding whitespace
 * - Collapse excessive internal whitespace
 * - Minimum: one meaningful character
 * - Maximum: 80 characters
 * - Reject control characters
 * - Reject strings containing only punctuation or emoji
 * - Allow normal customer names, job descriptions, addresses, numbers, and common punctuation
 * - Store plain text only
 * - Empty string clears the label (returns null)
 *
 * @param label - The user-provided label
 * @returns ValidationResult with normalized label or error message
 */
export function validatePaymentLabel(label: string | null | undefined): ValidationResult {
  // Handle null/undefined/empty as "clear the label"
  if (label === null || label === undefined) {
    return { isValid: true, normalized: null }
  }

  const trimmed = label.trim()

  // Empty string clears the label
  if (trimmed === '') {
    return { isValid: true, normalized: null }
  }

  // Check length
  if (trimmed.length > MAX_LENGTH) {
    return { isValid: false, error: `Label must be ${MAX_LENGTH} characters or less` }
  }

  // Check for control characters (except tab, newline)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed)) {
    return { isValid: false, error: 'Label contains invalid characters' }
  }

  // Check for meaningful content (not just punctuation/emoji/whitespace)
  const meaningfulChars = trimmed.replace(/[\p{P}\p{S}\p{Z}\p{C}]/gu, '')
  if (meaningfulChars.length === 0) {
    return { isValid: false, error: 'Label must contain meaningful text' }
  }

  // Collapse excessive whitespace
  const normalized = trimmed.replace(/\s+/g, ' ')

  return { isValid: true, normalized }
}

/**
 * Check if a payment status is eligible for label editing.
 *
 * Only completed payments (status = 'paid') can be renamed.
 * This prevents misleading labels on pending, failed, or canceled payments.
 *
 * @param status - The payment status
 * @returns true if the payment can be renamed
 */
export function isPaymentLabelEditable(status: string): boolean {
  return status === 'paid'
}