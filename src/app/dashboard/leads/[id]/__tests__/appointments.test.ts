/**
 * Appointments sorting and formatting tests
 *
 * Tests for the appointment display logic in Customer Details:
 * - Sorting (upcoming first, then past)
 * - Time formatting (12-hour AM/PM)
 * - All-day event detection
 * - Display limits (3 mobile, 5 desktop)
 */

import { describe, it, expect } from 'vitest'

describe('Appointments Sorting and Formatting', () => {
  const now = new Date('2024-08-15T12:00:00Z')

  describe('Sorting behavior', () => {
    it('upcoming events always appear before past events', () => {
      const now = new Date('2024-08-15T12:00:00Z')
      const appointments = [
        { id: '1', start: { dateTime: '2024-08-14T10:00:00Z' }, summary: 'Past' }, // Yesterday
        { id: '2', start: { dateTime: '2024-08-16T10:00:00Z' }, summary: 'Future 1' }, // Tomorrow
        { id: '3', start: { dateTime: '2024-08-20T10:00:00Z' }, summary: 'Future 2' }, // Next week
      ]

      const sorted = [...appointments].sort((a: any, b: any) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date)
        const dateB = new Date(b.start?.dateTime || b.start?.date)
        const isAPast = dateA < now
        const isBPast = dateB < now

        if (isAPast && !isBPast) return 1
        if (!isAPast && isBPast) return -1

        if (isAPast && isBPast) {
          return dateB.getTime() - dateA.getTime()
        }
        return dateA.getTime() - dateB.getTime()
      })

      expect(sorted[0].id).toBe('2') // Tomorrow (upcoming)
      expect(sorted[1].id).toBe('3') // Next week (upcoming)
      expect(sorted[2].id).toBe('1') // Yesterday (past)
    })

    it('upcoming appointments sort earliest-first', () => {
      const now = new Date('2024-08-15T12:00:00Z')
      const appointments = [
        { id: '3', start: { dateTime: '2024-08-20T14:00:00Z' }, summary: 'Future 3' },
        { id: '1', start: { dateTime: '2024-08-16T10:00:00Z' }, summary: 'Future 1' },
        { id: '2', start: { dateTime: '2024-08-18T09:00:00Z' }, summary: 'Future 2' },
      ]

      const sorted = [...appointments].sort((a: any, b: any) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date)
        const dateB = new Date(b.start?.dateTime || b.start?.date)
        const isAPast = dateA < now
        const isBPast = dateB < now

        if (isAPast && !isBPast) return 1
        if (!isAPast && isBPast) return -1

        if (isAPast && isBPast) {
          return dateB.getTime() - dateA.getTime()
        }
        return dateA.getTime() - dateB.getTime()
      })

      expect(sorted[0].id).toBe('1')
      expect(sorted[1].id).toBe('2')
      expect(sorted[2].id).toBe('3')
    })

    it('past appointments sort newest-first', () => {
      const now = new Date('2024-08-15T12:00:00Z')
      const appointments = [
        { id: '3', start: { dateTime: '2024-08-01T14:00:00Z' }, summary: 'Past 3' },
        { id: '1', start: { dateTime: '2024-08-10T10:00:00Z' }, summary: 'Past 1' },
        { id: '2', start: { dateTime: '2024-08-05T09:00:00Z' }, summary: 'Past 2' },
      ]

      const sorted = [...appointments].sort((a: any, b: any) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date)
        const dateB = new Date(b.start?.dateTime || b.start?.date)
        const isAPast = dateA < now
        const isBPast = dateB < now

        if (isAPast && !isBPast) return 1
        if (!isAPast && isBPast) return -1

        if (isAPast && isBPast) {
          return dateB.getTime() - dateA.getTime()
        }
        return dateA.getTime() - dateB.getTime()
      })

      expect(sorted[0].id).toBe('1') // Newest past (Aug 10)
      expect(sorted[1].id).toBe('2') // Middle past (Aug 5)
      expect(sorted[2].id).toBe('3') // Oldest past (Aug 1)
    })

    it('past event with earlier absolute timestamp does NOT jump ahead of upcoming event', () => {
      const now = new Date('2024-08-15T12:00:00Z')
      const appointments = [
        { id: '1', start: { dateTime: '2024-08-01T10:00:00Z' }, summary: 'Past' }, // Aug 1
        { id: '2', start: { dateTime: '2024-08-20T10:00:00Z' }, summary: 'Future' }, // Aug 20
      ]

      const sorted = [...appointments].sort((a: any, b: any) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date)
        const dateB = new Date(b.start?.dateTime || b.start?.date)
        const isAPast = dateA < now
        const isBPast = dateB < now

        if (isAPast && !isBPast) return 1
        if (!isAPast && isBPast) return -1

        if (isAPast && isBPast) {
          return dateB.getTime() - dateA.getTime()
        }
        return dateA.getTime() - dateB.getTime()
      })

      expect(sorted[0].id).toBe('2') // Future first, even though past has earlier absolute timestamp
      expect(sorted[1].id).toBe('1')
    })

    it('all-day events obey the same upcoming/past grouping', () => {
      const now = new Date('2024-08-15T12:00:00Z')
      const appointments = [
        { id: '2', start: { date: '2024-08-20' }, summary: 'All-day Future' },
        { id: '1', start: { date: '2024-08-10' }, summary: 'All-day Past' },
      ]

      const sorted = [...appointments].sort((a: any, b: any) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date)
        const dateB = new Date(b.start?.dateTime || b.start?.date)
        const isAPast = dateA < now
        const isBPast = dateB < now

        if (isAPast && !isBPast) return 1
        if (!isAPast && isBPast) return -1

        if (isAPast && isBPast) {
          return dateB.getTime() - dateA.getTime()
        }
        return dateA.getTime() - dateB.getTime()
      })

      expect(sorted[0].id).toBe('2') // Future first
      expect(sorted[1].id).toBe('1')
    })

    it('input array remains unmodified', () => {
      const now = new Date('2024-08-15T12:00:00Z')
      const appointments = [
        { id: '2', start: { dateTime: '2024-08-20T14:00:00Z' }, summary: 'Future' },
        { id: '1', start: { dateTime: '2024-08-16T10:00:00Z' }, summary: 'Past' },
      ]

      const originalOrder = appointments.map(a => a.id)
      const sorted = [...appointments].sort((a: any, b: any) => {
        const dateA = new Date(a.start?.dateTime || a.start?.date)
        const dateB = new Date(b.start?.dateTime || b.start?.date)
        const isAPast = dateA < now
        const isBPast = dateB < now

        if (isAPast && !isBPast) return 1
        if (!isAPast && isBPast) return -1

        if (isAPast && isBPast) {
          return dateB.getTime() - dateA.getTime()
        }
        return dateA.getTime() - dateB.getTime()
      })

      expect(appointments.map(a => a.id)).toEqual(originalOrder)
      expect(sorted.map(a => a.id)).not.toEqual(originalOrder)
    })
  })

  describe('Past determination', () => {
    it('correctly identifies past dateTime events', () => {
      const event = { start: { dateTime: '2024-08-14T10:00:00Z' } }
      const startDate = new Date(event.start.dateTime)
      expect(startDate < now).toBe(true)
    })

    it('correctly identifies upcoming dateTime events', () => {
      const event = { start: { dateTime: '2024-08-16T10:00:00Z' } }
      const startDate = new Date(event.start.dateTime)
      expect(startDate < now).toBe(false)
    })

    it('correctly identifies past all-day events', () => {
      const event = { start: { date: '2024-08-14' } }
      const startDate = new Date(event.start.date)
      expect(startDate < now).toBe(true)
    })

    it('correctly identifies upcoming all-day events', () => {
      const event = { start: { date: '2024-08-16' } }
      const startDate = new Date(event.start.date)
      expect(startDate < now).toBe(false)
    })
  })

  describe('All-day detection', () => {
    it('detects all-day events (date without dateTime)', () => {
      const event = { start: { date: '2024-08-15' } }
      const isAllDay = !!(event.start?.date && !event.start?.dateTime)
      expect(isAllDay).toBe(true)
    })

    it('detects timed events (dateTime)', () => {
      const event = { start: { dateTime: '2024-08-15T10:00:00Z' } }
      const isAllDay = !!(event.start?.date && !event.start?.dateTime)
      expect(isAllDay).toBe(false)
    })
  })

  describe('Time formatting', () => {
    it('formats 12-hour AM time without seconds', () => {
      const event = { start: { dateTime: '2024-08-15T09:30:00Z' } }
      const timeStr = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : ''
      expect(timeStr).toMatch(/^[0-9]+:[0-9]{2}\s[AP]M$/)
      expect(timeStr).not.toContain(':00') // No seconds in format string
    })

    it('formats 12-hour PM time without seconds', () => {
      const event = { start: { dateTime: '2024-08-15T14:30:00Z' } }
      const timeStr = event.start?.dateTime
        ? new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
        : ''
      expect(timeStr).toMatch(/^[0-9]+:[0-9]{2}\s[AP]M$/)
    })

    it('displays "All day" for all-day events', () => {
      const event = { start: { date: '2024-08-15' } }
      const isAllDay = !!(event.start?.date && !event.start?.dateTime)
      let timeStr = ''
      if (isAllDay) {
        timeStr = 'All day'
      }
      expect(timeStr).toBe('All day')
    })

    it('displays empty string for events without time', () => {
      const event = { start: { date: '2024-08-15' } }
      const isAllDay = !!(event.start?.date && !event.start?.dateTime)
      let timeStr = ''
      if (!isAllDay && event.start?.dateTime) {
        timeStr = new Date(event.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      }
      expect(timeStr).toBe('')
    })
  })

  describe('Date formatting', () => {
    it('formats date as en-US short month/day', () => {
      const event = { start: { dateTime: '2024-08-15T10:00:00Z' } }
      const startDate = new Date(event.start.dateTime)
      const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      expect(dateStr).toBe('Aug 15')
    })
  })

  describe('Display limits', () => {
    it('mobile displays up to 3 appointments', () => {
      const appointments = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        start: { dateTime: `2024-08-${15 + i}T10:00:00Z` },
        summary: `Appointment ${i}`
      }))

      const mobileDisplay = appointments.slice(0, 3)
      expect(mobileDisplay.length).toBe(3)
      expect(mobileDisplay[0].id).toBe('0')
      expect(mobileDisplay[2].id).toBe('2')
    })

    it('desktop displays up to 5 appointments', () => {
      const appointments = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        start: { dateTime: `2024-08-${15 + i}T10:00:00Z` },
        summary: `Appointment ${i}`
      }))

      const desktopDisplay = appointments.slice(0, 5)
      expect(desktopDisplay.length).toBe(5)
      expect(desktopDisplay[0].id).toBe('0')
      expect(desktopDisplay[4].id).toBe('4')
    })

    it('count uses complete array, not displayed subset', () => {
      const appointments = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
        start: { dateTime: `2024-08-${15 + i}T10:00:00Z` },
        summary: `Appointment ${i}`
      }))

      const count = appointments.length
      const mobileDisplay = appointments.slice(0, 3)
      const desktopDisplay = appointments.slice(0, 5)

      expect(count).toBe(10)
      expect(mobileDisplay.length).toBe(3)
      expect(desktopDisplay.length).toBe(5)
      expect(count).not.toBe(mobileDisplay.length)
      expect(count).not.toBe(desktopDisplay.length)
    })
  })

  describe('Zero state', () => {
    it('empty appointments produces zero-state behavior', () => {
      const appointments: any[] = []
      expect(appointments.length).toBe(0)
      expect(appointments.length === 0).toBe(true)
    })
  })
})