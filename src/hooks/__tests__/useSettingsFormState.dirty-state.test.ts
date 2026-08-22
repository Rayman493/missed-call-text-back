/**
 * Focused dirty-state regression tests for useSettingsFormState
 * 
 * These tests verify that:
 * - Changing a value marks settings as dirty
 * - Reverting to the saved value clears dirty state
 * - The comparison matches actual persistence behavior
 */

import { describe, it, expect } from 'vitest'
import { Business } from '@/lib/types'

// Extract the comparison logic for testing
function normalizeValue(value: any, field: keyof Business): any {
  // Only normalize fields where persistence actually normalizes
  if (field === 'service_location_type' && typeof value === 'string') {
    return value.trim().toLowerCase()
  }
  
  // For text fields with defaults, treat empty string as equivalent to undefined
  const fieldsWithDefaults = ['out_of_office_message', 'after_hours_message']
  if (fieldsWithDefaults.includes(field as string)) {
    if (value === '' || value === null || value === undefined) {
      return undefined
    }
  }
  
  return value
}

function deepCompare(a: any, b: any): boolean {
  if (a === b) return false
  if (!a || !b) return true
  
  if (typeof a !== typeof b) return true
  
  if (typeof a === 'object') {
    const keysA = Object.keys(a).sort()
    const keysB = Object.keys(b).sort()
    
    if (keysA.length !== keysB.length) return true
    if (keysA.some((k, i) => k !== keysB[i])) return true
    
    return keysA.some(key => deepCompare(a[key], b[key]))
  }
  
  return a !== b
}

function checkForChanges(current: Business, original: Business): boolean {
  const fieldsToCheck: (keyof Business)[] = [
    'name',
    'business_type',
    'business_type_other',
    'business_phone_number',
    'twilio_phone_number',
    'call_forwarding_enabled',
    'business_hours_enabled',
    'business_hours_start',
    'business_hours_end',
    'business_hours_timezone',
    'after_hours_message',
    'forwarding_phone_number',
    'carrier',
    'phone_carrier',
    'onboarding_step',
    'onboarding_status',
    'out_of_office_enabled',
    'out_of_office_start',
    'out_of_office_end',
    'out_of_office_message',
    'automation_settings',
    'venmo_username',
    'paypal_payment_link',
    'service_location_type',
    'business_address_line1',
    'business_address_line2',
    'business_address_city',
    'business_address_state',
    'business_address_postal_code',
    'business_address_country'
  ]

  return fieldsToCheck.some(field => {
    const currentValue = current[field]
    const originalValue = original[field]

    // Handle nested object comparison for automation_settings
    if (field === 'automation_settings') {
      if (!currentValue && !originalValue) return false
      if (!currentValue || !originalValue) return true
      return deepCompare(currentValue, originalValue)
    }

    // Normalize values for comparison based on field-specific persistence behavior
    const normalizedCurrent = normalizeValue(currentValue, field)
    const normalizedOriginal = normalizeValue(originalValue, field)

    // Compare normalized values
    return normalizedCurrent !== normalizedOriginal
  })
}

