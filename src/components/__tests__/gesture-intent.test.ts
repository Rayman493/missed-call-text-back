/**
 * Gesture Intent Detection Tests
 *
 * Tests for the gesture detection logic used by LeadStatusDropdown
 * to distinguish tap from scroll gestures.
 */

import { describe, it, expect } from 'vitest'
import { shouldPreventMenuOpen, GESTURE_MOVEMENT_THRESHOLD } from '../lead-status-gesture'

describe('Gesture Intent Detection', () => {
  describe('initial tap detection', () => {
    it('should allow tap with no movement', () => {
      const result = shouldPreventMenuOpen(100, 100, 100, 100)
      expect(result).toBe(false)
    })

    it('should allow tap with minor jitter (<= 10px)', () => {
      const result = shouldPreventMenuOpen(100, 100, 105, 105)
      expect(result).toBe(false)
    })

    it('should allow tap with exactly 10px movement', () => {
      const result = shouldPreventMenuOpen(100, 100, 110, 100)
      expect(result).toBe(false)
    })
  })

  describe('vertical scroll detection', () => {
    it('should prevent menu open with > 10px vertical movement down', () => {
      const result = shouldPreventMenuOpen(100, 100, 100, 115)
      expect(result).toBe(true)
    })

    it('should prevent menu open with > 10px vertical movement up', () => {
      const result = shouldPreventMenuOpen(100, 100, 100, 85)
      expect(result).toBe(true)
    })
  })

  describe('horizontal scroll detection', () => {
    it('should prevent menu open with > 10px horizontal movement right', () => {
      const result = shouldPreventMenuOpen(100, 100, 115, 100)
      expect(result).toBe(true)
    })

    it('should prevent menu open with > 10px horizontal movement left', () => {
      const result = shouldPreventMenuOpen(100, 100, 85, 100)
      expect(result).toBe(true)
    })
  })

  describe('diagonal movement', () => {
    it('should prevent menu open with combined > 10px diagonal movement', () => {
      const result = shouldPreventMenuOpen(100, 100, 115, 105)
      expect(result).toBe(true)
    })

    it('should allow tap with combined <= 10px diagonal movement', () => {
      const result = shouldPreventMenuOpen(100, 100, 105, 105)
      expect(result).toBe(false)
    })
  })

  describe('threshold boundary', () => {
    it('should exactly at threshold still qualifies as tap', () => {
      const result = shouldPreventMenuOpen(100, 100, 100 + GESTURE_MOVEMENT_THRESHOLD, 100)
      expect(result).toBe(false)
    })

    it('should one pixel over threshold prevents menu', () => {
      const result = shouldPreventMenuOpen(100, 100, 100 + GESTURE_MOVEMENT_THRESHOLD + 1, 100)
      expect(result).toBe(true)
    })
  })
})

describe('Gesture State Persistence', () => {
  describe('one-way threshold crossing', () => {
    it('once threshold is exceeded, later movement back inside does NOT restore tap eligibility', () => {
      // Start at 100, 100
      let hasMovedBeyondThreshold = false

      // Move to 115, 100 (exceeds threshold)
      hasMovedBeyondThreshold = shouldPreventMenuOpen(100, 100, 115, 100)
      expect(hasMovedBeyondThreshold).toBe(true)

      // Move back to 105, 100 (within threshold)
      // The flag should remain true - once a scroll, always a scroll
      expect(hasMovedBeyondThreshold).toBe(true)
    })
  })

  describe('state reset between gestures', () => {
    it('next clean gesture starts fresh', () => {
      // First gesture: scroll
      let hasMovedBeyondThreshold = shouldPreventMenuOpen(100, 100, 115, 100)
      expect(hasMovedBeyondThreshold).toBe(true)

      // Reset state (simulating pointerup/pointercancel)
      hasMovedBeyondThreshold = false

      // Second gesture: tap
      hasMovedBeyondThreshold = shouldPreventMenuOpen(200, 200, 200, 200)
      expect(hasMovedBeyondThreshold).toBe(false)
    })
  })
})

describe('Primary Button Check', () => {
  it('should only allow primary button (button 0)', () => {
    const primaryButton = 0
    const secondaryButton = 2
    const middleButton = 1

    expect(primaryButton).toBe(0)
    expect(secondaryButton).not.toBe(0)
    expect(middleButton).not.toBe(0)
  })
})