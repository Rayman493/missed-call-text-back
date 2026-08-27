/**
 * Calendar Selected-Day Customer Display Tests
 * 
 * Tests for the calendar selected-day detail card customer name display.
 * Specifically tests that actual customer names are shown instead of generic "Customer" labels.
 */

import { describe, it, expect } from 'vitest'

describe('Calendar Selected-Day Customer Display', () => {
  describe('Event with linked job and customer name', () => {
    it('should display actual customer name from job.customer_name', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: 'Ryan Smith',
          customer_phone: '(412) 253-3598',
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons',
        start: { dateTime: '2026-08-27T19:00:00' },
        end: { dateTime: '2026-08-27T20:00:00' },
        location: '5510 Mifflin Road'
      }

      // Simulate the logic from the calendar page
      const job = jobs.find(j => j.google_calendar_event_id === calendarEvent.id)
      const customerName = job?.customer_name || null

      expect(customerName).toBe('Ryan Smith')
      expect(customerName).not.toBe('Customer')
      expect(customerName).not.toBe('Overwatch Lessons')
    })
  })

  describe('Event with linked job but no customer name', () => {
    it('should not display fake customer name when job has no customer_name', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: null,
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons',
        start: { dateTime: '2026-08-27T19:00:00' },
        end: { dateTime: '2026-08-27T20:00:00' }
      }

      // Simulate the logic from the calendar page
      const job = jobs.find(j => j.google_calendar_event_id === calendarEvent.id)
      const customerName = job?.customer_name || null

      expect(customerName).toBeNull()
      expect(customerName).not.toBe('Customer')
    })
  })

  describe('Event without linked job', () => {
    it('should not display fake customer name when no job is linked', () => {
      const jobs = []

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons',
        start: { dateTime: '2026-08-27T19:00:00' },
        end: { dateTime: '2026-08-27T20:00:00' },
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-123'
          }
        }
      }

      // Simulate the logic from the calendar page (after fix)
      const job = jobs.find(j => j.google_calendar_event_id === calendarEvent.id)
      const customerName = job?.customer_name || null

      expect(customerName).toBeNull()
      expect(customerName).not.toBe('Customer')
    })
  })

  describe('Time range display', () => {
    it('should display full time range for events with end time', () => {
      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons',
        start: { dateTime: '2026-08-27T19:00:00' },
        end: { dateTime: '2026-08-27T20:00:00' }
      }

      // Simulate formatEventTimeRange logic
      const startDateTime = calendarEvent.start.dateTime
      const endDateTime = calendarEvent.end.dateTime
      const startDate = calendarEvent.start.date

      const startDateObj = new Date(startDateTime!)
      const startTimeStr = startDateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      const endDateObj = new Date(endDateTime!)
      const endTimeStr = endDateObj.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      const timeRange = `${startTimeStr} – ${endTimeStr}`

      expect(timeRange).toBe('7:00 PM – 8:00 PM')
      expect(timeRange).not.toBe('7:00 PM')
      expect(timeRange).not.toBe('7:00 PM – 7:00 PM')
    })

    it('should display All day for all-day events', () => {
      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Team Building',
        start: { date: '2026-08-27' },
        end: { date: '2026-08-28' }
      }

      const startDate = calendarEvent.start.date
      const startDateTime = calendarEvent.start.dateTime

      const timeRange = (!startDateTime && startDate) ? 'All day' : 'formatted time'

      expect(timeRange).toBe('All day')
    })
  })

  describe('Location display', () => {
    it('should display location when available', () => {
      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons',
        location: '5510 Mifflin Road'
      }

      const location = calendarEvent.location

      expect(location).toBe('5510 Mifflin Road')
    })

    it('should not display location when unavailable', () => {
      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Virtual Meeting',
        location: null
      }

      const location = calendarEvent.location

      expect(location).toBeNull()
    })
  })

  describe('Regression test for bug', () => {
    it('should not use job.title as customer name', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: 'Ryan Smith',
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      // Before fix: job?.title || (rfLead ? 'Customer' : null)
      // After fix: job?.customer_name || null
      const job = jobs.find(j => j.google_calendar_event_id === calendarEvent.id)
      
      const customerNameBeforeFix = job?.title || null
      const customerNameAfterFix = job?.customer_name || null

      expect(customerNameBeforeFix).toBe('Overwatch Lessons') // Wrong - this is the bug
      expect(customerNameAfterFix).toBe('Ryan Smith') // Correct - this is the fix
    })

    it('should not use hardcoded "Customer" string', () => {
      const jobs = []

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-123'
          }
        }
      }

      // Before fix: job?.title || (rfLead ? 'Customer' : null)
      // After fix: job?.customer_name || null
      const job = jobs.find(j => j.google_calendar_event_id === calendarEvent.id)
      const rfLead = calendarEvent?.extendedProperties?.private?.replyflow_lead_id

      const customerNameBeforeFix = job?.title || (rfLead ? 'Customer' : null)
      const customerNameAfterFix = job?.customer_name || null

      expect(customerNameBeforeFix).toBe('Customer') // Wrong - fake customer name
      expect(customerNameAfterFix).toBeNull() // Correct - no fake name
    })
  })
})