// Phone formatting utilities for carrier-compatible forwarding codes

/**
 * Normalizes a phone number for carrier forwarding codes
 * Removes +, spaces, and formatting characters that carriers don't recognize
 */
export function normalizeForCarrier(phoneNumber: string): string {
  if (!phoneNumber) return ''
  
  return phoneNumber
    .replace(/^\+/, '')          // Remove leading +
    .replace(/\s/g, '')          // Remove all spaces
    .replace(/[()-]/g, '')       // Remove parentheses and dashes
    .replace(/\./g, '')         // Remove dots
    .trim()
}

/**
 * Normalizes a phone number to E.164 format for SMS sending
 * Accepts: 4128553010, (412) 855-3010, 412-855-3010, +14128553010, +1 412 855 3010
 * Returns: +14128553010
 *
 * Note: Only supports US/Canada numbers (10-11 digits). International numbers require explicit E.164 input.
 */
export function normalizeToE164(phoneNumber: string): string {
  if (!phoneNumber) return ''

  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '')

  // If empty after cleaning, return empty
  if (!digits) return ''

  // If it's a 10-digit US number, add +1 country code
  if (digits.length === 10) {
    return `+1${digits}`
  }

  // If it's an 11-digit number starting with 1, add + and return (US/Canada with country code)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  // If it's already in E.164 format (starts with + and is valid length), return as-is
  if (phoneNumber.startsWith('+')) {
    const digitsOnly = phoneNumber.replace(/\D/g, '')
    // Accept if it's a valid E.164 length (country code + 1-14 digits = 11-15 total)
    if (digitsOnly.length >= 11 && digitsOnly.length <= 15) {
      return phoneNumber
    }
  }

  // Invalid format - reject rather than converting arbitrary strings
  return ''
}

/**
 * Validates a phone number as E.164 format
 * Returns true if the number appears to be valid E.164
 */
export function isValidE164(phoneNumber: string): boolean {
  if (!phoneNumber) return false

  // E.164 format: + followed by 1-15 digits, starting with country code
  const e164Regex = /^\+[1-9]\d{1,14}$/
  return e164Regex.test(phoneNumber)
}

/**
 * Formats a phone number for display (readable format)
 * Keeps formatting for user-friendly display
 */
export function formatForDisplay(phoneNumber: string): string {
  if (!phoneNumber) return ''
  
  // If it's a clean 10-digit US number, format as (XXX) XXX-XXXX
  const clean = phoneNumber.replace(/\D/g, '')
  if (clean.length === 10) {
    return `(${clean.slice(0, 3)}) ${clean.slice(3, 6)}-${clean.slice(6)}`
  }
  
  // If it has +1 and 10 digits, format as +1 (XXX) XXX-XXXX
  if (clean.length === 11 && clean.startsWith('1')) {
    return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`
  }
  
  // Otherwise return as-is
  return phoneNumber
}

/**
 * Generates carrier-compatible forwarding code
 */
export function generateForwardingCode(template: string, twilioNumber: string): string {
  const normalizedTwilioNumber = normalizeForCarrier(twilioNumber)
  return template.replace('{{TWILIO_NUMBER}}', normalizedTwilioNumber)
}
