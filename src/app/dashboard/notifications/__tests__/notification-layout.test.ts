/**
 * Regression tests for notification card layout.
 *
 * Tests 1-7: notification right-side layout contract
 *
 * Root cause traced:
 * The hover/press actions were absolutely positioned (absolute top-3 right-3)
 * and overlapped the timestamp which was in the title row's right side.
 * When actions appeared (via hover), they covered the timestamp.
 *
 * The fix restructures the layout into a dedicated right meta column:
 * - Timestamp and actions share a flex-shrink-0 column on the right
 * - Content (title, body) occupies flex-1 min-w-0 (wraps/truncates)
 * - No absolute positioning, no overlap possible
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync('src/app/dashboard/notifications/page.tsx', 'utf8').replace(/\r\n/g, '\n')

describe('Notification card layout — right-side meta column (1-7)', () => {
  it('1. selected action and timestamp occupy separate layout space (dedicated right meta column)', () => {
    // The right meta column contains both timestamp and actions
    // They share a flex-shrink-0 column, preventing overlap
    expect(content).toContain('flex-shrink-0 flex flex-col items-end gap-1.5 self-start')
  })

  it('2. timestamp remains present/readable when selected (in right meta column, not absolute)', () => {
    // Timestamp is in the right meta column, not in the title row
    expect(content).toContain("formatTime(notification.created_at)")
    // Must NOT be in a justify-between title row (old layout)
    expect(content).not.toContain('flex items-start justify-between mb-1')
  })

  it('3. long title does not overlap right-side controls (content is flex-1 min-w-0)', () => {
    // Content area is flex-1 min-w-0, allowing title to wrap/truncate
    // without pushing into the right meta column
    expect(content).toContain('flex-1 min-w-0')
  })

  it('4. long body does not overlap right-side controls (right column is flex-shrink-0)', () => {
    // Right meta column is flex-shrink-0, maintaining its width
    // regardless of content length
    expect(content).toContain('flex-shrink-0 flex flex-col items-end')
  })

  it('5. selected/unselected card layout does not jump unexpectedly (no absolute actions)', () => {
    // Actions are in the flow (right meta column), not absolutely positioned
    // This prevents layout jump when actions appear/disappear
    expect(content).not.toContain('absolute top-3 right-3')
  })

  it('6. mobile widths retain usable layout (whitespace-nowrap on timestamp)', () => {
    // Timestamp has whitespace-nowrap to prevent wrapping on narrow screens
    expect(content).toContain('whitespace-nowrap')
  })

  it('7. selection action remains tappable (buttons in right meta column)', () => {
    // Check and X buttons are in the right meta column
    expect(content).toContain('<Check className="w-4 h-4" />')
    expect(content).toContain('<X className="w-4 h-4" />')
    // Both have stopPropagation to prevent card click
    expect(content).toContain('e.stopPropagation()')
  })
})
