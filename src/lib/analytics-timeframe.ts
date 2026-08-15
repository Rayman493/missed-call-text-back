/**
 * Shared analytics timeframe utilities
 * Provides consistent date range calculation across all dashboard charts
 */

export type AnalyticsTimeframe = '7d' | '30d' | '90d' | '1y'

export const ANALYTICS_TIMEFRAME_OPTIONS = [
  { value: '7d' as AnalyticsTimeframe, label: 'Last 7 Days' },
  { value: '30d' as AnalyticsTimeframe, label: 'Last 30 Days' },
  { value: '90d' as AnalyticsTimeframe, label: 'Last 90 Days' },
  { value: '1y' as AnalyticsTimeframe, label: 'This Year' },
]

/**
 * Calculate start date for a given timeframe
 * Uses consistent rolling windows (not calendar boundaries)
 */
export function getStartDateForTimeframe(timeframe: AnalyticsTimeframe): Date {
  const now = new Date()
  switch (timeframe) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
    default:
      throw new Error(`Unknown timeframe: ${timeframe}`)
  }
}

/**
 * Get the number of days in a timeframe for average calculations
 */
export function getDaysInTimeframe(timeframe: AnalyticsTimeframe): number {
  switch (timeframe) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    case '1y':
      return 365
    default:
      throw new Error(`Unknown timeframe: ${timeframe}`)
  }
}