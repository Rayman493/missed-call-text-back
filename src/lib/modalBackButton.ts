/**
 * Modal back button state management
 * 
 * This module manages the stack of open modals for Android back button handling.
 * It can be imported by both client components (via the hook) and the global
 * Capacitor init handler to coordinate back button behavior.
 */

// Module-level stack of active modal close callbacks
const modalStack: Array<() => void> = []

// Module-level stack of transient non-modal overlays (dropdowns, popovers)
// that should consume the hardware back button but do NOT push browser history.
const transientOverlayStack: Array<() => void> = []

/**
 * One-shot suppression flag for navigation-driven modal closes.
 *
 * When a modal is closed programmatically in order to navigate (e.g.,
 * "View Customer" inside PaymentEditModal), the modal's useModalBackButton
 * cleanup must NOT call history.back() to remove the synthetic history
 * entry, because that would race with the pending router.push/replace.
 *
 * The caller sets this flag BEFORE calling onClose(), and the modal
 * cleanup consumes it (one-shot) to skip the history.back() call.
 *
 * The synthetic history entry is left in place; the subsequent
 * router.push() layers the new route on top of it. Since the synthetic
 * entry was pushed with the current URL (empty string arg to
 * pushState), it has the same URL as the page the user was on, so
 * pressing Back from the destination lands on the original page —
 * the phantom entry is invisible to the user.
 */
let suppressHistoryBackCleanupOnce = false

/**
 * Set the one-shot suppression flag. The next modal cleanup that would
 * call history.back() will skip it and clear the flag instead.
 */
export function suppressNextHistoryBackCleanup(): void {
  suppressHistoryBackCleanupOnce = true
}

/**
 * Consume the one-shot suppression flag. Returns true if the flag was
 * set (meaning history.back() should be skipped), false otherwise.
 * Always clears the flag regardless of return value.
 */
export function consumeHistoryBackSuppression(): boolean {
  const wasSuppressed = suppressHistoryBackCleanupOnce
  suppressHistoryBackCleanupOnce = false
  return wasSuppressed
}

/**
 * Register a modal close callback at the top of the stack
 */
export function registerModal(onClose: () => void) {
  modalStack.push(onClose)
}

/**
 * Remove a modal close callback from the stack
 */
export function unregisterModal(onClose: () => void) {
  const index = modalStack.indexOf(onClose)
  if (index !== -1) {
    modalStack.splice(index, 1)
  }
}

/**
 * Register a transient overlay close callback at the top of its stack.
 * Transient overlays (dropdowns, popovers) consume the hardware back button
 * without pushing browser history.
 */
export function registerTransientOverlay(onClose: () => void) {
  transientOverlayStack.push(onClose)
}

/**
 * Remove a transient overlay close callback from the stack.
 */
export function unregisterTransientOverlay(onClose: () => void) {
  const index = transientOverlayStack.indexOf(onClose)
  if (index !== -1) {
    transientOverlayStack.splice(index, 1)
  }
}

/**
 * Check if any transient overlay is open.
 */
export function hasOpenTransientOverlay(): boolean {
  return transientOverlayStack.length > 0
}

/**
 * Handle Capacitor backButton by closing the topmost transient overlay.
 * Returns true if an overlay was closed, false otherwise.
 */
export function handleTransientOverlayBackButton(): boolean {
  const topOverlay = transientOverlayStack[transientOverlayStack.length - 1]
  if (topOverlay) {
    topOverlay()
    return true
  }
  return false
}

/**
 * Check if there are any open modals
 * Used by global Capacitor back handler to prevent navigation while modal is open
 */
export function hasOpenModal(): boolean {
  return modalStack.length > 0
}

/**
 * Handle Capacitor backButton by closing the topmost modal
 * Returns true if a modal was closed, false otherwise
 */
export function handleCapacitorBackButton(): boolean {
  const topModal = modalStack[modalStack.length - 1]
  if (topModal) {
    topModal()
    return true // Modal consumed the back event
  }
  return false // No modal to close
}

/**
 * Get the current modal stack (for testing/debugging)
 */
export function getModalStack(): Array<() => void> {
  return [...modalStack]
}