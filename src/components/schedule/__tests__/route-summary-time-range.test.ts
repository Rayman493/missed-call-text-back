/**
 * Route Summary Time Range Tests
 * 
 * Tests for the Schedule map route summary time range formatting.
 * Specifically tests that the end time is used for the range, not the start time duplicated.
 */

import { describe, it, expect } from 'vitest'

// Simulate the formatTime12Hour function from calendar-date-utils
function formatTime12Hour(timeStr: string | null): string {
  if (!timeStr) return ''
  const [hours, minutes] = timeStr.split(':').slice(0, 2)
  const hour = parseInt(hours, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const hour12 = hour % 12 || 12
  return `${hour12}:${minutes} ${ampm}`
}

// Simulate the route summary calculation from ScheduleMap
function calculateRouteSummary(items: Array<{ scheduledTime: string | null; scheduledEndTime: string | null }>): string {
  const mappedStopsCount = items.length
  if (mappedStopsCount === 0) {
    return 'No mapped stops'
  }
  
  const firstStop = items[0]
  const lastStop = items[items.length - 1]
  
  if (firstStop?.scheduledTime && lastStop?.scheduledEndTime) {
    return `${mappedStopsCount} stop${mappedStopsCount > 1 ? 's' : ''} · ${formatTime12Hour(firstStop.scheduledTime)} – ${formatTime12Hour(lastStop.scheduledEndTime)}`
  } else if (firstStop?.scheduledTime) {
    return `${mappedStopsCount} stop${mappedStopsCount > 1 ? 's' : ''} · ${formatTime12Hour(firstStop.scheduledTime)}`
  } else {
    return `${mappedStopsCount} stop${mappedStopsCount > 1 ? 's' : ''}`
  }
}

describe('Route Summary Time Range', () => {
  describe('Normal one-hour appointment', () => {
    it('should display correct start and end times', () => {
      const items = [
        { scheduledTime: '19:00', scheduledEndTime: '20:00' }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('1 stop · 7:00 PM – 8:00 PM')
    })
  })

  describe('Non-one-hour appointment', () => {
    it('should respect actual end time not start time duplication', () => {
      const items = [
        { scheduledTime: '09:15', scheduledEndTime: '10:45' }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('1 stop · 9:15 AM – 10:45 AM')
      expect(summary).not.toContain('9:15 AM – 9:15 AM')
    })
  })

  describe('AM/PM boundary', () => {
    it('should correctly format times crossing noon', () => {
      const items = [
        { scheduledTime: '11:30', scheduledEndTime: '12:30' }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('1 stop · 11:30 AM – 12:30 PM')
    })
  })

  describe('Multiple stops', () => {
    it('should show first start and last end times', () => {
      const items = [
        { scheduledTime: '09:00', scheduledEndTime: '10:00' },
        { scheduledTime: '14:00', scheduledEndTime: '15:30' }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('2 stops · 9:00 AM – 3:30 PM')
    })
  })

  describe('Job without end time', () => {
    it('should fall back to start time only when end time is not available', () => {
      const items = [
        { scheduledTime: '14:00', scheduledEndTime: null }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('1 stop · 2:00 PM')
    })
  })

  describe('Production example: Overwatch Lessons', () => {
    it('should match the expected output for the production bug case', () => {
      const items = [
        { scheduledTime: '19:00', scheduledEndTime: '20:00' }
      ]
      const summary = calculateRouteSummary(items)
      // Before fix: would have been "1 stop · 7:00 PM – 7:00 PM"
      // After fix: should be "1 stop · 7:00 PM – 8:00 PM"
      expect(summary).toBe('1 stop · 7:00 PM – 8:00 PM')
      expect(summary).not.toContain('7:00 PM – 7:00 PM')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty items array', () => {
      const items: Array<{ scheduledTime: string | null; scheduledEndTime: string | null }> = []
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('No mapped stops')
    })

    it('should handle missing scheduled time', () => {
      const items = [
        { scheduledTime: null, scheduledEndTime: '20:00' }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('1 stop')
    })

    it('should handle both missing times', () => {
      const items = [
        { scheduledTime: null, scheduledEndTime: null }
      ]
      const summary = calculateRouteSummary(items)
      expect(summary).toBe('1 stop')
    })
  })
})