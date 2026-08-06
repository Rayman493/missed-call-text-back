/**
 * Phone number masking utilities for production logging
 * Redacts sensitive phone numbers while preserving operational information
 */

/**
 * Mask a phone number for production logging
 * Preserves country code and last 4 digits for operational debugging
 * 
 * @param phoneNumber - The phone number to mask (E.164 format preferred)
 * @returns Masked phone number (e.g., "+1***5555")
 */
export function maskPhoneNumber(phoneNumber: string | null | undefined): string {
  if (!phoneNumber) {
    return '[null]'
  }

  const str = String(phoneNumber).trim()
  
  // If already masked or too short, return as-is
  if (str.includes('***') || str.length < 4) {
    return str
  }

  // For E.164 format (e.g., +14125551234)
  if (str.startsWith('+')) {
    const countryCode = str.slice(0, 2) // +1 or +44
    const last4 = str.slice(-4)
    return `${countryCode}***${last4}`
  }

  // For US format without + (e.g., 14125551234 or 4125551234)
  if (str.length === 11 && str.startsWith('1')) {
    const countryCode = '+1'
    const last4 = str.slice(-4)
    return `${countryCode}***${last4}`
  }

  // For 10-digit US numbers (e.g., 4125551234)
  if (str.length === 10) {
    const last4 = str.slice(-4)
    return `***${last4}`
  }

  // Fallback: show only last 4 digits
  const last4 = str.slice(-4)
  return `***${last4}`
}

/**
 * Mask multiple phone numbers in an object for logging
 * Recursively masks any string field that looks like a phone number
 * 
 * @param data - The data object to sanitize
 * @returns Sanitized data with phone numbers masked
 */
export function maskPhoneNumbersInData(data: any): any {
  if (!data) {
    return data
  }

  if (typeof data === 'string') {
    // Check if string looks like a phone number (10+ digits, possibly with + or -)
    if (/^[\d\+\-\(\)\s]{10,}$/.test(data)) {
      return maskPhoneNumber(data)
    }
    return data
  }

  if (Array.isArray(data)) {
    return data.map(item => maskPhoneNumbersInData(item))
  }

  if (typeof data === 'object') {
    const result: any = {}
    for (const key in data) {
      // Skip known non-phone fields
      if (['id', 'name', 'status', 'created_at'].includes(key)) {
        result[key] = data[key]
      } else if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('number')) {
        result[key] = maskPhoneNumber(data[key])
      } else {
        result[key] = maskPhoneNumbersInData(data[key])
      }
    }
    return result
  }

  return data
}
