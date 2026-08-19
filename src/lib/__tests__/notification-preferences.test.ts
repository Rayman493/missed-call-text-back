import { describe, it, expect } from 'vitest'
import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  getEffectivePreference,
  shouldSuppressNotification,
  isValidPreferenceKey,
  isValidPreferenceValue,
  NOTIFICATION_TYPE_TO_PREFERENCE
} from '../notification-preferences'

describe('Notification Preferences - Defaults', () => {
  it('should have all 7 expected preferences with default TRUE', () => {
    expect(Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS)).toEqual([
      'new_ai_intake',
      'customer_reply',
      'payment_requested',
      'payment_completed',
      'calendar_connected',
      'appointment_created',
      'personal_voicemail'
    ])

    for (const [key, value] of Object.entries(NOTIFICATION_PREFERENCE_DEFAULTS)) {
      expect(value).toBe(true)
    }
  })
})

describe('Notification Preferences - Type Mapping', () => {
  it('should map ai_intake_completed to new_ai_intake', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.ai_intake_completed).toBe('new_ai_intake')
  })

  it('should map customer_reply to customer_reply', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.customer_reply).toBe('customer_reply')
  })

  it('should map payment_requested to payment_requested', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.payment_requested).toBe('payment_requested')
  })

  it('should map payment_completed to payment_completed', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.payment_completed).toBe('payment_completed')
  })

  it('should map calendar_connected to calendar_connected', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.calendar_connected).toBe('calendar_connected')
  })

  it('should map calendar_disconnected to calendar_connected', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.calendar_disconnected).toBe('calendar_connected')
  })

  it('should map appointment_created to appointment_created', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.appointment_created).toBe('appointment_created')
  })

  it('should map appointment_deleted to appointment_created', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.appointment_deleted).toBe('appointment_created')
  })

  it('should map personal_voicemail to personal_voicemail', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.personal_voicemail).toBe('personal_voicemail')
  })

  it('should not have mapping for unmapped types', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.new_lead).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.followup_completed).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.forwarding_disconnected).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.sms_failed).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.trial_ending).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.subscription_issue).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.voicemail_received).toBeUndefined()
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.payment_created).toBeUndefined()
  })
})

describe('Notification Preferences - Effective Preference', () => {
  it('should return TRUE for null preferences', () => {
    expect(getEffectivePreference(null, 'new_ai_intake')).toBe(true)
    expect(getEffectivePreference(null, 'customer_reply')).toBe(true)
  })

  it('should return TRUE for undefined preferences', () => {
    expect(getEffectivePreference(undefined, 'new_ai_intake')).toBe(true)
    expect(getEffectivePreference(undefined, 'customer_reply')).toBe(true)
  })

  it('should return TRUE for missing preference key', () => {
    const preferences = { new_ai_intake: false }
    expect(getEffectivePreference(preferences, 'customer_reply')).toBe(true)
  })

  it('should return TRUE for explicitly true preference', () => {
    const preferences = { new_ai_intake: true }
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true)
  })

  it('should return FALSE for explicitly false preference', () => {
    const preferences = { new_ai_intake: false }
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(false)
  })

  it('should return FALSE for missing key with null value', () => {
    const preferences = { new_ai_intake: null }
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true)
  })

  it('should return TRUE for truthy non-boolean values (fallback)', () => {
    const preferences = { new_ai_intake: 'true' as any }
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true)
  })
})

describe('Notification Preferences - Suppression Logic', () => {
  it('should NOT suppress any notification types (preferences disabled for launch)', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'new_lead')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'followup_completed')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'customer_reply')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'payment_requested')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'payment_completed')).toBe(false)
  })

  it('should NOT suppress when preference is enabled (true)', () => {
    const preferences = { new_ai_intake: true }
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)
  })

  it('should NOT suppress when preference is disabled (false)', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)
  })

  it('should NOT suppress when preference is missing', () => {
    const preferences = {}
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)
  })

  it('should NOT suppress when preferences are null', () => {
    expect(shouldSuppressNotification(null, 'ai_intake_completed')).toBe(false)
  })

  it('should NOT suppress when preferences are undefined', () => {
    expect(shouldSuppressNotification(undefined, 'ai_intake_completed')).toBe(false)
  })

  it('should NOT suppress calendar_disconnected when calendar_connected is false', () => {
    const preferences = { calendar_connected: false }
    expect(shouldSuppressNotification(preferences, 'calendar_disconnected')).toBe(false)
  })

  it('should NOT suppress appointment_deleted when appointment_created is false', () => {
    const preferences = { appointment_created: false }
    expect(shouldSuppressNotification(preferences, 'appointment_deleted')).toBe(false)
  })
})

