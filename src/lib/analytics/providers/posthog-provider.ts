/**
 * PostHog Analytics Provider
 *
 * PostHog analytics provider for ReplyFlow.
 * Tracks events to PostHog with fail-safe error handling.
 */

import type { AnalyticsEvent, AnalyticsProvider } from '../analytics-types'

export class PostHogProvider implements AnalyticsProvider {
  private client: any = null
  private apiKey: string
  private apiHost: string
  private initialized: boolean = false

  constructor(config: { apiKey: string; apiHost?: string }) {
    this.apiKey = config.apiKey
    this.apiHost = config.apiHost || 'https://app.posthog.com'
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      console.warn('[PostHogProvider] Already initialized')
      return
    }

    try {
      // Dynamic import to avoid SSR issues
      const posthog = await import('posthog-js')

      posthog.default.init(this.apiKey, {
        api_host: this.apiHost,
        capture_pageview: false, // We'll track pageviews manually
        capture_pageleave: true,
        persistence: 'localStorage',
        loaded: (ph: any) => {
          this.client = ph
          this.initialized = true
          console.log('[PostHogProvider] Initialized successfully')
        }
      })
    } catch (error) {
      console.warn('[PostHogProvider] Failed to initialize:', error)
      // Don't throw - analytics failures should never block the app
    }
  }

  track(event: AnalyticsEvent): void {
    if (!this.initialized || !this.client) {
      return
    }

    try {
      this.client.capture(event.eventName, {
        ...event.properties,
        timestamp: new Date(event.timestamp).toISOString()
      })
    } catch (error) {
      console.warn('[PostHogProvider] Failed to track event:', error)
      // Don't throw - analytics failures should never block the app
    }
  }

  identify?(userId: string, traits?: Record<string, any>): void {
    if (!this.initialized || !this.client) {
      return
    }

    try {
      this.client.identify(userId, traits)
    } catch (error) {
      console.warn('[PostHogProvider] Failed to identify user:', error)
      // Don't throw - analytics failures should never block the app
    }
  }

  setUserProperties?(properties: Record<string, any>): void {
    if (!this.initialized || !this.client) {
      return
    }

    try {
      this.client.people.set(properties)
    } catch (error) {
      console.warn('[PostHogProvider] Failed to set user properties:', error)
      // Don't throw - analytics failures should never block the app
    }
  }

  flush?(): void {
    if (!this.initialized || !this.client) {
      return
    }

    try {
      this.client.flush()
    } catch (error) {
      console.warn('[PostHogProvider] Failed to flush:', error)
      // Don't throw - analytics failures should never block the app
    }
  }
}