'use client'

/**
 * React hook implementing the canonical tap-vs-drag gesture model.
 *
 * Uses pointer events (not touch events) for unified mouse/touch/pen handling.
 * State is stored in refs (synchronous) so it can be checked in onClick/onSelect
 * handlers without async state races.
 *
 * LIFECYCLE (one-shot, pointer-attributed suppression):
 *
 *   pointerdown  → start tracking, drag=false, released=false
 *   pointermove  → if movement > threshold, drag=true (DRAG)
 *   pointerup    → released=true (pointer released ON this element;
 *                  a click WILL follow)
 *   pointerleave → clears start position (stop tracking movement).
 *                  Does NOT clear drag or released — if the pointer was
 *                  already released (released=true), the click hasn't
 *                  consumed yet. If the pointer left without release
 *                  (released=false), consumeDragSuppression() will return
 *                  false because released is false.
 *   pointercancel → clears ALL state (no click follows a cancel)
 *   click/onSelect → call consumeDragSuppression():
 *                     - returns true ONLY if drag=true AND released=true
 *                     - resets BOTH flags to false (one-shot)
 *                     - next call returns false (no sticky suppression)
 *
 * INVARIANT: A drag decision belongs ONLY to the pointer gesture that
 * produced it. Suppression is attributed to pointer-originated activation
 * (pointerup on the element → click), not to unrelated future keyboard,
 * accessibility, or programmatic activation.
 *
 * EDGE CASES HANDLED:
 * - drag → pointerleave → pointerup OUTSIDE → no click → later keyboard:
 *   released stays false → consumeDragSuppression() returns false → ALLOWED
 * - drag → pointerleave → pointerenter → pointerup → click:
 *   released set to true by pointerup → consumeDragSuppression() returns true → SUPPRESSED
 * - drag → pointercancel → keyboard: all state cleared → ALLOWED
 * - normal drag → pointerup → click: drag=true, released=true → SUPPRESSED
 * - normal tap → pointerup → click: drag=false → ALLOWED
 *
 * Usage pattern:
 *   const guard = useTapGuard()
 *   <div
 *     onPointerDown={guard.onPointerDown}
 *     onPointerMove={guard.onPointerMove}
 *     onPointerUp={guard.onPointerUp}
 *     onPointerCancel={guard.onPointerCancel}
 *     onPointerLeave={guard.onPointerLeave}
 *     onClick={() => {
 *       if (guard.consumeDragSuppression()) return  // one-shot suppress
 *       doAction()
 *     }}
 *   >
 *
 * Desktop preservation: on mouse, pointer down/move/up fire the same way.
 * A mouse click without movement is a tap (action fires). A mouse drag
 * exceeding 10px suppresses the click (once). Keyboard activation bypasses
 * pointer handlers entirely — no pointerup fires, so released stays false,
 * and consumeDragSuppression() returns false. Accessibility is preserved.
 */

import { useRef, useCallback } from 'react'
import { isDragGesture } from './tap-guard'

export interface TapGuardResult {
  /** Bind to element's onPointerDown. Records start position, resets state. */
  onPointerDown: (e: React.PointerEvent) => void
  /** Bind to element's onPointerMove. Sets drag flag if threshold exceeded. */
  onPointerMove: (e: React.PointerEvent) => void
  /** Bind to element's onPointerUp. Marks pointer released on this element. */
  onPointerUp: () => void
  /** Bind to element's onPointerCancel. Resets all state. */
  onPointerCancel: () => void
  /** Bind to element's onPointerLeave. Clears start position (stops tracking). */
  onPointerLeave: () => void
  /**
   * ONE-SHOT suppression check. Call in onClick/onSelect.
   * Returns true ONLY if the just-completed pointer gesture was a drag AND
   * the pointer was released on this element (proving it's a pointer-originated
   * click, not a keyboard/programmatic activation). Resets BOTH flags.
   * Returns false if no drag occurred, pointer wasn't released here, or
   * suppression was already consumed.
   */
  consumeDragSuppression: () => boolean
  /**
   * Read-only drag state for use DURING the gesture (e.g., CSS toggling).
   * Does NOT consume or reset the flag. Use consumeDragSuppression() for
   * click/select gating.
   */
  isDragging: () => boolean
}

export function useTapGuard(): TapGuardResult {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const draggingRef = useRef(false)
  // Tracks whether the pointer was released (pointerup) on this element.
  // A click that follows pointerup is a pointer-originated click.
  // Keyboard/programmatic activation has no preceding pointerup, so this
  // stays false and consumeDragSuppression() returns false.
  const releasedRef = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only track primary button (left click / touch / pen primary)
    if (e.button !== 0) return
    startRef.current = { x: e.clientX, y: e.clientY }
    // Reset all state for the new gesture
    draggingRef.current = false
    releasedRef.current = false
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startRef.current) return
    if (isDragGesture(startRef.current.x, startRef.current.y, e.clientX, e.clientY)) {
      draggingRef.current = true
    }
  }, [])

  const onPointerUp = useCallback(() => {
    // Pointer was released on this element. A click WILL follow.
    // This distinguishes pointer-originated clicks from keyboard/programmatic
    // activation (which has no preceding pointerup).
    releasedRef.current = true
  }, [])

  const onPointerCancel = useCallback(() => {
    // pointercancel means no click will follow. Clear all state so a
    // later keyboard/programmatic activation is not suppressed.
    startRef.current = null
    draggingRef.current = false
    releasedRef.current = false
  }, [])

  const onPointerLeave = useCallback(() => {
    // Pointer left the element. Stop tracking movement.
    // Do NOT clear drag or released flags:
    // - If released=true (pointerup already happened), the click hasn't
    //   consumed yet — it needs the drag flag.
    // - If released=false (pointerup hasn't happened), the pointer was
    //   released outside — no click will fire on this element, and
    //   consumeDragSuppression() will return false because released is false.
    startRef.current = null
  }, [])

  const consumeDragSuppression = useCallback(() => {
    // ONE-SHOT: suppress ONLY if this was a pointer-originated drag click.
    // - draggingRef=true AND releasedRef=true: pointer drag → pointerup → click
    // - draggingRef=true AND releasedRef=false: abandoned drag (pointer left,
    //   released outside, or pointercancel) → NOT a pointer click → don't suppress
    // - draggingRef=false: no drag → tap or keyboard → don't suppress
    const wasDrag = draggingRef.current
    const wasReleased = releasedRef.current
    // Always reset both flags (one-shot + cleanup stale state from abandoned drags)
    draggingRef.current = false
    releasedRef.current = false
    return wasDrag && wasReleased
  }, [])

  const isDragging = useCallback(() => draggingRef.current, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave, consumeDragSuppression, isDragging }
}