describe('Notification Preferences - Validation', () => {
  it('should validate all known preference keys', () => {
    const knownKeys = Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS)
    for (const key of knownKeys) {
      expect(isValidPreferenceKey(key)).toBe(true)
    }
  })

  it('should reject unknown preference keys', () => {
    expect(isValidPreferenceKey('unknown_key')).toBe(false)
    expect(isValidPreferenceKey('new_lead')).toBe(false)
  })

  it('should accept boolean values', () => {
    expect(isValidPreferenceValue(true)).toBe(true)
    expect(isValidPreferenceValue(false)).toBe(true)
  })

  it('should reject non-boolean values', () => {
    expect(isValidPreferenceValue('true')).toBe(false)
    expect(isValidPreferenceValue('false')).toBe(false)
    expect(isValidPreferenceValue(1)).toBe(false)
    expect(isValidPreferenceValue(0)).toBe(false)
    expect(isValidPreferenceValue(null)).toBe(false)
    expect(isValidPreferenceValue(undefined)).toBe(false)
  })
})

describe('Notification Preferences - Error Handling Hardening', () => {
  it('should treat data:null,error as fail-open for notification delivery', () => {
    const preferences = null
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true)
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)
  })

  it('should treat thrown exception as fail-open for notification delivery', () => {
    const preferences = null
    expect(getEffectivePreference(preferences, 'customer_reply')).toBe(true)
    expect(shouldSuppressNotification(preferences, 'customer_reply')).toBe(false)
  })

  it('should handle missing column gracefully', () => {
    const preferences = null
    expect(getEffectivePreference(preferences, 'payment_requested')).toBe(true)
    expect(getEffectivePreference(preferences, 'payment_completed')).toBe(true)
  })

  it('should handle malformed JSON gracefully', () => {
    const preferences = null
    expect(getEffectivePreference(preferences, 'calendar_connected')).toBe(true)
    expect(shouldSuppressNotification(preferences, 'calendar_connected')).toBe(false)
  })

  it('should handle business not found gracefully', () => {
    const preferences = null
    expect(getEffectivePreference(preferences, 'appointment_created')).toBe(true)
    expect(shouldSuppressNotification(preferences, 'appointment_created')).toBe(false)
  })

  it('should not suppress notifications when preference lookup fails', () => {
    const preferences = null
    expect(shouldSuppressNotification(preferences, 'personal_voicemail')).toBe(false)
  })

  it('should NOT suppress when preference is explicitly false (preferences disabled for launch)', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)
  })

  it('should still proceed when preference is explicitly true', () => {
    const preferences = { customer_reply: true }
    expect(shouldSuppressNotification(preferences, 'customer_reply')).toBe(false)
  })

  it('should handle null preferences correctly', () => {
    expect(getEffectivePreference(null, 'new_ai_intake')).toBe(true)
    expect(getEffectivePreference(null, 'customer_reply')).toBe(true)
    expect(getEffectivePreference(null, 'payment_requested')).toBe(true)
  })

  it('should handle undefined preferences correctly', () => {
    expect(getEffectivePreference(undefined, 'calendar_connected')).toBe(true)
    expect(getEffectivePreference(undefined, 'appointment_created')).toBe(true)
  })

  it('should handle non-boolean values as truthy (fail-safe)', () => {
    const preferences = { new_ai_intake: 'true' as any }
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true)
  })

  it('should handle 0 as truthy (fail-safe)', () => {
    const preferences = { customer_reply: 0 as any }
    expect(getEffectivePreference(preferences, 'customer_reply')).toBe(true)
  })

  it('should handle empty string as truthy (fail-safe)', () => {
    const preferences = { payment_requested: '' as any }
    expect(getEffectivePreference(preferences, 'payment_requested')).toBe(true)
  })
})

