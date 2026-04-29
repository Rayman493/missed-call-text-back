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

/**
 * Carrier-specific formatting rules
 */
export const CARRIER_FORMATTING_RULES = {
  // Most carriers prefer clean numbers without formatting
  default: normalizeForCarrier,
  
  // Some carriers have special requirements
  verizon: (phone: string) => normalizeForCarrier(phone),
  att: (phone: string) => normalizeForCarrier(phone),
  tmobile: (phone: string) => normalizeForCarrier(phone),
  comcast: (phone: string) => normalizeForCarrier(phone),
}