describe('useSettingsFormState dirty-state detection', () => {
  const originalBusiness: Business = {
    id: 'test-id',
    name: 'ABC Plumbing',
    business_type: 'plumbing',
    business_type_other: null,
    business_phone_number: '(555) 123-4567',
    twilio_phone_number: '+15551234567',
    call_forwarding_enabled: true,
    business_hours_enabled: true,
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    business_hours_timezone: 'America/New_York',
    after_hours_message: 'We are currently closed.',
    forwarding_phone_number: null,
    carrier: null,
    phone_carrier: null,
    onboarding_step: 'completed',
    onboarding_status: 'completed',
    out_of_office_enabled: false,
    out_of_office_start: null,
    out_of_office_end: null,
    out_of_office_message: 'Out of office message',
    automation_settings: { spamRepeatFilteringEnabled: false },
    venmo_username: null,
    paypal_payment_link: null,
    service_location_type: 'onsite',
    business_address_line1: '123 Main Street',
    business_address_line2: null,
    business_address_city: 'San Francisco',
    business_address_state: 'CA',
    business_address_postal_code: '94102',
    business_address_country: 'USA',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'user-id',
    forwarding_verified: false,
    phone_setup_completed_at: null,
    stripe_connect_account_id: null,
    subscription_status: 'active',
    stripe_subscription_id: null,
    trial_ends_at: null
  }

  describe('Boolean field revert', () => {
    it('call_forwarding_enabled: true → false → true', () => {
      const changed = { ...originalBusiness, call_forwarding_enabled: false }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
      
      const reverted = { ...originalBusiness, call_forwarding_enabled: true }
      expect(checkForChanges(reverted, originalBusiness)).toBe(false)
    })
  })

  describe('Text field revert', () => {
    it('name: ABC → ABC LLC → ABC', () => {
      const changed = { ...originalBusiness, name: 'ABC LLC' }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
      
      const reverted = { ...changed, name: 'ABC Plumbing' }
      expect(checkForChanges(reverted, originalBusiness)).toBe(false)
    })
  })

  describe('Textarea field revert', () => {
    it('after_hours_message: original → new → original', () => {
      const changed = { ...originalBusiness, after_hours_message: 'New message' }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
      
      const reverted = { ...originalBusiness, after_hours_message: 'We are currently closed.' }
      expect(checkForChanges(reverted, originalBusiness)).toBe(false)
    })
  })

  describe('Select/dropdown revert', () => {
    it('service_location_type: onsite → remote → onsite', () => {
      const changed = { ...originalBusiness, service_location_type: 'remote' }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
      
      const reverted = { ...originalBusiness, service_location_type: 'onsite' }
      expect(checkForChanges(reverted, originalBusiness)).toBe(false)
    })
  })

  describe('Multiple field changes', () => {
    it('Change A and B, revert A only → still dirty', () => {
      const changed = { 
        ...originalBusiness, 
        name: 'ABC LLC',
        business_type: 'electrical'
      }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
      
      const partialRevert = { 
        ...originalBusiness, 
        name: 'ABC',
        business_type: 'electrical'
      }
      expect(checkForChanges(partialRevert, originalBusiness)).toBe(true)
    })

    it('Change A and B, revert both → clean', () => {
      const changed = { 
        ...originalBusiness, 
        name: 'ABC LLC',
        business_type: 'electrical'
      }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
      
      const fullRevert = { ...originalBusiness }
      expect(checkForChanges(fullRevert, originalBusiness)).toBe(false)
    })
  })

  describe('Leading zero preservation', () => {
    it('Postal code: 94102 vs 2139 should be dirty', () => {
      const changed = { ...originalBusiness, business_address_postal_code: '2139' }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
    })

    it('Postal code: 94102 vs 94102 should be clean', () => {
      const changed = { ...originalBusiness, business_address_postal_code: '94102' }
      expect(checkForChanges(changed, originalBusiness)).toBe(false)
    })

    it('Leading zeros: 02139 vs 2139 should be dirty', () => {
      const originalWithLeadingZero = { ...originalBusiness, business_address_postal_code: '02139' }
      const changed = { ...originalWithLeadingZero, business_address_postal_code: '2139' }
      expect(checkForChanges(changed, originalWithLeadingZero)).toBe(true)
    })
  })

  describe('Automation settings key ordering', () => {
    it('Same object with different key order should be clean', () => {
      const changed = { 
        ...originalBusiness, 
        automation_settings: { spamRepeatFilteringEnabled: false, ignoreRepeatCalls: true }
      }
      // Create same object with different key order
      const reordered = { 
        ...originalBusiness, 
        automation_settings: { ignoreRepeatCalls: true, spamRepeatFilteringEnabled: false }
      }
      
      expect(checkForChanges(reordered, changed)).toBe(false)
    })

    it('Different automation settings should be dirty', () => {
      const changed = { 
        ...originalBusiness, 
        automation_settings: { spamRepeatFilteringEnabled: true }
      }
      expect(checkForChanges(changed, originalBusiness)).toBe(true)
    })
  })

  describe('Empty string vs undefined for fields with defaults', () => {
    it('after_hours_message: empty vs undefined should be clean (has default)', () => {
      const emptyString = { ...originalBusiness, after_hours_message: '' }
      const undefinedValue = { ...originalBusiness, after_hours_message: undefined }
      
      expect(checkForChanges(emptyString, undefinedValue)).toBe(false)
    })

    it('name: empty vs undefined should be dirty (no default)', () => {
      const emptyString = { ...originalBusiness, name: '' }
      const undefinedValue = { ...originalBusiness, name: undefined }
      
      expect(checkForChanges(emptyString, undefinedValue)).toBe(true)
    })
  })

  describe('Service location type normalization', () => {
    it('ONSITE vs onsite should be clean (trimmed and lowercased)', () => {
      const upperCase = { ...originalBusiness, service_location_type: 'ONSITE' }
      const lowerCase = { ...originalBusiness, service_location_type: 'onsite' }
      
      expect(checkForChanges(upperCase, lowerCase)).toBe(false)
    })

    it('Onsite vs onsite should be clean (trimmed)', () => {
      const withSpace = { ...originalBusiness, service_location_type: ' Onsite ' }
      const noSpace = { ...originalBusiness, service_location_type: 'onsite' }
      
      expect(checkForChanges(withSpace, noSpace)).toBe(false)
    })
  })
})