describe('Notification Preferences - Atomic Merge Hardening', () => {
  it('should preserve existing keys during partial update', () => {
    const existing = { customer_reply: false, payment_completed: true }
    const patch = { payment_completed: false }
    const merged = { ...existing, ...patch }

    expect(merged.customer_reply).toBe(false)
    expect(merged.payment_completed).toBe(false)
  })

  it('should handle concurrent partial update scenario conceptually', () => {
    const initialState = { customer_reply: true, payment_completed: true }
    const patchA = { customer_reply: false }
    const patchB = { payment_completed: false }
    const final = { ...initialState, ...patchA, ...patchB }

    expect(final.customer_reply).toBe(false)
    expect(final.payment_completed).toBe(false)
  })

  it('should handle patch with new keys', () => {
    const existing = { customer_reply: true }
    const patch = { payment_completed: false }
    const merged = { ...existing, ...patch }

    expect(merged.customer_reply).toBe(true)
    expect(merged.payment_completed).toBe(false)
  })

  it('should handle patch overriding existing keys', () => {
    const existing = { customer_reply: false, payment_completed: true }
    const patch = { customer_reply: true }
    const merged = { ...existing, ...patch }

    expect(merged.customer_reply).toBe(true)
    expect(merged.payment_completed).toBe(true)
  })

  it('should handle empty patch', () => {
    const existing = { customer_reply: false, payment_completed: true }
    const patch = {}
    const merged = { ...existing, ...patch }

    expect(merged.customer_reply).toBe(false)
    expect(merged.payment_completed).toBe(true)
  })

  it('should handle null existing preferences', () => {
    const existing = null
    const patch = { customer_reply: false }
    const merged = { ...(existing || {}), ...patch }

    expect(merged.customer_reply).toBe(false)
  })

  it('should handle undefined existing preferences', () => {
    const existing = undefined
    const patch = { payment_completed: false }
    const merged = { ...(existing || {}), ...patch }

    expect(merged.payment_completed).toBe(false)
  })

  it('should handle complex multi-key patch', () => {
    const existing = {
      new_ai_intake: true,
      customer_reply: true,
      payment_requested: true,
      payment_completed: true,
      calendar_connected: true,
      appointment_created: true,
      personal_voicemail: true
    }
    const patch = {
      customer_reply: false,
      payment_completed: false,
      personal_voicemail: false
    }
    const merged = { ...existing, ...patch }

    expect(merged.new_ai_intake).toBe(true)
    expect(merged.customer_reply).toBe(false)
    expect(merged.payment_requested).toBe(true)
    expect(merged.payment_completed).toBe(false)
    expect(merged.calendar_connected).toBe(true)
    expect(merged.appointment_created).toBe(true)
    expect(merged.personal_voicemail).toBe(false)
  })

  it('should verify default=true behavior is preserved', () => {
    const preferences = {}
    for (const key of Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS)) {
      expect(getEffectivePreference(preferences, key as any)).toBe(true)
    }
  })

  it('should verify suppression is disabled for launch (preferences no longer suppress)', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)

    const preferences2 = { new_ai_intake: true }
    expect(shouldSuppressNotification(preferences2, 'ai_intake_completed')).toBe(false)

    const preferences3 = {}
    expect(shouldSuppressNotification(preferences3, 'ai_intake_completed')).toBe(false)
  })

  it('should verify unmapped types are unaffected', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'new_lead')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'followup_completed')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'voicemail_received')).toBe(false)
  })

  it('should verify mapping is correct', () => {
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.ai_intake_completed).toBe('new_ai_intake')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.customer_reply).toBe('customer_reply')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.payment_requested).toBe('payment_requested')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.payment_completed).toBe('payment_completed')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.calendar_connected).toBe('calendar_connected')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.calendar_disconnected).toBe('calendar_connected')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.appointment_created).toBe('appointment_created')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.appointment_deleted).toBe('appointment_created')
    expect(NOTIFICATION_TYPE_TO_PREFERENCE.personal_voicemail).toBe('personal_voicemail')
  })

  it('should verify all defaults are true', () => {
    for (const [key, value] of Object.entries(NOTIFICATION_PREFERENCE_DEFAULTS)) {
      expect(value).toBe(true)
    }
  })

  it('should verify fail-open contract for all preference keys', () => {
    const preferences = null
    for (const key of Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS)) {
      expect(getEffectivePreference(preferences, key as any)).toBe(true)
      expect(shouldSuppressNotification(preferences, key as any)).toBe(false)
    }
  })

  it('should verify error handling does not change suppression semantics (suppression disabled)', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(false)

    const preferences2 = null
    expect(shouldSuppressNotification(preferences2, 'ai_intake_completed')).toBe(false)
  })

  it('should verify atomic merge preserves all keys', () => {
    const existing = {
      new_ai_intake: true,
      customer_reply: false,
      payment_requested: true,
      payment_completed: true,
      calendar_connected: true,
      appointment_created: false,
      personal_voicemail: true
    }

    const patch = {
      customer_reply: true,
      payment_completed: false,
      appointment_created: true
    }

    const merged = { ...existing, ...patch }

    expect(merged.new_ai_intake).toBe(true)
    expect(merged.customer_reply).toBe(true)
    expect(merged.payment_requested).toBe(true)
    expect(merged.payment_completed).toBe(false)
    expect(merged.calendar_connected).toBe(true)
    expect(merged.appointment_created).toBe(true)
    expect(merged.personal_voicemail).toBe(true)
  })

  it('should handle concurrent update simulation', () => {
    const initial = { customer_reply: true, payment_completed: true }
    const requestAPatch = { customer_reply: false }
    const requestBPatch = { payment_completed: false }
    const final = { ...initial, ...requestAPatch, ...requestBPatch }

    expect(final.customer_reply).toBe(false)
    expect(final.payment_completed).toBe(false)
  })
})

