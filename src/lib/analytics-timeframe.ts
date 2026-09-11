/**
 * Shared analytics timeframe utilities
 * Provides consistent date range calculation across all dashboard charts
 */

export type AnalyticsTimeframe = '7d' | '30d' | '90d' | '1y' | 'all_time'

export const ANALYTICS_TIMEFRAME_OPTIONS = [
  { value: '7d' as AnalyticsTimeframe, label: 'Last 7 Days' },
  { value: '30d' as AnalyticsTimeframe, label: 'Last 30 Days' },
  { value: '90d' as AnalyticsTimeframe, label: 'Last 90 Days' },
  { value: '1y' as AnalyticsTimeframe, label: 'This Year' },
  { value: 'all_time' as AnalyticsTimeframe, label: 'All Time' },
]

/**
 * Calculate start date for a given timeframe
 * Uses consistent rolling windows (not calendar boundaries)
 *
 * For 'all_time', returns null (no artificial start-date cutoff). Callers
 * should treat a null start as "no lower bound" and use the earliest actual
 * relevant record. KPI and chart must use the same range.
 */
export function getStartDateForTimeframe(timeframe: AnalyticsTimeframe): Date | null {
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
    case 'all_time':
      // No artificial start-date cutoff. Callers use earliest actual record.
      return null
    default:
      throw new Error(`Unknown timeframe: ${timeframe}`)
  }
}

/**
 * Get the number of days in a timeframe for average calculations
 *
 * For 'all_time', returns the number of days from the provided start date
 * (the earliest actual record) to now. If no start is provided, returns the
 * days since the Unix epoch as a safe fallback so averages remain finite.
 */
export function getDaysInTimeframe(timeframe: AnalyticsTimeframe, startDate?: Date | null): number {
  switch (timeframe) {
    case '7d':
      return 7
    case '30d':
      return 30
    case '90d':
      return 90
    case '1y':
      return 365
    case 'all_time': {
      if (startDate) {
        const ms = Date.now() - startDate.getTime()
        return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)))
      }
      // Fallback: days since Unix epoch (finite, avoids div-by-zero)
      return Math.max(1, Math.ceil(Date.now() / (24 * 60 * 60 * 1000)))
    }
    default:
      throw new Error(`Unknown timeframe: ${timeframe}`)
  }
}