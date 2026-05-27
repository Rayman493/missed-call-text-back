/**
 * Normalize phone number to digits-only format for comparison
 * Handles various formats: +14122533598, (412) 253-3598, 412-253-3598, etc.
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  // Remove all non-digit characters
  return phoneNumber.replace(/\D/g, '')
}

/**
 * Normalize phone number to E.164 format if possible
 * If the number starts with 1 and is 11 digits, add + prefix
 * If the number is 10 digits, add +1 prefix
 */
export function normalizeToE164(phoneNumber: string): string {
  const digits = normalizePhoneNumber(phoneNumber)
  
  // If already has + prefix, return as-is
  if (phoneNumber.startsWith('+')) {
    return phoneNumber
  }
  
  // If 11 digits and starts with 1, add + prefix
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  
  // If 10 digits, assume US and add +1
  if (digits.length === 10) {
    return `+1${digits}`
  }
  
  // Otherwise return digits-only
  return digits
}

/**
 * Check if two phone numbers match
 * Compares normalized digit-only versions
 */
export function phoneNumbersMatch(phone1: string, phone2: string): boolean {
  const normalized1 = normalizePhoneNumber(phone1)
  const normalized2 = normalizePhoneNumber(phone2)
  
  // Direct match
  if (normalized1 === normalized2) {
    return true
  }
  
  // Check if one has country code and the other doesn't
  // (e.g., +14122533598 vs 4122533598)
  if (normalized1.length === 11 && normalized1.startsWith('1') && normalized2.length === 10) {
    return normalized1.slice(1) === normalized2
  }
  
  if (normalized2.length === 11 && normalized2.startsWith('1') && normalized1.length === 10) {
    return normalized2.slice(1) === normalized1
  }
  
  return false
}
