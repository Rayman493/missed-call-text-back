/**
 * Modal back button state management
 * 
 * This module manages the stack of open modals for Android back button handling.
 * It can be imported by both client components (via the hook) and the global
 * Capacitor init handler to coordinate back button behavior.
 */

// Module-level stack of active modal close callbacks
const modalStack: Array<() => void> = []

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