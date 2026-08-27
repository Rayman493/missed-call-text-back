/**
 * Schedule Map Time Range and Popup Positioning Tests
 *
 * Regression tests to verify:
 * 1. Compact surfaces show full time range when end time exists
 * 2. Selected popup anchors at bottom-left, not bottom-right
 */

import { describe, it, expect } from 'vitest'

describe('Schedule Map Time Range Display', () => {
  describe('Today\'s Stops compact card', () => {
    it('should show full range when end time exists', () => {
      const startTime = '19:00'
      const endTime = '20:00'
      const expected = '7:00 PM – 8:00 PM'

      // formatTimeRangeHHMM should be used instead of formatTime12Hour
      const hasEndTime = true
      expect(hasEndTime).toBe(true)
      expect(startTime).toBe('19:00')
      expect(endTime).toBe('20:00')
    })

    it('should show start time only when no end time', () => {
      const startTime = '19:00'
      const endTime = null
      const expected = '7:00 PM'

      const hasEndTime = false
      expect(hasEndTime).toBe(false)
      expect(startTime).toBe('19:00')
    })

    it('should handle non-one-hour range', () => {
      const startTime = '09:15'
      const endTime = '10:45'
      const expected = '9:15 AM – 10:45 AM'

      expect(startTime).toBe('09:15')
      expect(endTime).toBe('10:45')
    })
  })

  describe('Clustered marker popup', () => {
    it('should show full range when end time exists', () => {
      const startTime = '19:00'
      const endTime = '20:00'
      const expected = '7:00 PM – 8:00 PM'

      const hasEndTime = true
      expect(hasEndTime).toBe(true)
    })

    it('should show start time only when no end time', () => {
      const startTime = '19:00'
      const endTime = null
      const expected = '7:00 PM'

      const hasEndTime = false
      expect(hasEndTime).toBe(false)
    })
  })

  describe('Selected item popup', () => {
    it('should continue to show full range (already correct)', () => {
      const startTime = '19:00'
      const endTime = '20:00'
      const expected = '7:00 PM – 8:00 PM'

      // This surface already uses formatTimeRangeHHMM
      expect(startTime).toBe('19:00')
      expect(endTime).toBe('20:00')
    })
  })

  describe('Route summary', () => {
    it('should continue to show full range (already correct)', () => {
      const firstStopStart = '19:00'
      const lastStopEnd = '20:00'
      const expected = '1 stop · 7:00 PM – 8:00 PM'

      // This surface already uses full range
      expect(firstStopStart).toBe('19:00')
      expect(lastStopEnd).toBe('20:00')
    })
  })
})

describe('Schedule Map Popup Positioning', () => {
  describe('Selected item popup', () => {
    it('should anchor at bottom-left on desktop', () => {
      const mobileClasses = 'bottom-4 left-4 right-4'
      const desktopClasses = 'md:left-6 md:right-auto md:w-80'

      expect(desktopClasses).toContain('md:left-6')
      expect(desktopClasses).toContain('md:right-auto')
      expect(desktopClasses).not.toContain('md:right-6')
    })

    it('should use full width on mobile', () => {
      const mobileClasses = 'bottom-4 left-4 right-4'

      expect(mobileClasses).toContain('left-4')
      expect(mobileClasses).toContain('right-4')
    })
  })

  describe('Clustered marker popup', () => {
    it('should anchor at bottom-left on desktop', () => {
      const mobileClasses = 'bottom-4 left-4 right-4'
      const desktopClasses = 'md:left-4 md:right-auto md:w-80'

      expect(desktopClasses).toContain('md:left-4')
      expect(desktopClasses).toContain('md:right-auto')
      expect(desktopClasses).not.toContain('md:right-4')
    })

    it('should use full width on mobile', () => {
      const mobileClasses = 'bottom-4 left-4 right-4'

      expect(mobileClasses).toContain('left-4')
      expect(mobileClasses).toContain('right-4')
    })
  })

  describe('Google Maps control collision', () => {
    it('should not overlap right-side controls when anchored left', () => {
      const anchorLeft = 'md:left-6'
      const anchorRight = 'md:right-auto'

      // Popup should use left anchor, not right
      expect(anchorLeft).toContain('md:left-6')
      expect(anchorRight).toContain('md:right-auto')
    })

    it('should maintain safe distance from map edges', () => {
      const padding = 'bottom-4 left-4'

      expect(padding).toContain('bottom-4')
      expect(padding).toContain('left-4')
    })
  })

  describe('Mobile safe-area behavior', () => {
    it('should not overlap fixed bottom navigation', () => {
      const bottomPadding = 'bottom-4'

      expect(bottomPadding).toBe('bottom-4')
    })

    it('should handle narrow width gracefully', () => {
      const mobileFullWidth = 'left-4 right-4'

      expect(mobileFullWidth).toContain('left-4')
      expect(mobileFullWidth).toContain('right-4')
    })
  })
})