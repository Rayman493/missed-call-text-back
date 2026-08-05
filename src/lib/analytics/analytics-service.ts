/**
 * Analytics Service
 * 
 * Provider-agnostic analytics tracking service for ReplyFlow.
 * Supports multiple analytics providers (PostHog, Mixpanel, Amplitude, custom backend).
 * 
 * Design Principles:
 * - Provider-agnostic: Swap providers without changing application code
 * - Centralized: Single tracking interface, no scattered analytics calls
 * - Anonymous: No user identification, only business context
 * - Fail-safe: Analytics failures never block business operations
 */

import { Capacitor } from '@capacitor/core'
import type {
  AnalyticsConfig,
  AnalyticsEvent,
  AnalyticsEventName,
  AnalyticsProvider,
  BaseEventProperties,
  EventProperties
} from './analytics-types'

/**
 * Analytics service class
 */
class AnalyticsService {
  private providers: AnalyticsProvider[] = []
  private enabled: boolean = false
  private initialized: boolean = false

  /**
   * Initialize the analytics service with providers
   */
  async initialize(config: AnalyticsConfig): Promise<void> {
    if (this.initialized) {
      console.warn('[Analytics] Already initialized')
      return
    }

    this.providers = config.providers
    this.enabled = config.enabled

    if (!this.enabled) {
      console.log('[Analytics] Disabled')
      return
    }

    console.log(`[Analytics] Initializing ${this.providers.length} provider(s)`)

    // Initialize all providers
    for (const provider of this.providers) {
      try {
        await provider.initialize()
        console.log(`[Analytics] Provider initialized: ${provider.constructor.name}`)
      } catch (error) {
        console.error(`[Analytics] Failed to initialize provider:`, error)
      }
    }

    this.initialized = true
    console.log('[Analytics] Initialization complete')
  }

  /**
   * Track an analytics event
   * 
   * @param eventName - The name of the event
   * @param properties - Event-specific properties (optional)
   * @param businessId - Business ID (optional, will be extracted from context if not provided)
   */
  async track<T extends AnalyticsEventName>(
    eventName: T,
    properties?: EventProperties[T],
    businessId?: string
  ): Promise<void> {
    if (!this.enabled || !this.initialized) {
      return
    }

    const baseProperties = this.getBaseProperties(businessId)
    const event: AnalyticsEvent = {
      eventName,
      properties: {
        ...baseProperties,
        ...(properties || {})
      } as any,
      timestamp: Date.now()
    }

    // Track with all providers
    for (const provider of this.providers) {
      try {
        await provider.track(event)
      } catch (error) {
        console.error(`[Analytics] Provider tracking failed:`, error)
      }
    }
  }

  /**
   * Identify a user (optional, for providers that support user identification)
   */
  async identify(userId: string, traits?: Record<string, any>): Promise<void> {
    if (!this.enabled || !this.initialized) {
      return
    }

    for (const provider of this.providers) {
      try {
        if (provider.identify) {
          await provider.identify(userId, traits)
        }
      } catch (error) {
        console.error(`[Analytics] Provider identify failed:`, error)
      }
    }
  }

  /**
   * Set user properties (optional)
   */
  async setUserProperties(properties: Record<string, any>): Promise<void> {
    if (!this.enabled || !this.initialized) {
      return
    }

    for (const provider of this.providers) {
      try {
        if (provider.setUserProperties) {
          await provider.setUserProperties(properties)
        }
      } catch (error) {
        console.error(`[Analytics] Provider setUserProperties failed:`, error)
      }
    }
  }

  /**
   * Flush events (optional, for providers that buffer events)
   */
  async flush(): Promise<void> {
    if (!this.enabled || !this.initialized) {
      return
    }

    for (const provider of this.providers) {
      try {
        if (provider.flush) {
          await provider.flush()
        }
      } catch (error) {
        console.error(`[Analytics] Provider flush failed:`, error)
      }
    }
  }

  /**
   * Get base properties included in all events
   */
  private getBaseProperties(businessId?: string): BaseEventProperties {
    return {
      businessId: businessId || 'unknown',
      platform: this.getPlatform(),
      appVersion: this.getAppVersion()
    }
  }

  /**
   * Detect platform
   */
  private getPlatform(): 'ios' | 'android' | 'web' {
    if (Capacitor.isNativePlatform()) {
      return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'
    }
    return 'web'
  }

  /**
   * Get app version from package.json
   */
  private getAppVersion(): string {
    // In a real implementation, this would read from package.json
    // For now, return a placeholder
    return '1.0.0'
  }

  /**
   * Check if analytics is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Check if analytics is initialized
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

// Singleton instance
export const analyticsService = new AnalyticsService()

/**
 * Convenience function for direct import
 */
export async function trackAnalytics<T extends AnalyticsEventName>(
  eventName: T,
  properties?: EventProperties[T],
  businessId?: string
): Promise<void> {
  return analyticsService.track(eventName, properties, businessId)
}
