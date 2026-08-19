/**
 * Notification Preferences Configuration
 * 
 * Centralized definition of notification preferences and their defaults
 */

export const NOTIFICATION_PREFERENCE_DEFAULTS: Record<string, boolean> = {
  new_ai_intake: true,
  customer_reply: true,
  payment_requested: true,
  payment_completed: true,
  calendar_connected: true,
  appointment_created: true,
  personal_voicemail: true,
}

export type NotificationPreferenceKey = keyof typeof NOTIFICATION_PREFERENCE_DEFAULTS

/**
 * Mapping from notification type to preference key
 * Notification types not in this mapping are not suppressible
 */
export const NOTIFICATION_TYPE_TO_PREFERENCE: Record<string, NotificationPreferenceKey> = {
  ai_intake_completed: 'new_ai_intake',
  customer_reply: 'customer_reply',
  payment_requested: 'payment_requested',
  payment_completed: 'payment_completed',
  calendar_connected: 'calendar_connected',
  calendar_disconnected: 'calendar_connected',
  appointment_created: 'appointment_created',
  appointment_deleted: 'appointment_created',
  personal_voicemail: 'personal_voicemail',
}

/**
 * Get effective preference value for a notification type
 * Returns TRUE if:
 * - preference object is null/undefined
 * - preference key is missing
 * - preference value is explicitly true
 * 
 * Returns FALSE only if preference is explicitly false
 */
export function getEffectivePreference(
  preferences: Record<string, any> | null | undefined,
  preferenceKey: NotificationPreferenceKey
): boolean {
  if (!preferences) {
    return true // Missing preferences = enabled by default
  }
  
  const value = preferences[preferenceKey]
  
  // Missing key = enabled by default
  if (value === undefined || value === null) {
    return true
  }
  
  // Explicit false = disabled
  if (value === false) {
    return false
  }
  
  // Anything else (true, truthy) = enabled
  return true
}

/**
 * Check if a notification type should be suppressed based on preferences
 * Returns TRUE if notification should be suppressed (preference disabled)
 * Returns FALSE if notification should proceed (preference enabled or unmapped)
 *
 * NOTE: Core operational notifications are no longer suppressible via user preferences.
 * OS-level Android/iOS notification permission remains authoritative for push display.
 */
export function shouldSuppressNotification(
  preferences: Record<string, any> | null | undefined,
  notificationType: string
): boolean {
  // Core operational notifications are no longer suppressible via preferences
  // Only OS-level permission controls push notification display
  return false
}

/**
 * Validate a preference key is known
 */
export function isValidPreferenceKey(key: string): key is NotificationPreferenceKey {
  return key in NOTIFICATION_PREFERENCE_DEFAULTS
}

/**
 * Validate a preference value is boolean
 */
export function isValidPreferenceValue(value: any): boolean {
  return typeof value === 'boolean'
}