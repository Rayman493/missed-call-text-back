'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { PendingExternalAction, getPendingAction, clearPendingAction, createPendingAction, setPendingAction, setHandoffMarker, clearHandoffMarker } from '@/lib/pending-actions'

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
  const hasBeenBackgroundedRef = useRef(false)
  const isProcessingRef = useRef(false)
  const handoffInitiatedRef = useRef(false)
  const resumeCheckInFlightRef = useRef(false)
  const confirmationShownForActionRef = useRef<string | null>(null)

  // Lifecycle diagnostics
  useEffect(() => {
    console.log('[ExternalAction] Hook mounted, currentLeadId:', currentLeadId)
    return () => {
      console.log('[ExternalAction] Hook unmounted')
    }
  }, [currentLeadId])

  // Check if running in native Capacitor environment
  const isNativeMobile = () => {
    return Capacitor.isNativePlatform()
  }

  // Deduplicated function to check for pending action after return
  const checkPendingActionAfterReturn = useCallback(async () => {
    if (!isNativeMobile() || isProcessingRef.current || resumeCheckInFlightRef.current) {
      console.log('[ExternalAction] checkPendingActionAfterReturn skipped - not native or already processing')
      return
    }

    resumeCheckInFlightRef.current = true
    console.log('[ExternalAction] checkPendingActionAfterReturn called, handoffInitiated:', handoffInitiatedRef.current)

    try {
      const action = await getPendingAction()
      console.log('[ExternalAction] Pending action exists:', !!action, 'currentLeadId:', currentLeadId)
      
      if (action) {
        // Only show if it's for the current lead
        if (!currentLeadId || action.leadId === currentLeadId) {
          // Check if we've already shown confirmation for this action
          if (confirmationShownForActionRef.current === action.actionId) {
            console.log('[ExternalAction] Confirmation already shown for this action, skipping')
            return
          }
          
          console.log('[ExternalAction] Showing confirmation for action:', action.actionType)
          confirmationShownForActionRef.current = action.actionId
          setPendingActionState(action)
        } else {
          console.log('[ExternalAction] Pending action for different lead, leaving stored:', action.leadId, 'current:', currentLeadId)
        }
      } else {
        console.log('[ExternalAction] No pending action found')
      }
    } catch (error) {
      console.error('[ExternalAction] Error checking for pending action:', error)
    } finally {
      resumeCheckInFlightRef.current = false
    }
  }, [currentLeadId])

  // Lifecycle listener to detect app resume (registered once)
  useEffect(() => {
    if (!isNativeMobile()) {
      return
    }

    console.log('[ExternalAction] Setting up lifecycle listeners')

    let appStateListener: Promise<{ remove: () => void }> | null = null

    const setupListener = async () => {
      try {
        appStateListener = App.addListener('appStateChange', ({ isActive }) => {
          console.log('[ExternalAction] appStateChange event, isActive:', isActive)
          if (!isActive) {
            // App went to background
            hasBeenBackgroundedRef.current = true
            console.log('[ExternalAction] App backgrounded')
          } else if (isActive && hasBeenBackgroundedRef.current && !isProcessingRef.current) {
            // App came back from background and we're not already processing
            console.log('[ExternalAction] App resumed, checking for pending action')
            checkPendingActionAfterReturn()
          }
        })
      } catch (error) {
        console.error('[ExternalAction] Failed to setup app state listener:', error)
      }
    }

    setupListener()

    // Add visibilitychange listener
    const handleVisibilityChange = () => {
      console.log('[ExternalAction] visibilitychange event, visibilityState:', document.visibilityState)
      if (document.visibilityState === 'visible' && handoffInitiatedRef.current && !isProcessingRef.current) {
        console.log('[ExternalAction] Document visible after handoff, checking for pending action')
        checkPendingActionAfterReturn()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Add focus listener
    const handleFocus = () => {
      console.log('[ExternalAction] window focus event')
      if (handoffInitiatedRef.current && !isProcessingRef.current) {
        console.log('[ExternalAction] Window focused after handoff, checking for pending action')
        checkPendingActionAfterReturn()
      }
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      console.log('[ExternalAction] Cleaning up lifecycle listeners')
      if (appStateListener) {
        appStateListener.then(listener => listener.remove()).catch(err => {
          console.error('[ExternalAction] Failed to remove app state listener:', err)
        })
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [checkPendingActionAfterReturn]) // Include the check function in dependencies

  // Mount-time recovery for when the page remounts after external app
  useEffect(() => {
    if (!isNativeMobile()) {
      return
    }

    console.log('[ExternalAction] Mount-time recovery check')
    
    const checkMountTimeRecovery = async () => {
      try {
        const action = await getPendingAction()
        if (action) {
          // Only recover if it matches the current lead and has a handoff marker
          if (!currentLeadId || action.leadId === currentLeadId) {
            if (action.handoffInitiated && confirmationShownForActionRef.current !== action.actionId) {
              console.log('[ExternalAction] Mount-time recovery: showing confirmation for action:', action.actionType)
              confirmationShownForActionRef.current = action.actionId
              setPendingActionState(action)
            } else {
              console.log('[ExternalAction] Mount-time recovery: action exists but handoff not initiated or already shown')
            }
          } else {
            console.log('[ExternalAction] Mount-time recovery: action for different lead')
          }
        } else {
          console.log('[ExternalAction] Mount-time recovery: no pending action')
        }
      } catch (error) {
        console.error('[ExternalAction] Mount-time recovery error:', error)
      }
    }

    // Small delay to ensure Preferences are ready
    const timer = setTimeout(checkMountTimeRecovery, 100)
    
    return () => clearTimeout(timer)
  }, [currentLeadId])

  const markHandoffInitiated = useCallback(async () => {
    handoffInitiatedRef.current = true
    console.log('[ExternalAction] Handoff initiated')
    await setHandoffMarker()
  }, [])

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
      await clearHandoffMarker()
      setPendingActionState(null)
      hasBeenBackgroundedRef.current = false
      confirmationShownForActionRef.current = null
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
    await clearHandoffMarker()
    setPendingActionState(null)
    hasBeenBackgroundedRef.current = false
    confirmationShownForActionRef.current = null
    onCancel()
    isProcessingRef.current = false
  }, [pendingAction, onCancel])

  const handleDismiss = useCallback(() => {
    // Dismiss without clearing - just close the modal, leave action stored
    setPendingActionState(null)
    hasBeenBackgroundedRef.current = false
  }, [])

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
        setError('You have an unfinished Business Phone action waiting for confirmation. Finish or cancel it before starting another.')
      }
    }
  }, [communicationSource])

  return {
    pendingAction,
    isSubmitting,
    error,
    handleConfirm,
    handleCancel,
    handleDismiss,
    registerPendingAction,
    markHandoffInitiated,
    showConfirmation: !!pendingAction
  }
}
