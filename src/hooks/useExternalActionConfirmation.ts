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
  const currentLeadIdRef = useRef(currentLeadId)
  
  // Update the lead ref when it changes
  useEffect(() => {
    currentLeadIdRef.current = currentLeadId
  }, [currentLeadId])
  
  // Diagnostic state for on-screen panel
  const [diagnostics, setDiagnostics] = useState({
    hookMounted: false,
    hasPendingAction: false,
    handoffMarker: false,
    leadMatch: false,
    latestEvent: 'none',
    returnCheckExecuted: false,
    eligibilityResult: 'none',
    skipReason: 'none',
    modalStateSet: false
  })

  // Lifecycle diagnostics
  useEffect(() => {
    console.log('[ExternalAction] Hook mounted, currentLeadId:', currentLeadId)
    setDiagnostics(prev => ({ ...prev, hookMounted: true }))
    return () => {
      console.log('[ExternalAction] Hook unmounted')
      setDiagnostics(prev => ({ ...prev, hookMounted: false }))
    }
  }, [currentLeadId])

  // Check if running in native Capacitor environment
  const isNativeMobile = () => {
    return Capacitor.isNativePlatform()
  }

  // Function to update diagnostic state
  const updateDiagnostics = useCallback((updates: Partial<typeof diagnostics>) => {
    setDiagnostics(prev => ({ ...prev, ...updates }))
  }, [])

  // Deduplicated function to check for pending action after return
  const checkPendingActionAfterReturn = useCallback(async (source: string = 'unknown') => {
    if (!isNativeMobile() || isProcessingRef.current || resumeCheckInFlightRef.current) {
      console.log('[ExternalAction] checkPendingActionAfterReturn skipped - not native or already processing, source:', source)
      updateDiagnostics({ skipReason: 'not native or processing' })
      return
    }

    resumeCheckInFlightRef.current = true
    console.log('[ExternalAction] checkPendingActionAfterReturn called, source:', source)
    updateDiagnostics({ 
      latestEvent: source, 
      returnCheckExecuted: true 
    })

    try {
      const action = await getPendingAction()
      const currentLead = currentLeadIdRef.current
      console.log('[ExternalAction] Pending action exists:', !!action, 'currentLeadId:', currentLead)
      
      updateDiagnostics({ 
        hasPendingAction: !!action,
        handoffMarker: action?.handoffInitiated || false,
        leadMatch: !!currentLead && action?.leadId === currentLead
      })
      
      if (action) {
        // Only show if it's for the current lead
        if (!currentLead || action.leadId === currentLead) {
          // Check if we've already shown confirmation for this action
          if (confirmationShownForActionRef.current === action.actionId) {
            console.log('[ExternalAction] Confirmation already shown for this action, skipping')
            updateDiagnostics({ skipReason: 'already shown' })
            return
          }
          
          // Check if handoff was initiated (use persisted value, not in-memory ref)
          if (!action.handoffInitiated) {
            console.log('[ExternalAction] Action exists but handoff not initiated, skipping')
            updateDiagnostics({ skipReason: 'handoff not initiated' })
            return
          }
          
          console.log('[ExternalAction] Showing confirmation for action:', action.actionType)
          confirmationShownForActionRef.current = action.actionId
          setPendingActionState(action)
          updateDiagnostics({ 
            eligibilityResult: 'eligible', 
            modalStateSet: true 
          })
        } else {
          console.log('[ExternalAction] Pending action for different lead, leaving stored:', action.leadId, 'current:', currentLead)
          updateDiagnostics({ skipReason: 'different lead' })
        }
      } else {
        console.log('[ExternalAction] No pending action found')
        updateDiagnostics({ eligibilityResult: 'no action' })
      }
    } catch (error) {
      console.error('[ExternalAction] Error checking for pending action:', error)
      updateDiagnostics({ eligibilityResult: 'error' })
    } finally {
      resumeCheckInFlightRef.current = false
    }
  }, [updateDiagnostics])

  // Lifecycle listener to detect app resume (registered once)
  useEffect(() => {
    if (!isNativeMobile()) {
      return
    }

    console.log('[ExternalAction] Setting up lifecycle listeners')

    let appStateListener: Promise<{ remove: () => void }> | null = null

    const setupListener = async () => {
      try {
        console.log('[ExternalAction] Registering appStateChange listener')
        appStateListener = App.addListener('appStateChange', ({ isActive }) => {
          console.log('[ExternalAction] appStateChange event, isActive:', isActive)
          updateDiagnostics({ latestEvent: `appStateChange:${isActive}` })
          if (!isActive) {
            // App went to background
            hasBeenBackgroundedRef.current = true
            console.log('[ExternalAction] App backgrounded')
          } else if (isActive && hasBeenBackgroundedRef.current && !isProcessingRef.current) {
            // App came back from background and we're not already processing
            console.log('[ExternalAction] App resumed, checking for pending action')
            checkPendingActionAfterReturn('appStateChange')
          }
        })
        console.log('[ExternalAction] appStateChange listener registered successfully')
      } catch (error) {
        console.error('[ExternalAction] Failed to setup app state listener:', error)
      }
    }

    setupListener()

    // Add visibilitychange listener
    const handleVisibilityChange = () => {
      console.log('[ExternalAction] visibilitychange event, visibilityState:', document.visibilityState)
      updateDiagnostics({ latestEvent: `visibilitychange:${document.visibilityState}` })
      if (document.visibilityState === 'visible' && !isProcessingRef.current) {
        console.log('[ExternalAction] Document visible, checking for pending action')
        checkPendingActionAfterReturn('visibilitychange')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Add focus listener
    const handleFocus = () => {
      console.log('[ExternalAction] window focus event')
      updateDiagnostics({ latestEvent: 'focus' })
      if (!isProcessingRef.current) {
        console.log('[ExternalAction] Window focused, checking for pending action')
        checkPendingActionAfterReturn('focus')
      }
    }

    window.addEventListener('focus', handleFocus)

    // Add pageshow listener for Android WebView
    const handlePageShow = (event: PageTransitionEvent) => {
      console.log('[ExternalAction] pageshow event, persisted:', event.persisted)
      updateDiagnostics({ latestEvent: `pageshow:${event.persisted}` })
      if (!isProcessingRef.current) {
        console.log('[ExternalAction] Page shown, checking for pending action')
        checkPendingActionAfterReturn('pageshow')
      }
    }

    window.addEventListener('pageshow', handlePageShow)

    return () => {
      console.log('[ExternalAction] Cleaning up lifecycle listeners')
      if (appStateListener) {
        appStateListener.then(listener => {
          console.log('[ExternalAction] Removing appStateChange listener')
          listener.remove()
        }).catch(err => {
          console.error('[ExternalAction] Failed to remove app state listener:', err)
        })
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [checkPendingActionAfterReturn, updateDiagnostics]) // Remove currentLeadId dependency to prevent stale closures

  // Mount-time recovery for when the page remounts after external app
  useEffect(() => {
    if (!isNativeMobile()) {
      return
    }

    console.log('[ExternalAction] Mount-time recovery check')
    
    const checkMountTimeRecovery = async () => {
      // Only run when leadId is available
      const currentLead = currentLeadIdRef.current
      if (!currentLead) {
        console.log('[ExternalAction] Mount-time recovery: currentLeadId not yet available, will retry on lead change')
        return
      }
      
      try {
        const action = await getPendingAction()
        console.log('[ExternalAction] Mount-time recovery: action exists:', !!action, 'leadId:', currentLead)
        
        if (action) {
          // Only recover if it matches the current lead and has a handoff marker
          if (action.leadId === currentLead) {
            if (action.handoffInitiated && confirmationShownForActionRef.current !== action.actionId) {
              console.log('[ExternalAction] Mount-time recovery: showing confirmation for action:', action.actionType)
              confirmationShownForActionRef.current = action.actionId
              setPendingActionState(action)
              updateDiagnostics({ 
                eligibilityResult: 'mount-recovery', 
                modalStateSet: true 
              })
            } else {
              console.log('[ExternalAction] Mount-time recovery: action exists but handoff not initiated or already shown')
              updateDiagnostics({ skipReason: 'handoff not initiated or already shown' })
            }
          } else {
            console.log('[ExternalAction] Mount-time recovery: action for different lead')
            updateDiagnostics({ skipReason: 'different lead' })
          }
        } else {
          console.log('[ExternalAction] Mount-time recovery: no pending action')
          updateDiagnostics({ eligibilityResult: 'no action' })
        }
      } catch (error) {
        console.error('[ExternalAction] Mount-time recovery error:', error)
        updateDiagnostics({ eligibilityResult: 'error' })
      }
    }

    // Run immediately when leadId is available
    checkMountTimeRecovery()
  }, [currentLeadId, updateDiagnostics]) // Re-run when leadId changes

  const markHandoffInitiated = useCallback(async () => {
    handoffInitiatedRef.current = true
    console.log('[ExternalAction] Handoff initiated')
    await setHandoffMarker()
    
    // Verify the stored object was actually updated
    try {
      const action = await getPendingAction()
      if (action && action.handoffInitiated) {
        console.log('[ExternalAction] Verified: handoffInitiated is true in stored action')
        updateDiagnostics({ handoffMarker: true })
      } else {
        console.error('[ExternalAction] Verification failed: handoffInitiated is not true in stored action', action)
        updateDiagnostics({ handoffMarker: false })
      }
    } catch (error) {
      console.error('[ExternalAction] Verification error:', error)
      updateDiagnostics({ handoffMarker: false })
    }
  }, [updateDiagnostics])

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
    showConfirmation: !!pendingAction,
    diagnostics
  }
}
