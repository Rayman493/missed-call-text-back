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

/**
 * Whole-pointer-sequence dismissal ownership.
 *
 * ARCHITECTURE:
 *
 * When an open dropdown is dismissed by an outside interaction, the ENTIRE
 * pointer sequence that caused the dismissal is "consumed". No underlying
 * control may activate from that same sequence — whether it activates on
 * pointerup, click, or any other pointer-driven event.
 *
 * This is a ONE-SHOT, EVENT-SCOPED gesture token with NO timer:
 *
 * 1. onPointerDownOutside / onInteractOutside → markDropdownDismissed()
 *    Sets `consumedByDismissal = true`. The dropdown closes.
 *
 * 2. The same pointer sequence continues: pointerup → click.
 *    Document capture-phase listeners intercept BOTH:
 *    - pointerup: stopPropagation (prevents element-level onPointerUp)
 *    - click: stopPropagation (prevents element-level onClick)
 *    The click listener also clears the flag (sequence complete).
 *
 * 3. pointercancel: clears the flag (no click follows pointercancel).
 *
 * 4. The next pointerdown (anywhere) clears stale flags via a capture-phase
 *    document listener that fires BEFORE Radix's bubble-phase pointerdown
 *    listener. This ensures stale flags are cleared before any new
 *    interaction. If the new pointerdown is itself an outside tap on an
 *    open dropdown, Radix will set a fresh flag via onPointerDownOutside
 *    after this clear runs.
 *
 * 5. The next deliberate tap's pointerup/click proceeds normally — no timer,
 *    no artificial delay, no per-control special cases.
 *
 * This handles ALL underlying controls universally: customer cards,
 * filter buttons, add buttons, other status triggers, MetricCards with
 * pointerup activation, and any other interactive element. No per-control
 * special cases are needed.
 *
 * No timer is used. Suppression is scoped to the single pointer sequence
 * that caused the dismissal.
 */

let consumedByDismissal = false

/**
 * Mark that a dropdown was just dismissed via an outside interaction.
 * Should be called from onPointerDownOutside / onInteractOutside handlers.
 */
export function markDropdownDismissed(): void {
  consumedByDismissal = true
}

/**
 * Check whether the current pointer sequence is consumed by a dropdown
 * dismissal. Controls that activate on pointerup or click can call this
 * to determine whether their activation should be suppressed.
 *
 * With the document-level capture-phase listeners, most controls do NOT
 * need to call this — the listeners suppress pointerup and click
 * universally. This helper is exposed for controls with non-standard
 * activation paths.
 */
export function isPointerSequenceConsumed(): boolean {
  return consumedByDismissal
}

/**
 * Backward-compat alias for isPointerSequenceConsumed.
 * @deprecated Use isPointerSequenceConsumed instead.
 */
export { isPointerSequenceConsumed as wasDropdownDismissedThisSequence }

/**
 * Clear the dismissal flag manually.
 * Normally not needed — the document listeners clear it automatically
 * on pointerdown, pointercancel, and click completion.
 */
export function clearDropdownDismissal(): void {
  consumedByDismissal = false
}

// ============================================================
// Document-level listeners (registered once at module load)
// ============================================================
//
// All listeners are registered in the CAPTURE phase so they fire BEFORE
// any element-level handlers and BEFORE Radix's bubble-phase listeners.
//
// stopPropagation (not stopImmediatePropagation) is used so other
// document-level capture listeners registered before ours still run.

if (typeof document !== 'undefined') {
  // Capture-phase pointerdown: clears stale flags BEFORE Radix's
  // bubble-phase pointerdown listener runs. This ensures that any
  // unconsumed dismissal flag from a previous pointer sequence is
  // cleared before a new interaction begins. If the new pointerdown
  // is itself an outside tap on an open dropdown, Radix will set a
  // fresh flag via onPointerDownOutside after this clear runs.
  document.addEventListener(
    'pointerdown',
    () => {
      consumedByDismissal = false
    },
    true // capture phase
  )

  // Capture-phase pointerup: when a dropdown was just dismissed by an
  // outside tap, the same pointer sequence's pointerup would activate
  // controls that open on pointerup (LeadStatusDropdown trigger,
  // Filter button, MetricCard via useMobilePressGuard). This listener
  // stops propagation so NO element-level onPointerUp fires.
  // The flag is NOT cleared here — the click may follow and must also
  // be suppressed.
  document.addEventListener(
    'pointerup',
    (e) => {
      if (consumedByDismissal) {
        e.stopPropagation()
      }
    },
    true // capture phase
  )

  // Capture-phase pointercancel: the browser cancels the pointer
  // (e.g., scroll takeover). No click follows pointercancel, so the
  // flag can be safely cleared.
  document.addEventListener(
    'pointercancel',
    () => {
      consumedByDismissal = false
    },
    true // capture phase
  )

  // Capture-phase click: when a dropdown was just dismissed by an
  // outside tap, the same pointer sequence's click would activate
  // controls that open on click (LeadCard, Add Customer button, links).
  // This listener stops propagation so NO element-level onClick fires,
  // then clears the flag — the pointer sequence is now complete.
  document.addEventListener(
    'click',
    (e) => {
      if (consumedByDismissal) {
        e.stopPropagation()
        consumedByDismissal = false
      }
    },
    true // capture phase
  )
}
