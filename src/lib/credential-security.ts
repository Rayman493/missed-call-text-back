/**
 * Credential Security Utilities
 * 
 * This module provides utilities for handling sensitive credential data securely
 * to prevent persistence in browser storage and ensure proper cleanup.
 */

export interface CredentialFieldConfig {
  type: 'password' | 'text'
  autoComplete: 'new-password' | 'off'
  placeholder: string
}

/**
 * Get secure input configuration for credential fields
 */
export function getCredentialInputConfig(hasSavedValue: boolean = false): CredentialFieldConfig {
  return {
    type: 'password',
    autoComplete: 'new-password',
    placeholder: hasSavedValue ? 'Saved securely — enter a new value to replace' : 'Enter credential'
  }
}

/**
 * Secure form submission handler for credential fields
 * Only updates credentials if the field is non-empty
 */
export function prepareCredentialSubmission(formData: FormData, credentialFields: string[]): Record<string, any> {
  const updates: Record<string, any> = {}
  
  credentialFields.forEach(fieldName => {
    const value = formData.get(fieldName) as string
    // Only include credential if it's non-empty
    if (value && value.trim() !== '') {
      updates[fieldName] = value.trim()
    }
  })
  
  return updates
}

/**
 * Clear credential-related data from browser storage
 */
export function clearCredentialData(): void {
  if (typeof window === 'undefined') return
  
  // Clear sessionStorage
  const sessionKeysToRemove: string[] = []
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i)
    if (key && isCredentialKey(key)) {
      sessionKeysToRemove.push(key)
    }
  }
  sessionKeysToRemove.forEach(key => sessionStorage.removeItem(key))
  
  // Clear localStorage
  const localKeysToRemove: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && isCredentialKey(key)) {
      localKeysToRemove.push(key)
    }
  }
  localKeysToRemove.forEach(key => localStorage.removeItem(key))
}

/**
 * Check if a storage key might contain credential data
 */
function isCredentialKey(key: string): boolean {
  const credentialKeywords = [
    'credential',
    'token',
    'secret',
    'key',
    'password',
    'auth',
    'api',
    'twilio',
    'stripe',
    'webhook'
  ]
  
  return credentialKeywords.some(keyword => 
    key.toLowerCase().includes(keyword.toLowerCase())
  )
}

/**
 * Generate a secure form field name for credentials
 */
export function generateCredentialFieldName(baseName: string): string {
  return `credential_${baseName}`
}

/**
 * Validate credential field value
 */
export function validateCredentialValue(value: string, fieldName: string): { isValid: boolean; error?: string } {
  if (!value || value.trim() === '') {
    return { isValid: true } // Empty values are valid (will skip update)
  }
  
  // Basic validation rules
  if (value.length < 8) {
    return { isValid: false, error: 'Credential must be at least 8 characters long' }
  }
  
  if (value.includes(' ')) {
    return { isValid: false, error: 'Credential cannot contain spaces' }
  }
  
  // Field-specific validation
  if (fieldName.toLowerCase().includes('token') && !value.match(/^[a-zA-Z0-9\-_]+$/)) {
    return { isValid: false, error: 'Token can only contain letters, numbers, hyphens, and underscores' }
  }
  
  return { isValid: true }
}

/**
 * Create a secure credential input component props
 */
export function createSecureInputProps(fieldName: string, hasSavedValue: boolean = false) {
  const config = getCredentialInputConfig(hasSavedValue)
  
  return {
    type: config.type as 'password',
    autoComplete: config.autoComplete as 'new-password',
    placeholder: config.placeholder,
    name: generateCredentialFieldName(fieldName),
    id: generateCredentialFieldName(fieldName),
    // Add data attributes for security
    'data-sensitive': 'true',
    'data-field-type': 'credential'
  }
}
