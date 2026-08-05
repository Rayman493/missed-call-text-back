/**
 * Analytics Types
 * 
 * Provider-agnostic analytics event tracking for ReplyFlow.
 * All events are anonymous and include business context.
 */

/**
 * Platform detection
 */
export type Platform = 'ios' | 'android' | 'web'

/**
 * Analytics event names
 */
export type AnalyticsEventName =
  // Account events
  | 'account_created'
  | 'onboarding_started'
  | 'onboarding_completed'
  // Business events
  | 'ai_call_answered'
  | 'customer_created'
  | 'appointment_scheduled'
  | 'job_created'
  | 'job_completed'
  | 'payment_requested'
  | 'payment_received'
  | 'message_sent'
  // Intelligence events
  | 'daily_brief_opened'
  | 'focus_item_viewed'
  | 'focus_item_completed'
  | 'draft_approved'
  | 'draft_edited'
  | 'draft_discarded'

/**
 * Base event properties included in all events
 */
export interface BaseEventProperties {
  businessId: string
  platform: Platform
  appVersion: string
}

/**
 * Event-specific properties
 */
export interface EventProperties {
  // Account events
  account_created?: {
    signupMethod?: 'email' | 'google' | 'apple'
  }
  onboarding_started?: {
    step?: string
  }
  onboarding_completed?: {
    durationMs?: number
  }
  // Business events
  ai_call_answered?: {
    callDuration?: number
    aiConfidence?: number
  }
  customer_created?: {
    source?: 'manual' | 'ai_call' | 'import'
  }
  appointment_scheduled?: {
    isRecurring?: boolean
  }
  job_created?: {
    jobType?: string
  }
  job_completed?: {
    duration?: number
  }
  payment_requested?: {
    amount?: number
    provider?: 'stripe' | 'paypal' | 'tap_to_pay'
  }
  payment_received?: {
    amount?: number
    provider?: 'stripe' | 'paypal' | 'tap_to_pay'
  }
  message_sent?: {
    direction?: 'inbound' | 'outbound'
    hasMedia?: boolean
  }
  // Intelligence events
  daily_brief_opened?: {
    itemCount?: number
  }
  focus_item_viewed?: {
    itemType?: string
    priority?: string
  }
  focus_item_completed?: {
    itemType?: string
    priority?: string
  }
  draft_approved?: {
    draftType?: string
  }
  draft_edited?: {
    draftType?: string
  }
  draft_discarded?: {
    draftType?: string
  }
}

/**
 * Complete analytics event
 */
export interface AnalyticsEvent {
  eventName: AnalyticsEventName
  properties: BaseEventProperties & EventProperties[AnalyticsEventName]
  timestamp: number
}

/**
 * Analytics provider interface
 * Implement this to add support for different analytics services
 */
export interface AnalyticsProvider {
  /**
   * Initialize the analytics provider
   */
  initialize(): Promise<void> | void

  /**
   * Track an event
   */
  track(event: AnalyticsEvent): Promise<void> | void

  /**
   * Identify a user (optional, for providers that support user identification)
   */
  identify?(userId: string, traits?: Record<string, any>): Promise<void> | void

  /**
   * Set user properties (optional)
   */
  setUserProperties?(properties: Record<string, any>): Promise<void> | void

  /**
   * Flush events (optional, for providers that buffer events)
   */
  flush?(): Promise<void> | void
}

/**
 * Analytics configuration
 */
export interface AnalyticsConfig {
  providers: AnalyticsProvider[]
  enabled: boolean
}
