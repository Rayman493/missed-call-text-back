'use client'

import { useEffect, useRef } from 'react'
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
  // Use a ref to track onClose to avoid effect cleanup when callback identity changes
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Use a ref to track whether we've pushed history state for this modal instance
  const historyPushedRef = useRef(false)

  // Create a stable wrapper function for registration that always invokes the latest onClose
  const stableCloseWrapper = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!isOpen) return

    console.log('[MODAL_BACK_BUTTON] Opening modal', {
      pathname: window.location.pathname,
      timestamp: Date.now()
    })

    // Create stable wrapper that always calls the latest onClose
    stableCloseWrapper.current = () => onCloseRef.current()

    // Push a history state so browser back can close the modal
    try {
      window.history.pushState({ modalOpen: true }, '')
      historyPushedRef.current = true
      console.log('[MODAL_BACK_BUTTON] History state pushed', {
        historyPushed: true,
        timestamp: Date.now()
      })
    } catch {
      // Ignore errors from history.pushState
      console.log('[MODAL_BACK_BUTTON] History pushState failed')
    }

    // Register the STABLE wrapper in the stack
    registerModal(stableCloseWrapper.current)
    const stackAfterRegister = getModalStack()
    console.log('[MODAL_BACK_BUTTON] Modal registered', {
      stackLength: stackAfterRegister.length,
      timestamp: Date.now()
    })

    // Handle browser back button (popstate)
    const onPopState = () => {
      console.log('[ANDROID_BACK_MODAL_CLOSE] Popstate event received', {
        pathname: window.location.pathname,
        stackLength: getModalStack().length,
        timestamp: Date.now()
      })
      // Only respond if this modal is the topmost one
      const stack = getModalStack()
      if (stack[stack.length - 1] === stableCloseWrapper.current) {
        console.log('[MODAL_BACK_BUTTON] Closing modal via popstate', {
          timestamp: Date.now()
        })
        onCloseRef.current()
      }
    }
    window.addEventListener('popstate', onPopState)

    // Cleanup when modal closes or unmounts
    return () => {
      console.log('[MODAL_BACK_BUTTON] Cleanup running', {
        pathname: window.location.pathname,
        historyPushed: historyPushedRef.current,
        stackBeforeUnregister: getModalStack().length,
        hasOpenModalBeforeUnregister: hasOpenModal(),
        timestamp: Date.now()
      })

      window.removeEventListener('popstate', onPopState)

      // Unregister the SAME stable wrapper that was registered
      if (stableCloseWrapper.current) {
        unregisterModal(stableCloseWrapper.current)
      }

      const stackAfterUnregister = getModalStack()
      console.log('[MODAL_BACK_BUTTON] Modal unregistered', {
        stackLengthAfterUnregister: stackAfterUnregister.length,
        hasOpenModalAfterUnregister: hasOpenModal(),
        timestamp: Date.now()
      })

      // Clean up history state if we pushed it and modal closed through UI (not back)
      // Only clean up if stack is empty to avoid removing history for other open modals
      if (historyPushedRef.current && !hasOpenModal()) {
        console.log('[MODAL_BACK_BUTTON] Calling history.back() to cleanup', {
          timestamp: Date.now()
        })
        try {
          window.history.back()
        } catch {
          console.log('[MODAL_BACK_BUTTON] History.back() failed')
          // Ignore errors from history.back
        }
      } else {
        console.log('[MODAL_BACK_BUTTON] Skipping history.back()', {
          historyPushed: historyPushedRef.current,
          hasOpenModal: hasOpenModal(),
          timestamp: Date.now()
        })
      }

      // Clear the stable wrapper
      stableCloseWrapper.current = null
    }
  }, [isOpen]) // Removed onClose from dependencies - use ref instead
}