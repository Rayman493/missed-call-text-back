/**
 * Reminder Notification Timezone Utilities
 *
 * Calculates notification timestamps for Reminders using business timezone.
 */

import { fromZonedTime } from 'date-fns-tz'
import { normalizeBusinessTimezone } from './business-date-utils'

export interface CalculateReminderNotifyAtParams {
  dueDate: string | null
  dueTime: string | null
  offsetMinutes: number | null
  timezone: string
}

/**
 * Calculate the UTC timestamp when a Reminder notification should fire.
 *
 * Algorithm:
 * 1. Combine due_date + due_time as wall-clock time
 * 2. Interpret that wall-clock time in business timezone and convert to UTC instant
 * 3. Subtract offsetMinutes from the UTC instant
 * 4. Return as ISO UTC timestamp
 *
 * Returns null if:
 * - due_date is missing
 * - due_time is missing
 * - offsetMinutes is null
 *
 * @param params - Calculation parameters
 * @returns ISO UTC timestamp string or null if notification should not be scheduled
 */
export function calculateReminderNotifyAt(params: CalculateReminderNotifyAtParams): string | null {
  const { dueDate, dueTime, offsetMinutes, timezone } = params

  // Validation: All three must be present
  if (!dueDate || !dueTime || offsetMinutes === null || offsetMinutes === undefined) {
    return null
  }

  // Validate offset is non-negative
  if (offsetMinutes < 0) {
    return null
  }

  // Normalize timezone
  const normalizedTimezone = normalizeBusinessTimezone(timezone)

  try {
    // Step 1: Combine due_date + due_time as wall-clock time
    const wallClockDateTime = `${dueDate}T${dueTime}:00`

    // Step 2: Interpret wall-clock time in business timezone and convert to UTC instant
    const utcDateTime = fromZonedTime(new Date(wallClockDateTime), normalizedTimezone)

    // Step 3: Apply offset (subtract from the UTC instant)
    utcDateTime.setMinutes(utcDateTime.getMinutes() - offsetMinutes)

    // Step 4: Return as ISO UTC timestamp
    return utcDateTime.toISOString()
  } catch (error) {
    console.error('[REMINDER NOTIFICATION] Failed to calculate notify_at:', error)
    return null
  }
}