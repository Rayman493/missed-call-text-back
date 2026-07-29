'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { PendingExternalAction, getPendingAction, clearPendingAction, createPendingAction, setPendingAction } from '@/lib/pending-actions'

interface UseExternalActionConfirmationOptions {
  onConfirm: (action: PendingExternalAction) => Promise<void>
  onCancel: () => void
  currentLeadId?: string
  communicationSource?: 'replyflow' | 'business'
}

export function useExternalActionConfirmation({
  onConfirm,
  onCancel,
  currentLeadId,
  communicationSource
}: UseExternalActionConfirmationOptions) {
  const [pendingAction, setPendingActionState] = useState<PendingExternalAction | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [hasBeenBackgrounded, setHasBeenBackgrounded] = useState(false)
  const isProcessingRef = useRef(false)

  // Check if running in native Capacitor environment
  const isNativeMobile = () => {
    return Capacitor.isNativePlatform()
  }

  // Lifecycle listener to detect app resume (registered once)
  useEffect(() => {
    if (!isNativeMobile()) {
      return
    }

    let appStateListener: Promise<{ remove: () => void }> | null = null

    const setupListener = async () => {
      try {
        appStateListener = App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            // App went to background
            setHasBeenBackgrounded(true)
            console.log('[ExternalAction] App backgrounded')
          } else if (isActive && hasBeenBackgrounded && !isProcessingRef.current) {
            // App came back from background and we're not already processing
            console.log('[ExternalAction] App resumed, checking for pending action')
            checkForPendingAction()
          }
        })
      } catch (error) {
        console.error('[ExternalAction] Failed to setup app state listener:', error)
      }
    }

    setupListener()

    return () => {
      if (appStateListener) {
        appStateListener.then(listener => listener.remove()).catch(err => {
          console.error('[ExternalAction] Failed to remove app state listener:', err)
        })
      }
    }
  }, []) // No dependencies - register once

  const checkForPendingAction = useCallback(async () => {
    if (!isNativeMobile() || isProcessingRef.current) {
      return
    }

    try {
      const action = await getPendingAction()
      if (action) {
        // Only show if it's for the current lead
        if (!currentLeadId || action.leadId === currentLeadId) {
          console.log('[ExternalAction] Found pending action:', action.actionType)
          setPendingActionState(action)
        } else {
          // Clear if it's for a different lead
          await clearPendingAction()
        }
      }
    } catch (error) {
      console.error('[ExternalAction] Error checking for pending action:', error)
    }
  }, [currentLeadId])

  const handleConfirm = useCallback(async () => {
    if (!pendingAction || isProcessingRef.current) {
      return
    }

    isProcessingRef.current = true
    setIsSubmitting(true)
    setError(undefined)

    try {
      await onConfirm(pendingAction)
      await clearPendingAction()
      setPendingActionState(null)
      setHasBeenBackgrounded(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record action')
    } finally {
      setIsSubmitting(false)
      isProcessingRef.current = false
    }
  }, [pendingAction, onConfirm])

  const handleCancel = useCallback(async () => {
    if (!pendingAction || isProcessingRef.current) {
      return
    }

    isProcessingRef.current = true
    await clearPendingAction()
    setPendingActionState(null)
    setHasBeenBackgrounded(false)
    onCancel()
    isProcessingRef.current = false
  }, [pendingAction, onCancel])

  const registerPendingAction = useCallback(async (action: PendingExternalAction) => {
    if (!isNativeMobile() || communicationSource !== 'business') {
      return
    }

    try {
      await setPendingAction(action)
      console.log('[ExternalAction] Registered pending action:', action.actionType)
    } catch (error) {
      console.error('[ExternalAction] Failed to register pending action:', error)
      // If there's an existing action, show a user-friendly error
      if (error instanceof Error && error.message.includes('existing unconfirmed action')) {
        setError('Please confirm or cancel the pending action before starting another one')
      }
    }
  }, [communicationSource])

  return {
    pendingAction,
    isSubmitting,
    error,
    handleConfirm,
    handleCancel,
    registerPendingAction,
    showConfirmation: !!pendingAction
  }
}
