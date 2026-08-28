'use client'

import { useEffect } from 'react'
import { registerModal, unregisterModal, hasOpenModal, getModalStack } from '@/lib/modalBackButton'

interface UseModalBackButtonOptions {
  isOpen: boolean
  onClose: () => void
}

/**
 * Hook to handle Android hardware back button and browser back for dismissible modals.
 * Ensures the topmost modal closes on back press before navigating away.
 *
 * Uses a module-level stack to ensure only one Capacitor backButton listener
 * (in init.ts) and only the topmost modal responds to native Back events.
 *
 * @param options - Configuration object
 * @param options.isOpen - Whether the modal is currently open
 * @param options.onClose - Callback to close the modal
 */
export function useModalBackButton({ isOpen, onClose }: UseModalBackButtonOptions) {
  useEffect(() => {
    if (!isOpen) return

    // Push a history state so browser back can close the modal
    let historyPushed = false
    try {
      window.history.pushState({ modalOpen: true }, '')
      historyPushed = true
    } catch {
      // Ignore errors from history.pushState
    }

    // Register this modal in the stack
    registerModal(onClose)

    // Handle browser back button (popstate)
    const onPopState = () => {
      // Only respond if this modal is the topmost one
      const stack = getModalStack()
      if (stack[stack.length - 1] === onClose) {
        onClose()
      }
    }
    window.addEventListener('popstate', onPopState)

    // Cleanup when modal closes or unmounts
    return () => {
      window.removeEventListener('popstate', onPopState)
      unregisterModal(onClose)
      
      // Clean up history state if we pushed it and modal closed through UI (not back)
      // Only clean up if stack is empty to avoid removing history for other open modals
      if (historyPushed && !hasOpenModal()) {
        try {
          window.history.back()
        } catch {
          // Ignore errors from history.back
        }
      }
    }
  }, [isOpen, onClose])
}