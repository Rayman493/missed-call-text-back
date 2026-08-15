/**
 * Analytics Initialization
 *
 * Initialize the analytics service with providers.
 * This should be called during app initialization.
 */

import { analyticsService } from './analytics-service'
import { NoOpProvider } from './providers/noop-provider'
import { PostHogProvider } from './providers/posthog-provider'

/**
 * Initialize analytics
 *
 * In development, uses NoOpProvider with logging enabled.
 * In production, uses PostHog for actual analytics tracking.
 */
export async function initializeAnalytics(): Promise<void> {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const isProduction = process.env.NODE_ENV === 'production'

  const providers: any[] = []

  // In development, use no-op provider with logging
  if (isDevelopment) {
    providers.push(new NoOpProvider(true))
    console.log('[Analytics] Development mode: using NoOpProvider with logging')
  }

  // In production, use PostHog if configured
  if (isProduction && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    const posthogProvider = new PostHogProvider({
      apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      apiHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com'
    })
    providers.push(posthogProvider)
    console.log('[Analytics] Production mode: using PostHog')
  }

  // Fallback to NoOpProvider if no production provider is configured
  if (providers.length === 0) {
    providers.push(new NoOpProvider(false))
    console.log('[Analytics] No provider configured: using NoOpProvider (disabled)')
  }

  const config = {
    enabled: true,
    providers
  }

  await analyticsService.initialize(config)
}
