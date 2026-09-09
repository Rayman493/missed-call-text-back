/**
 * Time tracking formatting helpers.
 * Pure functions for formatting durations and time entries.
 */

export interface JobTimeEntry {
  id: string
  job_id: string
  started_at: string
  ended_at: string | null
}

/**
 * Format milliseconds as "Xh Ym" (e.g. 8280000 -> "2h 18m").
 * For active timers, pass a "now" timestamp to compute elapsed.
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${seconds}s`
}

/**
 * Format a running timer as "HH:MM:SS" (e.g. 5056000 -> "01:24:16").
 */
export function formatTimerClock(ms: number): string {
  if (ms < 0) ms = 0
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/**
 * Compute total completed duration from a list of entries.
 * Only entries with ended_at are counted.
 */
export function totalCompletedDuration(entries: JobTimeEntry[]): number {
  let total = 0
  for (const e of entries) {
    if (e.ended_at && e.started_at) {
      const start = new Date(e.started_at).getTime()
      const end = new Date(e.ended_at).getTime()
      if (end > start) total += (end - start)
    }
  }
  return total
}

/**
 * Find the active (running) entry from a list.
 */
export function findActiveEntry(entries: JobTimeEntry[]): JobTimeEntry | null {
  return entries.find(e => !e.ended_at) || null
}

/**
 * Format a timestamp for display in entry history (e.g. "2:04 PM").
 */
export function formatEntryTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * Format a timestamp for entry history date label (e.g. "Today", "Yesterday", "Mar 15").
 */
export function formatEntryDate(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(date, today)) return 'Today'
  if (isSameDay(date, yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
