/**
 * Lead Status Gesture Detection
 *
 * Shared utility for distinguishing tap from scroll gestures on the status dropdown.
 * Used by both LeadStatusDropdown component and tests.
 *
 * NOTE: The canonical gesture model now lives in @/lib/gesture/tap-guard.
 * This module re-exports the canonical constants/functions for backward
 * compatibility with existing imports.
 */

export { GESTURE_MOVEMENT_THRESHOLD, isDragGesture } from '@/lib/gesture/tap-guard'

/**
 * Determine if pointer movement should prevent menu activation
 *
 * @param startX - Initial pointer X coordinate
 * @param startY - Initial pointer Y coordinate
 * @param currentX - Current pointer X coordinate
 * @param currentY - Current pointer Y coordinate
 * @returns true if movement exceeds threshold (scroll gesture), false if within threshold (tap)
 *
 * @deprecated Use isDragGesture from @/lib/gesture/tap-guard instead.
 *             The semantics are identical; this alias preserves existing imports.
 */
export { isDragGesture as shouldPreventMenuOpen } from '@/lib/gesture/tap-guard'
