import { describe, it, expect } from 'vitest'
import { getMonthCounts, getDateKey } from '@/lib/calendar-summary-utils'

describe('Calendar Month Summary - Regression Tests', () => {
  describe('getDateKey', () => {
    it('formats date as YYYY-MM-DD in local timezone', () => {
      const date = new Date(2026, 7, 15) // August 15, 2026 (0-indexed month)
      expect(getDateKey(date)).toBe('2026-08-15')
    })

    it('handles single-digit months and days with padding', () => {
      const date = new Date(2026, 0, 5) // January 5, 2026
      expect(getDateKey(date)).toBe('2026-01-05')
    })
  })

  describe('getMonthCounts', () => {
    const createEvent = (date: string) => ({
      id: `event-${date}`,
      summary: 'Test Event',
      description: null,
      start: { dateTime: date },
      end: { dateTime: date },
      location: null,
      htmlLink: null
    })

    const createTask = (dueDate: string, completed: boolean = false) => ({
      id: `task-${dueDate}`,
      title: 'Test Task',
      notes: null,
      due_date: dueDate,
      due_time: null,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      lead_id: null,
      job_id: null,
      created_at: new Date().toISOString()
    })

    const createJob = (scheduledDate: string | null, status: string = 'scheduled') => ({
      id: `job-${scheduledDate}`,
      title: 'Test Job',
      customer_name: 'Test Customer',
      scheduled_date: scheduledDate,
      status,
      google_calendar_event_id: null
    })

    it('counts items in visible August month', () => {
      const august2026 = new Date(2026, 7, 1) // August 2026

      const events = [
        createEvent('2026-08-15T10:00:00'),
        createEvent('2026-08-20T14:00:00')
      ]

      const tasks = [
        createTask('2026-08-10'),
        createTask('2026-08-25')
      ]

      const jobs = [
        createJob('2026-08-05'),
        createJob('2026-08-30')
      ]

      const counts = getMonthCounts(august2026, events, jobs, tasks)

      expect(counts.appointments).toBe(2)
      expect(counts.reminders).toBe(2)
      expect(counts.jobs).toBe(2)
    })

    it('excludes items outside visible month when viewing October', () => {
      const october2026 = new Date(2026, 9, 1) // October 2026

      const events = [
        createEvent('2026-08-15T10:00:00'), // Outside
        createEvent('2026-10-20T14:00:00')  // Inside
      ]

      const tasks = [
        createTask('2026-08-10'), // Outside
        createTask('2026-10-25')  // Inside
      ]

      const jobs = [
        createJob('2026-08-05'), // Outside
        createJob('2026-10-30')  // Inside
      ]

      const counts = getMonthCounts(october2026, events, jobs, tasks)

      expect(counts.appointments).toBe(1)
      expect(counts.reminders).toBe(1)
      expect(counts.jobs).toBe(1)
    })

    it('excludes completed reminders', () => {
      const august2026 = new Date(2026, 7, 1)

      const tasks = [
        createTask('2026-08-10', false),
        createTask('2026-08-15', true), // Completed
        createTask('2026-08-20', false)
      ]

      const counts = getMonthCounts(august2026, [], [], tasks)

      expect(counts.reminders).toBe(2)
    })

    it('excludes unscheduled jobs', () => {
      const august2026 = new Date(2026, 7, 1)

      const jobs = [
        createJob('2026-08-10'),
        createJob(null), // Unscheduled
        createJob('2026-08-20')
      ]

      const counts = getMonthCounts(august2026, [], jobs, [])

      expect(counts.jobs).toBe(2)
    })

    it('excludes cancelled jobs', () => {
      const august2026 = new Date(2026, 7, 1)

      const jobs = [
        createJob('2026-08-10', 'scheduled'),
        createJob('2026-08-15', 'cancelled'),
        createJob('2026-08-20', 'scheduled')
      ]

      const counts = getMonthCounts(august2026, [], jobs, [])

      expect(counts.jobs).toBe(2)
    })

    it('counts appointments by start date/dateTime', () => {
      const august2026 = new Date(2026, 7, 1)

      const events = [
        createEvent('2026-08-15T10:00:00'),
        {
          id: 'all-day-event',
          summary: 'All Day Event',
          description: null,
          start: { date: '2026-08-20' },
          end: { date: '2026-08-21' },
          location: null,
          htmlLink: null
        }
      ]

      const counts = getMonthCounts(august2026, events, [], [])

      expect(counts.appointments).toBe(2)
    })

    it('includes first day and mid-month items in visible month', () => {
      const august2026 = new Date(2026, 7, 1) // August 2026

      const events = [
        createEvent('2026-08-01T12:00:00'), // First day at noon
        createEvent('2026-08-15T14:00:00')  // Mid-month
      ]

      const counts = getMonthCounts(august2026, events, [], [])

      expect(counts.appointments).toBe(2)
    })

    it('handles singular/plural grammar correctly via count values', () => {
      const august2026 = new Date(2026, 7, 1)

      // Test singular counts
      const events1 = [createEvent('2026-08-15T10:00:00')]
      const tasks1 = [createTask('2026-08-10')]
      const jobs1 = [createJob('2026-08-05')]

      const counts1 = getMonthCounts(august2026, events1, jobs1, tasks1)

      expect(counts1.appointments).toBe(1)
      expect(counts1.reminders).toBe(1)
      expect(counts1.jobs).toBe(1)

      // Test plural counts
      const events2 = [
        createEvent('2026-08-15T10:00:00'),
        createEvent('2026-08-20T14:00:00')
      ]
      const tasks2 = [
        createTask('2026-08-10'),
        createTask('2026-08-25')
      ]
      const jobs2 = [
        createJob('2026-08-05'),
        createJob('2026-08-30')
      ]

      const counts2 = getMonthCounts(august2026, events2, jobs2, tasks2)

      expect(counts2.appointments).toBe(2)
      expect(counts2.reminders).toBe(2)
      expect(counts2.jobs).toBe(2)

      // Test zero counts
      const counts3 = getMonthCounts(august2026, [], [], [])

      expect(counts3.appointments).toBe(0)
      expect(counts3.reminders).toBe(0)
      expect(counts3.jobs).toBe(0)
    })

    it('recomputes counts when visible month changes', () => {
      const august2026 = new Date(2026, 7, 1)
      const october2026 = new Date(2026, 9, 1)

      const events = [
        createEvent('2026-08-15T10:00:00'),
        createEvent('2026-10-20T14:00:00')
      ]

      const augustCounts = getMonthCounts(august2026, events, [], [])
      expect(augustCounts.appointments).toBe(1)

      const octoberCounts = getMonthCounts(october2026, events, [], [])
      expect(octoberCounts.appointments).toBe(1)
    })

    it('handles Today navigation by recomputing with new visible month', () => {
      // Simulate navigating from October to Today (assuming today is August)
      const october2026 = new Date(2026, 9, 1)
      const todayAugust = new Date(2026, 7, 15) // Assume today is August 15

      const events = [
        createEvent('2026-08-15T10:00:00'),
        createEvent('2026-10-20T14:00:00')
      ]

      const octoberCounts = getMonthCounts(october2026, events, [], [])
      expect(octoberCounts.appointments).toBe(1)

      const todayCounts = getMonthCounts(todayAugust, events, [], [])
      expect(todayCounts.appointments).toBe(1)
    })
  })
})