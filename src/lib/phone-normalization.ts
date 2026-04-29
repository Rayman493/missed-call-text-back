/**
 * Phone Number Normalization Utilities
 * 
 * This module provides utilities for normalizing and formatting US phone numbers
 * from various user input formats to E.164 format.
 */

/**
 * Normalize a US phone number to E.164 format
 * 
 * @param input - Phone number in various formats
 * @returns Normalized E.164 string (+1XXXXXXXXXX) or null if invalid
 * 
 * Examples:
 * - 4128553010 → +14128553010
 * - (412) 855-3010 → +14128553010
 * - 1-412-855-3010 → +14128553010
 * - +1 412 855 3010 → +14128553010
 * - invalid numbers → null
 */
export function normalizeUSPhoneNumber(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  // Remove all non-digit characters
  const digits = input.replace(/\D/g, '')
  
  // Handle different length scenarios
  if (digits.length === 10) {
    // 10 digits: assume US number, prepend +1
    return `+1${digits}`
  } else if (digits.length === 11) {
    // 11 digits: must start with 1 for US numbers
    if (digits.startsWith('1')) {
      return `+${digits}`
    } else {
      return null // Invalid 11-digit number (doesn't start with 1)
    }
  } else if (digits.length === 12 && input.startsWith('+')) {
    // Already in E.164 format (+1XXXXXXXXXX)
    if (digits.startsWith('1')) {
      return `+${digits}`
    } else {
      return null // Invalid E.164 format
    }
  } else {
    // Invalid length
    return null
  }
}

/**
 * Format an E.164 phone number for display
 * 
 * @param e164 - Phone number in E.164 format (+1XXXXXXXXXX)
 * @returns Formatted phone number (XXX) XXX-XXXX or original if invalid
 */
export function formatPhoneForDisplay(e164: string): string {
  if (!e164 || typeof e164 !== 'string') {
    return e164 || ''
  }

  // Extract digits from E.164 format
  const digits = e164.replace(/\D/g, '')
  
  if (digits.length === 11 && digits.startsWith('1')) {
    const areaCode = digits.substring(1, 4)
    const centralOffice = digits.substring(4, 7)
    const lineNumber = digits.substring(7, 11)
    
    return `(${areaCode}) ${centralOffice}-${lineNumber}`
  }
  
  // Return original if can't format
  return e164
}

/**
 * Validate a phone number input
 * 
 * @param input - Phone number input to validate
 * @returns Validation result with isValid and error message
 */
export function validatePhoneNumber(input: string): { isValid: boolean; error?: string } {
  if (!input || typeof input !== 'string') {
    return { isValid: false, error: 'Enter a valid 10-digit US phone number.' }
  }

  const normalized = normalizeUSPhoneNumber(input)
  
  if (!normalized) {
    return { isValid: false, error: 'Enter a valid 10-digit US phone number.' }
  }
  
  return { isValid: true }
}

/**
 * Get phone number validation examples for UI display
 * 
 * @returns Array of example phone numbers that will be normalized correctly
 */
export function getPhoneNumberExamples(): string[] {
  return [
    '4128553010',
    '412-855-3010',
    '(412) 855-3010',
    '+1 412 855 3010',
    '1-412-855-3010'
  ]
}

/**
 * Test cases for phone number normalization
 * 
 * @returns Test results showing input → output mappings
 */
export function testPhoneNumberNormalization(): Array<{ input: string; output: string | null; description: string; passed: boolean }> {
  const testCases = [
    { input: '4128553010', expectedOutput: '+14128553010', description: '10 digits' },
    { input: '(412) 855-3010', expectedOutput: '+14128553010', description: 'Formatted with parentheses and dash' },
    { input: '1-412-855-3010', expectedOutput: '+14128553010', description: '11 digits with leading 1 and dashes' },
    { input: '+1 412 855 3010', expectedOutput: '+14128553010', description: 'E.164 format with spaces' },
    { input: '412.855.3010', expectedOutput: '+14128553010', description: 'Dots as separators' },
    { input: '412 855 3010', expectedOutput: '+14128553010', description: 'Spaces as separators' },
    { input: '412855301', expectedOutput: null, description: '9 digits (invalid)' },
    { input: '24128553010', expectedOutput: null, description: '11 digits not starting with 1 (invalid)' },
    { input: '+24128553010', expectedOutput: null, description: 'Invalid E.164 format' },
    { input: '', expectedOutput: null, description: 'Empty string' },
    { input: 'invalid', expectedOutput: null, description: 'Non-numeric characters' }
  ]

  return testCases.map(({ input, expectedOutput, description }) => ({
    input,
    output: normalizeUSPhoneNumber(input),
    description,
    passed: normalizeUSPhoneNumber(input) === expectedOutput
  }))
}
