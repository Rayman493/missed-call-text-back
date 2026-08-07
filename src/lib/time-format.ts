/**
 * Time Formatting Utility
 * Provides consistent 12-hour time formatting across the application
 */

/**
 * Format a date or time string to 12-hour format
 * @param time - Date object, ISO string, or time string
 * @returns Formatted time in 12-hour format (e.g., "9:30 AM", "12:15 PM")
 */
export function formatTime12Hour(time: Date | string | null | undefined): string {
  if (!time) return ''
  
  const date = typeof time === 'string' ? new Date(time) : time
  
  if (isNaN(date.getTime())) return ''
  
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * Format a date and time to 12-hour time format
 * @param dateTime - Date object or ISO string
 * @returns Formatted time in 12-hour format (e.g., "9:30 AM", "12:15 PM")
 */
export function formatDateTime12Hour(dateTime: Date | string | null | undefined): string {
  return formatTime12Hour(dateTime)
}

/**
 * Format a date to a readable date string
 * @param date - Date object or ISO string
 * @returns Formatted date (e.g., "January 15, 2026")
 */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return ''
  
  const dateObj = typeof date === 'string' ? new Date(date) : date
  
  if (isNaN(dateObj.getTime())) return ''
  
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Format a date and time to a readable string
 * @param dateTime - Date object or ISO string
 * @returns Formatted date and time (e.g., "January 15, 2026 at 9:30 AM")
 */
export function formatDateTime(dateTime: Date | string | null | undefined): string {
  if (!dateTime) return ''
  
  const dateObj = typeof dateTime === 'string' ? new Date(dateTime) : dateTime
  
  if (isNaN(dateObj.getTime())) return ''
  
  const dateStr = dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  
  const timeStr = dateObj.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
  
  return `${dateStr} at ${timeStr}`
}
