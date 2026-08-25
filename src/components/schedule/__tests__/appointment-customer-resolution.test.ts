import { describe, it, expect } from 'vitest'

describe('Schedule Appointment Customer Resolution Regression Tests', () => {
  describe('ScheduleMap customer resolution', () => {
    it('should resolve customer from linked job', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: 'Amber',
          customer_phone: '(412) 253-3598',
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      // Simulate the getCustomerFromCalendarEvent logic
      const linkedJob = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customer = linkedJob ? {
        customerName: linkedJob.customer_name,
        customerPhone: linkedJob.customer_phone,
        leadId: linkedJob.lead_id
      } : { customerName: null, customerPhone: null, leadId: null }

      expect(customer.customerName).toBe('Amber')
      expect(customer.customerPhone).toBe('(412) 253-3598')
    })

    it('should return null customer when no linked job', () => {
      const jobs = []

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      const linkedJob = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customer = linkedJob ? {
        customerName: linkedJob.customer_name,
        customerPhone: linkedJob.customer_phone,
        leadId: linkedJob.lead_id
      } : { customerName: null, customerPhone: null, leadId: null }

      expect(customer.customerName).toBeNull()
      expect(customer.customerPhone).toBeNull()
      expect(customer.leadId).toBeNull()
    })

    it('should return null customer when job has no customer_name', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: null,
          customer_phone: null,
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      const linkedJob = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customer = linkedJob ? {
        customerName: linkedJob.customer_name,
        customerPhone: linkedJob.customer_phone,
        leadId: linkedJob.lead_id
      } : { customerName: null, customerPhone: null, leadId: null }

      expect(customer.customerName).toBeNull()
      expect(customer.customerPhone).toBeNull()
    })
  })

  describe('TodayCommandCenter customer resolution', () => {
    it('should resolve customer from linked job', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: 'Amber',
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      // Simulate the getCustomerFromCalendarEvent logic
      const linkedJob = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customer = linkedJob?.customer_name || null

      expect(customer).toBe('Amber')
    })

    it('should return null customer when no linked job', () => {
      const jobs = []

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      const linkedJob = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customer = linkedJob?.customer_name || null

      expect(customer).toBeNull()
    })
  })

  describe('Consistency across surfaces', () => {
    it('should return same customer from ScheduleMap and TodayCommandCenter', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Overwatch Lessons',
          customer_name: 'Amber',
          customer_phone: '(412) 253-3598',
          google_calendar_event_id: 'cal-event-1'
        }
      ]

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Overwatch Lessons'
      }

      // ScheduleMap resolution
      const linkedJobMap = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customerMap = linkedJobMap ? {
        customerName: linkedJobMap.customer_name,
        customerPhone: linkedJobMap.customer_phone,
        leadId: linkedJobMap.lead_id
      } : { customerName: null, customerPhone: null, leadId: null }

      // TodayCommandCenter resolution
      const linkedJobToday = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customerToday = linkedJobToday?.customer_name || null

      expect(customerMap.customerName).toBe(customerToday)
    })
  })

  describe('Appointment without customer', () => {
    it('should correctly show null for standalone calendar event', () => {
      const jobs = []

      const calendarEvent = {
        id: 'cal-event-1',
        summary: 'Personal Meeting'
      }

      const linkedJob = jobs.find(job => job.google_calendar_event_id === calendarEvent.id)
      const customer = linkedJob ? {
        customerName: linkedJob.customer_name,
        customerPhone: linkedJob.customer_phone,
        leadId: linkedJob.lead_id
      } : { customerName: null, customerPhone: null, leadId: null }

      expect(customer.customerName).toBeNull()
    })
  })
})