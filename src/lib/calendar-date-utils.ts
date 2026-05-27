/**
 * Calendar Date Utilities
 * Centralized functions for normalizing and comparing calendar event dates
 */

/**
 * Format a Date object to a YYYY-MM-DD string key
 * Uses local date components to avoid timezone issues
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Parse a YYYY-MM-DD string key to a local Date object
 * Avoids UTC shifting by parsing components directly
 */
export function parseDateKeyLocal(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/**
 * Get the date key for a calendar event
 * Handles both all-day events (start.date) and timed events (start.dateTime)
 */
export function getEventDateKey(event: { start?: { date?: string; dateTime?: string } }): string | null {
  if (!event.start) return null
  
  // All-day event: use the date string directly (YYYY-MM-DD)
  if (event.start.date) {
    return event.start.date
  }
  
  // Timed event: extract date from ISO string
  if (event.start.dateTime) {
    return event.start.dateTime.split('T')[0]
  }
  
  return null
}

/**
 * Check if an event's date falls within a given month range
 */
export function isEventInMonth(
  event: { start?: { date?: string; dateTime?: string } },
  year: number,
  month: number // 0-indexed (0 = January, 11 = December)
): boolean {
  const eventDateKey = getEventDateKey(event)
  if (!eventDateKey) return false
  
  const [eventYear, eventMonth] = eventDateKey.split('-').map(Number)
  return eventYear === year && eventMonth === month + 1
}

/**
 * Filter events to only those in the visible month
 */
export function filterEventsByMonth<T extends { start?: { date?: string; dateTime?: string } }>(
  events: T[],
  year: number,
  month: number // 0-indexed
): T[] {
  return events.filter(event => isEventInMonth(event, year, month))
}
