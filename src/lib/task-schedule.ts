/**
 * Task Scheduling Helper
 * Extracted for testability without Supabase/HTTP dependencies
 */

import { calculateReminderNotifyAt } from './reminder-notification-utils'

export interface TaskScheduleInput {
  dueDate: string | null
  dueTime: string | null
  reminderOffsetMinutes: number | null
  reminderNotifyAt?: string | null
  businessTimezone: string
}

export interface TaskScheduleResult {
  reminderOffsetMinutes: number | null
  reminderNotifyAt: string | null
  warning: string | null
}

export function validateReminderOffset(offset: number | null | undefined): boolean {
  if (offset === null || offset === undefined) {
    return true
  }
  const validOffsets = [0, 15, 30, 60, 1440]
  return validOffsets.includes(offset)
}

export function calculateTaskSchedule(input: TaskScheduleInput): TaskScheduleResult {
  const { dueDate, dueTime, reminderOffsetMinutes, businessTimezone } = input

  // Validate offset
  if (!validateReminderOffset(reminderOffsetMinutes)) {
    return {
      reminderOffsetMinutes: null,
      reminderNotifyAt: null,
      warning: null // API will reject with error, not warning
    }
  }

  // Calculate notify_at if all required fields are present
  let reminderNotifyAt: string | null = null
  let warning: string | null = null

  if (dueDate && dueTime && reminderOffsetMinutes !== null && reminderOffsetMinutes !== undefined) {
    reminderNotifyAt = calculateReminderNotifyAt({
      dueDate,
      dueTime,
      offsetMinutes: reminderOffsetMinutes,
      timezone: businessTimezone
    })

    if (!reminderNotifyAt) {
      warning = 'Reminder saved, but notification could not be scheduled'
    }
  }

  return {
    reminderOffsetMinutes: reminderOffsetMinutes || null,
    reminderNotifyAt,
    warning
  }
}

export function calculateTaskScheduleUpdate(
  current: TaskScheduleInput,
  updates: Partial<TaskScheduleInput>
): TaskScheduleResult {
  // Resolve final effective values (undefined = preserve existing, null = explicit removal)
  const effectiveDueDate = updates.dueDate !== undefined ? updates.dueDate : current.dueDate
  const effectiveDueTime = updates.dueTime !== undefined ? updates.dueTime : current.dueTime
  const effectiveOffset = updates.reminderOffsetMinutes !== undefined
    ? updates.reminderOffsetMinutes
    : current.reminderOffsetMinutes

  // Validate new offset if provided
  if (updates.reminderOffsetMinutes !== undefined && !validateReminderOffset(updates.reminderOffsetMinutes)) {
    return {
      reminderOffsetMinutes: current.reminderOffsetMinutes,
      reminderNotifyAt: current.reminderNotifyAt || null,
      warning: null
    }
  }

  // Recalculate if any scheduling field changed
  const schedulingChanged =
    updates.dueDate !== undefined ||
    updates.dueTime !== undefined ||
    updates.reminderOffsetMinutes !== undefined

  if (!schedulingChanged) {
    // No changes - preserve existing values
    return {
      reminderOffsetMinutes: current.reminderOffsetMinutes,
      reminderNotifyAt: current.reminderNotifyAt || null,
      warning: null
    }
  }

  return calculateTaskSchedule({
    dueDate: effectiveDueDate,
    dueTime: effectiveDueTime,
    reminderOffsetMinutes: effectiveOffset,
    businessTimezone: current.businessTimezone
  })
}