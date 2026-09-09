/**
 * Schedule Map Layout Test
 *
 * Tests that stop summary and filter share the same row
 * for consistent alignment across mobile and desktop.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

describe('ScheduleMap - Layout Structure', () => {
  const content = readFileSync('src/components/schedule/ScheduleMap.tsx', 'utf8')

  describe('Mobile Layout', () => {
    it('should have combined row for stop preview and filter', () => {
      // Mobile combined row should have both stop preview and filter in same flex container
      expect(content).toMatch(/md:hidden mb-1 z-10[\s\S]*flex items-center gap-2/)
    })

    it('should have stop preview on left with flex-1', () => {
      expect(content).toContain('flex-1 min-w-0')
    })

    it('should have filter on right with flex-shrink-0', () => {
      expect(content).toContain('flex-shrink-0')
    })

    it('should use same row for no-stops state', () => {
      // No stops state should also use combined row
      expect(content).toMatch(/No mapped stops[\s\S]*flex-shrink-0/)
    })
  })

  describe('Desktop Layout', () => {
    it('should have combined row for stop preview and filter', () => {
      // Desktop combined row
      expect(content).toMatch(/hidden md:flex mb-1 z-10 items-center gap-3/)
    })

    it('should have stop previews on left with flex-1', () => {
      expect(content).toContain('flex-1')
    })

    it('should have filter on right with flex-shrink-0', () => {
      expect(content).toContain('flex-shrink-0')
    })

    it('should use same row structure for no-stops state', () => {
      // No stops state should also use items-center gap-3
      expect(content).toMatch(/hidden md:flex mb-1 z-10 items-center gap-3[\s\S]*No mapped stops/)
    })
  })

  describe('Layout Consistency', () => {
    it('should not have separate mobile filter row below stop previews', () => {
      // Should not have the old separate filter row
      const oldPattern = /Mobile: Filter row below stop previews/
      expect(content).not.toMatch(oldPattern)
    })

    it('should not use absolute positioning for no-stops text', () => {
      // Should not use absolute inset-0 for no-stops
      const absolutePattern = /absolute inset-0.*No mapped stops/
      expect(content).not.toMatch(absolutePattern)
    })
  })

  describe('Filter-Layout Stability (Batch 7)', () => {
    it('should reserve a deterministic min-height on the desktop populated branch', () => {
      // Prevents vertical map shift when switching All/Jobs/Appointments
      expect(content).toMatch(/hidden md:flex mb-1 z-10 items-center gap-3 min-h-\[48px\]/)
    })

    it('should reserve a deterministic min-height on the desktop empty branch', () => {
      expect(content).toMatch(/hidden md:flex mb-1 z-10 items-center gap-3 min-h-\[48px\][\s\S]*No mapped stops/)
    })

    it('should reserve a deterministic min-height on the mobile populated branch', () => {
      expect(content).toMatch(/md:hidden mb-1 z-10[\s\S]*flex items-center gap-2 min-h-\[44px\]/)
    })

    it('should reserve a deterministic min-height on the mobile empty branch', () => {
      expect(content).toMatch(/flex items-center justify-between gap-2 min-h-\[44px\][\s\S]*No mapped stops/)
    })

    it('should add pb-2 to the empty-state paragraph to match populated branch height', () => {
      expect(content).toMatch(/No mapped stops[\s\S]*pb-2/)
    })

    it('should not use giant spacers or transforms for layout stability', () => {
      expect(content).not.toMatch(/h-\[100px\].*No mapped stops/)
      expect(content).not.toMatch(/translate-y.*No mapped stops/)
    })
  })
})