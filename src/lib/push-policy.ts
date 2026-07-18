/**
 * Push Notification Policy Helper
 * 
 * This provides a centralized policy for determining which notification types
 * should trigger native push notifications vs. in-app only notifications.
 * 
 * The policy is designed to balance user engagement with notification fatigue.
 * High-value, time-sensitive events trigger pushes, while routine informational
 * events remain in-app only.
 */

export type NotificationType = 
  | 'new_lead'
  | 'customer_reply'
  | 'followup_completed'
  | 'followup_sent'
  | 'forwarding_disconnected'
  | 'sms_failed'
  | 'trial_ending'
  | 'subscription_issue'
  | 'voicemail_received'
  | 'ai_intake_completed'
  | 'payment_requested'
  | 'payment_completed'
  | 'calendar_connected'
  | 'calendar_disconnected'
  | 'appointment_created'
  | 'appointment_deleted'
  | 'personal_voicemail'
  | 'missed_call'

/**
 * Push priority levels for notification types
 */
export enum PushPriority {
  /** High-value events that should always push */
  HIGH = 'high',
  /** Important events that should push (consider user preferences in future) */
  MEDIUM = 'medium',
  /** Routine informational events - in-app only by default */
  NONE = 'none'
}

/**
 * Push policy configuration
 * Maps each notification type to a push priority
 */
const PUSH_POLICY: Record<NotificationType, PushPriority> = {
  // HIGH VALUE - Always push (time-sensitive, revenue-critical, or high engagement)
  new_lead: PushPriority.HIGH,
  customer_reply: PushPriority.HIGH,
  ai_intake_completed: PushPriority.HIGH,
  payment_completed: PushPriority.HIGH,
  personal_voicemail: PushPriority.HIGH,
  voicemail_received: PushPriority.HIGH,
  missed_call: PushPriority.HIGH,

  // MEDIUM - Important but less urgent (consider user preferences in future)
  forwarding_disconnected: PushPriority.MEDIUM,
  sms_failed: PushPriority.MEDIUM,
  trial_ending: PushPriority.MEDIUM,
  subscription_issue: PushPriority.MEDIUM,

  // NONE - Routine informational events (in-app only by default)
  followup_completed: PushPriority.NONE,
  followup_sent: PushPriority.NONE,
  payment_requested: PushPriority.NONE,
  calendar_connected: PushPriority.NONE,
  calendar_disconnected: PushPriority.NONE,
  appointment_created: PushPriority.NONE,
  appointment_deleted: PushPriority.NONE
}

/**
 * Determine if a notification type should trigger a native push notification
 * 
 * @param type - The notification type to evaluate
 * @returns true if the notification should push, false otherwise
 */
export function shouldSendPush(type: NotificationType): boolean {
  const priority = PUSH_POLICY[type]
  return priority === PushPriority.HIGH || priority === PushPriority.MEDIUM
}

/**
 * Get the push priority for a notification type
 * 
 * @param type - The notification type to evaluate
 * @returns The push priority level
 */
export function getPushPriority(type: NotificationType): PushPriority {
  return PUSH_POLICY[type] || PushPriority.NONE
}

/**
 * Get all notification types that should trigger push notifications
 * 
 * @returns Array of notification types with HIGH or MEDIUM priority
 */
export function getPushEnabledTypes(): NotificationType[] {
  return Object.entries(PUSH_POLICY)
    .filter(([_, priority]) => priority === PushPriority.HIGH || priority === PushPriority.MEDIUM)
    .map(([type]) => type as NotificationType)
}

/**
 * Get all notification types that are in-app only
 * 
 * @returns Array of notification types with NONE priority
 */
export function getInAppOnlyTypes(): NotificationType[] {
  return Object.entries(PUSH_POLICY)
    .filter(([_, priority]) => priority === PushPriority.NONE)
    .map(([type]) => type as NotificationType)
}
