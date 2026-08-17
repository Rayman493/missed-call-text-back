/**
 * Converts a Date to a local YYYY-MM-DD string key.
 *
 * This is used for calendar grouping and should NOT be used for API boundaries
 * where ISO timestamps are required.
 *
 * @param date - The date to convert (interpreted as local time)
 * @returns YYYY-MM-DD string in local timezone
 */
export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Gets today's date as a local YYYY-MM-DD string key.
 *
 * @returns Today's date as YYYY-MM-DD in local timezone
 */
export function getTodayLocalDateKey(): string {
  return getLocalDateKey(new Date())
}

/**
 * Formats a time string from 24-hour format (HH:MM or HH:MM:SS) to 12-hour format with AM/PM.
 *
 * @param timeStr - Time string in 24-hour format (e.g., "15:00" or "15:00:00")
 * @returns Formatted time string (e.g., "3:00 PM") or empty string if input is null/empty
 */
export function formatTime12Hour(timeStr: string | null): string {
  if (!timeStr) return ''
  // Handle time strings with or without seconds (e.g., "15:30:00" or "15:30")
  const [hours, minutes] = timeStr.split(':').slice(0, 2)
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

/**
 * Filters calendar events to only those in the specified month (local timezone).
 *
 * @param events - Array of calendar events
 * @param year - Year (local timezone)
 * @param month - Month (0-11, local timezone)
 * @returns Filtered events for the specified month
 */
export function filterEventsByMonth(
  events: any[],
  year: number,
  month: number
): any[] {
  return events.filter(event => {
    const eventDateRaw = event.start?.dateTime || event.start?.date
    if (!eventDateRaw) return false

    const eventDate = new Date(eventDateRaw)
    const eventYear = eventDate.getFullYear()
    const eventMonth = eventDate.getMonth()

    return eventYear === year && eventMonth === month
  })
}