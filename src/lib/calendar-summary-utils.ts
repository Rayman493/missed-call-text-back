/**
 * Calendar month summary utilities
 * Pure functions for counting items in a visible month
 */

export interface CalendarEvent {
  id: string
  summary: string
  description: string | null
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  location: string | null
  htmlLink: string | null
}

export interface Task {
  id: string
  title: string
  notes: string | null
  due_date: string | null
  due_time: string | null
  completed: boolean
  completed_at: string | null
  lead_id: string | null
  job_id: string | null
  created_at: string
  business_id?: string
}

export interface Job {
  id: string
  title: string
  customer_name: string | null
  scheduled_date: string | null
  status: string
  google_calendar_event_id: string | null
}

export interface MonthCounts {
  appointments: number
  jobs: number
  reminders: number
}

/**
 * Get date key in YYYY-MM-DD format for a Date object
 * Uses local timezone to avoid timezone shifts
 */
export const getDateKey = (date: Date): string => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Count items (reminders, jobs, appointments) within a visible month
 *
 * @param visibleMonth - The currently visible calendar month
 * @param events - Calendar events
 * @param jobs - Jobs
 * @param tasks - Tasks/reminders
 * @returns Count of each item type in the visible month
 */
export const getMonthCounts = (
  visibleMonth: Date,
  events: CalendarEvent[],
  jobs: Job[],
  tasks: Task[]
): MonthCounts => {
  const startOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1)
  const endOfMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0)

  // Count appointments by start date
  const appointments = events.filter(event => {
    const eventDateRaw = event.start?.dateTime || event.start?.date
    if (!eventDateRaw) return false
    const eventDate = new Date(eventDateRaw)
    return eventDate >= startOfMonth && eventDate <= endOfMonth
  }).length

  // Count jobs by scheduled date (exclude cancelled and unscheduled)
  const startKey = getDateKey(startOfMonth)
  const endKey = getDateKey(endOfMonth)
  const jobCount = jobs.filter(j => {
    if (!j.scheduled_date || j.status === 'cancelled') return false
    return j.scheduled_date >= startKey && j.scheduled_date <= endKey
  }).length

  // Count reminders by due date (exclude completed)
  const reminderCount = tasks.filter(t => {
    if (!t.due_date || t.completed) return false
    const taskDate = new Date(t.due_date)
    return taskDate >= startOfMonth && taskDate <= endOfMonth
  }).length

  return { appointments, jobs: jobCount, reminders: reminderCount }
}