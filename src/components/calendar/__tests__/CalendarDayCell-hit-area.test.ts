/**
 * Regression tests for CalendarDayCell crowded-day hit area.
 *
 * Root cause:
 * On crowded days, event chips fill the cell, leaving only the small
 * date number (w-5 h-5 = 20px on mobile) as the day-selection target.
 * The rest of the cell background is covered by event chips, making
 * it nearly impossible to tap the day to select it.
 *
 * The fix:
 * - Enlarge the date number hit target (w-7 h-7 on mobile, w-8 h-8 on desktop)
 * - Add a transparent overlay (absolute inset-0 z-0) behind the event summary
 *   that captures day-selection taps on any non-event area
 * - Month cells now show a single compact event-count summary instead of
 *   individual stacked chips; tapping it opens the day detail view.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/components/calendar/CalendarDayCell.tsx', 'utf8')

describe('CalendarDayCell — crowded-day hit area', () => {
  it('date number hit target is enlarged (w-7 h-7 on mobile, w-8 h-8 on desktop)', () => {
    expect(content).toContain('w-7 h-7')
    expect(content).toContain('md:w-8 md:h-8')
    // The date number container is the enlarged hit target; the old 20px hit
    // target should not exist outside the today circle indicator.
    expect(content).not.toContain('className="w-5 h-5 md:w-6 md:h-6"')
  })

  it('transparent overlay fills the entire cell for day selection', () => {
    // The overlay is absolute inset-0 z-0, behind the event summary
    expect(content).toContain('absolute inset-0 z-0')
    expect(content).toContain('aria-hidden="true"')
  })

  it('date number is positioned above the overlay (z-10)', () => {
    expect(content).toContain('relative z-10')
  })

  it('event summary is positioned above the overlay (z-10)', () => {
    // The summary container must be z-10 so taps on it don't
    // reach the day-selection overlay
    expect(content).toMatch(/relative z-10 w-full flex flex-col/)
  })

  it('event summary stopPropagation to prevent day selection on summary tap', () => {
    expect(content).toContain('e.stopPropagation()')
  })

  it('month cell shows a compact event count summary instead of stacked titles', () => {
    expect(content).toContain('eventCountLabel')
    expect(content).not.toContain('+{overflowCount} more')
    expect(content).not.toContain('{event.summary}')
  })

  it('day cell has its own tap guard (dayGuard)', () => {
    expect(content).toContain('dayGuard.onPointerDown')
    expect(content).toContain('dayGuard.consumeDragSuppression()')
  })

  it('overlay does NOT stopPropagation (lets parent onClick handle day selection)', () => {
    // The overlay's onClick should NOT call stopPropagation — it lets
    // the event bubble to the parent's onClick for day selection.
    const overlayMatch = content.match(/absolute inset-0 z-0[\s\S]*?onClick=\{[\s\S]*?\}\}/)
    expect(overlayMatch).toBeTruthy()
    if (overlayMatch) {
      expect(overlayMatch[0]).not.toContain('stopPropagation')
    }
  })

  it('day cell has relative positioning for overlay', () => {
    expect(content).toContain('relative min-h-[48px]')
  })
})
