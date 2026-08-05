/**
 * Analytics Initialization
 * 
 * Initialize the analytics service with providers.
 * This should be called during app initialization.
 */

import { analyticsService } from './analytics-service'
import { NoOpProvider } from './providers/noop-provider'

/**
 * Initialize analytics
 * 
 * In development, uses NoOpProvider with logging enabled.
 * In production, configure actual providers (PostHog, Mixpanel, etc.).
 */
export async function initializeAnalytics(): Promise<void> {
  const isDevelopment = process.env.NODE_ENV === 'development'

  const config = {
    enabled: true, // Always enabled, providers control actual tracking
    providers: [
      // In development, use no-op provider with logging
      // In production, replace with actual providers:
      // new PostHogProvider({ apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY })
      // new MixpanelProvider({ token: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN })
      new NoOpProvider(isDevelopment)
    ]
  }

  await analyticsService.initialize(config)
}
