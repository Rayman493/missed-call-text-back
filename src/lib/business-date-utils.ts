/**
 * Business timezone-aware date utilities for analytics.
 *
 * These functions ensure that business-facing metrics (Today, This Week, This Month)
 * use the business's configured timezone rather than the user's browser timezone.
 */

import { toZonedTime } from 'date-fns-tz/toZonedTime'
import { fromZonedTime } from 'date-fns-tz/fromZonedTime'

/**
 * Normalizes and validates a business timezone string.
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @returns Valid IANA timezone or 'UTC' as fallback
 */
export function normalizeBusinessTimezone(timezone: string | undefined | null): string {
  // Handle undefined, null, or empty string
  if (!timezone || timezone.trim() === '') {
    return 'UTC'
  }

  // Validate IANA timezone using Intl.DateTimeFormat
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch {
    // Invalid timezone - fall back to UTC
    return 'UTC'
  }
}

/**
 * Gets the start of the business-local day as a UTC ISO timestamp.
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @param referenceDate - Reference date in UTC (defaults to now)
 * @returns ISO timestamp of midnight in business timezone
 */
export function getBusinessDayStart(timezone: string, referenceDate: Date = new Date()): string {
  const normalizedTimezone = normalizeBusinessTimezone(timezone)
  // Convert UTC reference date to target timezone
  const zonedDate = toZonedTime(referenceDate, normalizedTimezone)
  // Set to midnight in that timezone
  zonedDate.setHours(0, 0, 0, 0)
  // Convert back to UTC
  const utcDate = fromZonedTime(zonedDate, normalizedTimezone)
  return utcDate.toISOString()
}

/**
 * Gets the business-local date as a YYYY-MM-DD string.
 *
 * This is used for DATE-only column comparisons (e.g., scheduled_date, due_date).
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @param referenceDate - Reference date in UTC (defaults to now)
 * @returns YYYY-MM-DD string in business timezone
 */
export function getBusinessLocalDateString(timezone: string, referenceDate: Date = new Date()): string {
  const normalizedTimezone = normalizeBusinessTimezone(timezone)
  const zonedDate = toZonedTime(referenceDate, normalizedTimezone)
  const year = zonedDate.getFullYear()
  const month = String(zonedDate.getMonth() + 1).padStart(2, '0')
  const day = String(zonedDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Gets the start of the business-local week as a UTC ISO timestamp.
 *
 * Week starts on Sunday (consistent with JavaScript Date.getDay()).
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @param referenceDate - Reference date in UTC (defaults to now)
 * @returns ISO timestamp of Sunday midnight in business timezone
 */
export function getBusinessWeekStart(timezone: string, referenceDate: Date = new Date): string {
  const normalizedTimezone = normalizeBusinessTimezone(timezone)
  const zonedDate = toZonedTime(referenceDate, normalizedTimezone)
  const dayOfWeek = zonedDate.getDay() // 0 = Sunday, 6 = Saturday
  const daysToSunday = dayOfWeek
  zonedDate.setDate(zonedDate.getDate() - daysToSunday)
  zonedDate.setHours(0, 0, 0, 0)
  const utcDate = fromZonedTime(zonedDate, normalizedTimezone)
  return utcDate.toISOString()
}

/**
 * Gets the start of the business-local month as a UTC ISO timestamp.
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @param referenceDate - Reference date in UTC (defaults to now)
 * @returns ISO timestamp of first day of month at midnight in business timezone
 */
export function getBusinessMonthStart(timezone: string, referenceDate: Date = new Date): string {
  const normalizedTimezone = normalizeBusinessTimezone(timezone)
  const zonedDate = toZonedTime(referenceDate, normalizedTimezone)
  zonedDate.setDate(1)
  zonedDate.setHours(0, 0, 0, 0)
  const utcDate = fromZonedTime(zonedDate, normalizedTimezone)
  return utcDate.toISOString()
}

/**
 * Gets the timestamp N days ago in business timezone.
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @param daysAgo - Number of days to go back
 * @param referenceDate - Reference date in UTC (defaults to now)
 * @returns ISO timestamp of N days ago at midnight in business timezone
 */
export function getBusinessDaysAgo(timezone: string, daysAgo: number, referenceDate: Date = new Date): string {
  const normalizedTimezone = normalizeBusinessTimezone(timezone)
  const zonedDate = toZonedTime(referenceDate, normalizedTimezone)
  zonedDate.setDate(zonedDate.getDate() - daysAgo)
  zonedDate.setHours(0, 0, 0, 0)
  const utcDate = fromZonedTime(zonedDate, normalizedTimezone)
  return utcDate.toISOString()
}

/**
 * Gets the timestamp N days ago in business timezone (relative time, not midnight).
 *
 * Use this for "last N days" ranges where the exact time matters.
 *
 * @param timezone - Business timezone (e.g., 'America/New_York', 'UTC')
 * @param daysAgo - Number of days to go back
 * @param referenceDate - Reference date in UTC (defaults to now)
 * @returns ISO timestamp of exactly N days ago in business timezone
 */
export function getBusinessDaysAgoRelative(timezone: string, daysAgo: number, referenceDate: Date = new Date): string {
  const normalizedTimezone = normalizeBusinessTimezone(timezone)
  const zonedDate = toZonedTime(referenceDate, normalizedTimezone)
  zonedDate.setDate(zonedDate.getDate() - daysAgo)
  const utcDate = fromZonedTime(zonedDate, normalizedTimezone)
  return utcDate.toISOString()
}