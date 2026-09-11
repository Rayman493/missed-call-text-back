/**
 * Canonical tap-vs-drag gesture model.
 *
 * Single source of truth for the 10px movement threshold and the drag
 * predicate used across all mobile interaction surfaces:
 * - Dashboard charts (ChartTouchWrapper)
 * - Agenda summary cards
 * - Customer status filter
 * - Calendar day/event cells
 *
 * Semantics:
 * - pointer/touch down: record start X/Y, gesture is TAP
 * - movement: once distance exceeds threshold in ANY direction, gesture
 *   becomes DRAG and stays DRAG for the remainder of the gesture
 * - release: if gesture remained TAP, allow exactly one intended action;
 *   if it became DRAG, suppress activation completely
 *
 * No arbitrary timing windows. No preventDefault on normal scrolling.
 */

/**
 * Canonical movement threshold (px). Movement > 10px in either X or Y
 * direction classifies the gesture as a drag/scroll.
 */
export const GESTURE_MOVEMENT_THRESHOLD = 10

/**
 * Determine if pointer movement between two points exceeds the canonical
 * threshold, classifying the gesture as a drag rather than a tap.
 *
 * @returns true if movement exceeds threshold (drag/scroll), false if within threshold (tap)
 */
export function isDragGesture(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): boolean {
  const deltaX = Math.abs(currentX - startX)
  const deltaY = Math.abs(currentY - startY)
  return deltaX > GESTURE_MOVEMENT_THRESHOLD || deltaY > GESTURE_MOVEMENT_THRESHOLD
}