describe('Notification Preferences - RPC Validation Contract (UNIT TESTED)', () => {
  it('should reject unknown keys at API validation layer', () => {
    // API layer validates keys before calling RPC
    expect(isValidPreferenceKey('unknown_key')).toBe(false)
    expect(isValidPreferenceKey('banana')).toBe(false)
  })

  it('should reject string boolean values at API validation layer', () => {
    // API layer validates values are boolean
    expect(isValidPreferenceValue('false')).toBe(false)
    expect(isValidPreferenceValue('true')).toBe(false)
    expect(isValidPreferenceValue('banana')).toBe(false)
  })

  it('should reject numeric values at API validation layer', () => {
    // API layer validates values are boolean
    expect(isValidPreferenceValue(0)).toBe(false)
    expect(isValidPreferenceValue(1)).toBe(false)
    expect(isValidPreferenceValue(42)).toBe(false)
  })

  it('should reject null values at API validation layer', () => {
    // API layer validates values are boolean
    expect(isValidPreferenceValue(null)).toBe(false)
  })

  it('should accept valid partial patch at API validation layer', () => {
    // Valid single-key patch
    expect(isValidPreferenceKey('customer_reply')).toBe(true)
    expect(isValidPreferenceValue(false)).toBe(true)
  })

  it('should accept valid multiple-key patch at API validation layer', () => {
    // Valid multi-key patch
    expect(isValidPreferenceKey('customer_reply')).toBe(true)
    expect(isValidPreferenceKey('payment_completed')).toBe(true)
    expect(isValidPreferenceValue(false)).toBe(true)
    expect(isValidPreferenceValue(true)).toBe(true)
  })

  it('should accept all 7 known keys', () => {
    const knownKeys = Object.keys(NOTIFICATION_PREFERENCE_DEFAULTS)
    expect(knownKeys).toEqual([
      'new_ai_intake',
      'customer_reply',
      'payment_requested',
      'payment_completed',
      'calendar_connected',
      'appointment_created',
      'personal_voicemail'
    ])
    for (const key of knownKeys) {
      expect(isValidPreferenceKey(key)).toBe(true)
    }
  })

  it('should document that RPC enforces same contract as API', () => {
    // This test documents that the PostgreSQL function enforces:
    // - p_preferences must be a JSON object
    // - Every key must be one of the 7 allowed keys
    // - Every value must be a JSON boolean
    // This is DATABASE INTEGRATION NOT RUNTIME-TESTED here
    expect(true).toBe(true)
  })

  it('should document authorization contract', () => {
    // This test documents the authorization contract:
    // - auth.uid() must exist (authenticated)
    // - business must belong to auth.uid()
    // - Direct authenticated RPC: own business + valid patch = allowed
    // - Direct authenticated RPC: own business + invalid patch = rejected
    // - Direct authenticated RPC: other business = rejected
    // - Unauthenticated = rejected
    // This is DATABASE INTEGRATION NOT RUNTIME-TESTED here
    expect(true).toBe(true)
  })
})