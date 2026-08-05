/**
 * No-Op Analytics Provider
 * 
 * A no-op provider that logs events to console instead of sending to an analytics service.
 * Useful for development and testing.
 */

import type { AnalyticsEvent, AnalyticsProvider } from '../analytics-types'

export class NoOpProvider implements AnalyticsProvider {
  private enabled: boolean

  constructor(enabled: boolean = false) {
    this.enabled = enabled
  }

  initialize(): void {
    if (this.enabled) {
      console.log('[NoOpProvider] Initialized (logging enabled)')
    } else {
      console.log('[NoOpProvider] Initialized (logging disabled)')
    }
  }

  track(event: AnalyticsEvent): void {
    if (!this.enabled) return

    console.log(`[Analytics] ${event.eventName}`, {
      ...event.properties,
      timestamp: new Date(event.timestamp).toISOString()
    })
  }

  identify?(userId: string, traits?: Record<string, any>): void {
    if (!this.enabled) return
    console.log('[Analytics] Identify', { userId, traits })
  }

  setUserProperties?(properties: Record<string, any>): void {
    if (!this.enabled) return
    console.log('[Analytics] Set User Properties', properties)
  }

  flush?(): void {
    if (!this.enabled) return
    console.log('[Analytics] Flush')
  }
}
