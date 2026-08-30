/**
 * Lead Status Gesture Detection
 *
 * Shared utility for distinguishing tap from scroll gestures on the status dropdown.
 * Used by both LeadStatusDropdown component and tests.
 */

/**
 * Canonical movement threshold for distinguishing tap from scroll
 * Movement > 10px in either X or Y direction is considered a scroll
 */
export const GESTURE_MOVEMENT_THRESHOLD = 10

/**
 * Determine if pointer movement should prevent menu activation
 *
 * @param startX - Initial pointer X coordinate
 * @param startY - Initial pointer Y coordinate
 * @param currentX - Current pointer X coordinate
 * @param currentY - Current pointer Y coordinate
 * @returns true if movement exceeds threshold (scroll gesture), false if within threshold (tap)
 */
export function shouldPreventMenuOpen(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  const deltaX = Math.abs(currentX - startX)
  const deltaY = Math.abs(currentY - startY)

  return deltaX > GESTURE_MOVEMENT_THRESHOLD || deltaY > GESTURE_MOVEMENT_THRESHOLD
}