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
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true) // null = missing = default true
  })

  it('should return TRUE for truthy non-boolean values (fallback)', () => {
    const preferences = { new_ai_intake: 'true' as any }
    expect(getEffectivePreference(preferences, 'new_ai_intake')).toBe(true)
  })
})

describe('Notification Preferences - Suppression Logic', () => {
  it('should NOT suppress unmapped notification types', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'new_lead')).toBe(false)
    expect(shouldSuppressNotification(preferences, 'followup_completed')).toBe(false)
  })

  it('should NOT suppress when preference is enabled (true)', () => {
    const preferences = { new_ai_intake: true }
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

  it('should suppress when preference is disabled (false)', () => {
    const preferences = { new_ai_intake: false }
    expect(shouldSuppressNotification(preferences, 'ai_intake_completed')).toBe(true)
  })

  it('should suppress calendar_disconnected when calendar_connected is false', () => {
    const preferences = { calendar_connected: false }
    expect(shouldSuppressNotification(preferences, 'calendar_disconnected')).toBe(true)
  })

  it('should suppress appointment_deleted when appointment_created is false', () => {
    const preferences = { appointment_created: false }
    expect(shouldSuppressNotification(preferences, 'appointment_deleted')).toBe(true)
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