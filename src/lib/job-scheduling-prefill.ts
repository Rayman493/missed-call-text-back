/**
 * Job Scheduling Prefill Helper
 *
 * Extracts safe date/time prefill from AI intake timing preferences.
 * Prefers deterministic parsing over AI guessing.
 */

export interface JobSchedulingPrefill {
  date?: string // ISO date string (YYYY-MM-DD) if safely resolved
  time?: string // 24-hour time string (HH:MM) if specific
  requestedCompletionLabel?: string // Original customer wording for display
  callbackPreferenceLabel?: string // Callback preference for display
  dateWasResolved: boolean
  timeWasResolved: boolean
}

/**
 * Parse a relative or explicit date string to an ISO date.
 * Uses business timezone (assumed to be the user's local timezone for now).
 * Returns undefined if the date cannot be safely resolved.
 */
function parseDate(dateString: string, timezone: string = 'UTC'): string | undefined {
  if (!dateString || typeof dateString !== 'string') return undefined

  const normalized = dateString.toLowerCase().trim()

  // Safe explicit dates
  const explicitDateMatch = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (explicitDateMatch) {
    const [, year, month, day] = explicitDateMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Safe relative dates
  const today = new Date()
  const targetDate = new Date(today)

  if (normalized === 'tomorrow') {
    targetDate.setDate(today.getDate() + 1)
    return targetDate.toISOString().split('T')[0]
  }

  // Day names (next occurrence)
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const dayMatch = normalized.match(/^(this\s+)?(\w+)$/)
  if (dayMatch) {
    const dayName = dayMatch[2].toLowerCase()
    const dayIndex = days.indexOf(dayName)
    
    if (dayIndex !== -1) {
      const currentDay = today.getDay()
      const daysUntil = (dayIndex - currentDay + 7) % 7
      // If "this" is specified and the day is today, use today
      // If "this" is specified and the day is in the past, use next week
      // If no "this", always use next occurrence
      const useThisWeek = dayMatch[1] === 'this '
      if (useThisWeek && daysUntil === 0) {
        // Today
      } else if (useThisWeek && daysUntil > 0) {
        targetDate.setDate(today.getDate() + daysUntil)
      } else {
        targetDate.setDate(today.getDate() + (daysUntil === 0 ? 7 : daysUntil))
      }
      return targetDate.toISOString().split('T')[0]
    }
  }

  // Ambiguous phrases - do NOT convert
  const ambiguousPatterns = [
    'in the next couple weeks',
    'in the next few weeks',
    'sometime next month',
    'as soon as possible',
    'whenever you can',
    'this summer',
    'soon',
    'next couple weeks',
    'couple weeks',
    'few weeks',
    'next week',
    'this week',
  ]

  for (const pattern of ambiguousPatterns) {
    if (normalized.includes(pattern)) {
      return undefined
    }
  }

  return undefined
}

/**
 * Parse a specific time string to 24-hour format.
 * Returns undefined if the time is not specific enough.
 */
function parseTime(timeString: string): string | undefined {
  if (!timeString || typeof timeString !== 'string') return undefined

  const normalized = timeString.toLowerCase().trim()

  // Broad windows - do NOT convert
  const broadWindows = ['morning', 'afternoon', 'evening', 'anytime', 'asap', 'as soon as possible']
  for (const window of broadWindows) {
    if (normalized.includes(window)) {
      return undefined
    }
  }

  // Try to parse specific time formats
  // 12-hour format with AM/PM
  const twelveHourMatch = normalized.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i)
  if (twelveHourMatch) {
    const [, hours, minutes, period] = twelveHourMatch
    let hour = parseInt(hours, 10)
    const minute = parseInt(minutes, 10)
    
    if (period.toLowerCase() === 'pm' && hour !== 12) {
      hour += 12
    } else if (period.toLowerCase() === 'am' && hour === 12) {
      hour = 0
    }
    
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
  }

  // 24-hour format
  const twentyFourHourMatch = normalized.match(/(\d{1,2}):(\d{2})/)
  if (twentyFourHourMatch) {
    const [, hours, minutes] = twentyFourHourMatch
    const hour = parseInt(hours, 10)
    const minute = parseInt(minutes, 10)
    
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
  }

  return undefined
}

/**
 * Derive job scheduling prefill from AI intake timing preferences.
 * 
 * This function:
 * - Separates completion timing from callback preference
 * - Only prefills date when it can be safely resolved
 * - Only prefills time when a specific schedulable time exists
 * - Preserves original customer wording for display
 * - Fails safely for ambiguous requests
 */
export function deriveJobSchedulingPrefill(
  desiredCompletion: string | null | undefined,
  callbackTime: string | null | undefined,
  timezone: string = 'UTC'
): JobSchedulingPrefill {
  const result: JobSchedulingPrefill = {
    dateWasResolved: false,
    timeWasResolved: false,
  }

  // Process desired completion (for job scheduling)
  if (desiredCompletion) {
    result.requestedCompletionLabel = desiredCompletion

    // Try to extract date from desired completion
    const parsedDate = parseDate(desiredCompletion, timezone)
    if (parsedDate) {
      result.date = parsedDate
      result.dateWasResolved = true
    }

    // Try to extract time from desired completion
    const parsedTime = parseTime(desiredCompletion)
    if (parsedTime) {
      result.time = parsedTime
      result.timeWasResolved = true
    }
  }

  // Process callback time (separate from job scheduling)
  if (callbackTime) {
    result.callbackPreferenceLabel = callbackTime
  }

  return result
}
