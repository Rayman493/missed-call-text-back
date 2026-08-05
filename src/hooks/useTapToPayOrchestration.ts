'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { isNativeCapacitor } from '@/lib/terminal'
import type { TerminalError } from '@/lib/terminal'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'
import { mapTapToPayError } from '@/lib/terminal/error-mapper'
import { permissionLock } from '@/lib/permission-lock'
import { nativePermissionsStore } from '@/lib/native-permissions/native-permissions-store'

type PaymentState = 'ready' | 'preparing' | 'connecting_reader' | 'creating_payment_intent' | 'waiting_for_card' | 'processing' | 'success' | 'failure' | 'canceled' | 'pending' | 'ambiguous'

// Runtime state validation helper
function isValidPaymentState(value: string): value is PaymentState {
  const validStates: PaymentState[] = [
    'ready',
    'preparing',
    'connecting_reader',
    'creating_payment_intent',
    'waiting_for_card',
    'processing',
    'success',
    'failure',
    'canceled',
    'pending',
    'ambiguous'
  ]
  return validStates.includes(value as PaymentState)
}

// Event dispatch helper for timeline
function dispatchTTPEvent(event: string, sessionId?: string | null, attemptId?: string | null, paymentState?: string, stage?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ttp:event', {
      detail: { event, sessionId: sessionId || undefined, attemptId: attemptId || undefined, paymentState, stage }
    }))
  }
}

interface UseTapToPayOrchestrationOptions {
  amountCents: number
  leadId?: string
  jobId?: string
  description?: string
  customerName?: string
  onPaymentComplete?: () => void
  onPaymentError?: (error: string) => void
}

export interface UseTapToPayOrchestrationReturn {
  paymentState: PaymentState
  error: string
  structuredError: TerminalError | null
  mappedError: ReturnType<typeof mapTapToPayError> | null
  isPaymentInProgress: boolean
  platform: 'ios' | 'android' | 'web'
  isNativeSupported: boolean
  lastSuccessfulStage: string
  lastResetReason: string
  locationPermissionGranted: boolean | null
  locationServicesEnabled: boolean | null
  locationPermissionState: 'granted' | 'denied' | 'permanently_denied' | 'unknown'
  startPayment: () => Promise<void>
  cancelPayment: (reason?: string) => void
  retryPayment: () => Promise<void>
  retryAfterCancellation: () => Promise<void>
  resetTapToPayUiState: (preserveSucceededAttempt?: boolean) => void
  resetToSetup: (reason?: string) => void
  checkPlatformSupport: () => Promise<{ platform: 'ios' | 'android' | 'web'; isNativeSupported: boolean }>
  requestLocationPermission: () => Promise<{ granted: boolean; locationEnabled: boolean; canAskAgain: boolean }>
  checkLocationPermission: () => Promise<{ granted: boolean; locationEnabled: boolean; canAskAgain: boolean }>
}

export function useTapToPayOrchestration({
  amountCents,
  leadId,
  jobId,
  description,
  customerName,
  onPaymentComplete,
  onPaymentError,
}: UseTapToPayOrchestrationOptions): UseTapToPayOrchestrationReturn {
  const [paymentState, setPaymentState] = useState<PaymentState>('ready')
  const [error, setError] = useState<string>('')
  const [structuredError, setStructuredError] = useState<TerminalError | null>(null)
  const [mappedError, setMappedError] = useState<ReturnType<typeof mapTapToPayError> | null>(null)
  const [isPaymentInProgress, setIsPaymentInProgress] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web')
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [lastSuccessfulStage, setLastSuccessfulStage] = useState<string>('none')
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null)
  const [locationServicesEnabled, setLocationServicesEnabled] = useState<boolean | null>(null)
  const [locationPermissionState, setLocationPermissionState] = useState<'granted' | 'denied' | 'permanently_denied' | 'unknown'>('unknown')
  const [showLocationPermissionDialog, setShowLocationPermissionDialog] = useState(false)
  const [lastResetReason, setLastResetReason] = useState<string>('none')

  const terminalService = TerminalBridgeService.getInstance()
  
  // Terminal service is browser/native only - return empty hooks on server
  if (!terminalService) {
    return {
      paymentState,
      error: '',
      structuredError: null,
      mappedError: null,
      isPaymentInProgress: false,
      platform: 'web',
      isNativeSupported: false,
      lastSuccessfulStage: 'none',
      lastResetReason: 'none',
      locationPermissionGranted: null,
      locationServicesEnabled: null,
      locationPermissionState: 'unknown',
      startPayment: async () => {},
      cancelPayment: () => {},
      retryPayment: async () => {},
      retryAfterCancellation: async () => {},
      resetTapToPayUiState: () => {},
      resetToSetup: () => {},
      checkPlatformSupport: async () => ({ platform: 'web', isNativeSupported: false }),
      checkLocationPermission: async () => ({ granted: false, locationEnabled: false, canAskAgain: false }),
      requestLocationPermission: async () => ({ granted: false, locationEnabled: false, canAskAgain: false }),
    }
  }
  
  const paymentStateRef = useRef<PaymentState>(paymentState)
  const autoRetryInProgress = useRef(false)
  const startInFlight = useRef(false)
  const activeAttemptRef = useRef(false)
  const recoveryRunRef = useRef(false)
  const activeAttemptIdRef = useRef<string | null>(null)
  const activeAttemptTokenRef = useRef<string | null>(null)

  // Update ref when state changes with logging and reason
  const updatePaymentStateRef = useCallback((newState: PaymentState, reason: string = 'unknown') => {
    // Validate state before transition
    if (!isValidPaymentState(newState)) {
      console.error('[TTP Hook] INVALID_PAYMENT_STATE_ATTEMPTED', {
        requestedState: newState,
        currentState: paymentStateRef.current,
        reason,
        timestamp: new Date().toISOString()
      })
      // Do not transition to invalid state
      return
    }

    // Prevent same-state transitions to avoid infinite loops
    if (paymentStateRef.current === newState) {
      console.log('[TTP Hook] SAME_STATE_TRANSITION_SKIPPED', {
        state: newState,
        reason,
        sessionId: terminalService.getSessionId(),
        attemptId: terminalService.getCurrentAttemptId(),
      })
      // Do not transition or dispatch events for same state
      return
    }

    const previousState = paymentStateRef.current
    paymentStateRef.current = newState
    setPaymentState(newState)
    setLastResetReason(reason)
    
    // Log state transition with attempt ID
    console.log('[TTP Hook] STATE_TRANSITION', {
      previous: previousState,
      next: newState,
      reason,
      sessionId: terminalService.getSessionId(),
      attemptId: terminalService.getCurrentAttemptId(),
      startInFlight: startInFlight.current,
      activeAttempt: activeAttemptRef.current,
      timestamp: new Date().toISOString()
    })

    // Dispatch event for timeline
    dispatchTTPEvent(
      `STATE_TRANSITION: ${previousState} -> ${newState}`,
      terminalService.getSessionId(),
      terminalService.getCurrentAttemptId(),
      newState,
      reason
    )
    
    // Invariant check: ready state should not have active payment
    if (newState === 'ready' && (startInFlight.current || activeAttemptRef.current)) {
      console.error('[TTP Hook] STATE_VIOLATION', {
        violation: 'ready_state_with_active_payment',
        state: newState,
        startInFlight: startInFlight.current,
        activeAttempt: activeAttemptRef.current,
        stage: lastSuccessfulStage,
        reason
      })
    }
  }, [lastSuccessfulStage])

  useEffect(() => {
    paymentStateRef.current = paymentState
  }, [paymentState])

  // Hook lifecycle diagnostics
  useEffect(() => {
    console.log('[TTP Hook] HOOK_MOUNTED')
    dispatchTTPEvent('HOOK_MOUNTED')
    return () => {
      console.log('[TTP Hook] HOOK_UNMOUNTED')
      dispatchTTPEvent('HOOK_UNMOUNTED')
    }
  }, [])

  // Check platform and native support
  const checkPlatformSupport = useCallback(async () => {
    console.log('[QuickTTP UI] NATIVE_DETECTION_STARTED')
    const MAX_RETRIES = 20
    const RETRY_DELAY = 50
    let retries = 0

    while (retries < MAX_RETRIES) {
      const pluginAvailable = Capacitor.isPluginAvailable('ReplyflowStripeTerminal')
      console.log(`[QuickTTP UI] NATIVE_DETECTION_RETRY ${retries}: pluginAvailable=${pluginAvailable}`)
      if (pluginAvailable !== undefined) {
        const currentPlatform = Capacitor.getPlatform()
        if (currentPlatform !== 'web' || pluginAvailable === false) {
          break
        }
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY))
      retries++
    }

    const detectedPlatform = Capacitor.getPlatform() as 'ios' | 'android' | 'web'
    setPlatform(detectedPlatform)
    const isNative = Capacitor.isNativePlatform()
    const pluginAvailable = Capacitor.isPluginAvailable('ReplyflowStripeTerminal')
    const supported = isNativeCapacitor() && pluginAvailable
    
    console.log('[QuickTTP UI] NATIVE_DETECTION_RESULT', {
      capacitorIsNativePlatform: isNative,
      capacitorPlatform: detectedPlatform,
      pluginName: 'ReplyflowStripeTerminal',
      pluginAvailable,
      isNativeCapacitor: isNativeCapacitor(),
      isNativeSupported: supported
    })
    
    setIsNativeSupported(supported)

    return { platform: detectedPlatform, isNativeSupported: supported }
  }, [])

  // Check location permission for Android
  const checkLocationPermission = useCallback(async (): Promise<{ granted: boolean; locationEnabled: boolean; canAskAgain: boolean }> => {
    console.log('[TTP Hook] checkLocationPermission called', { platform })
    dispatchTTPEvent('LOCATION_PERMISSION_PROMISE_STARTED', terminalService.getSessionId())
    const startTime = Date.now()
    
    if (platform !== 'android') {
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      console.log('[TTP Hook] checkLocationPermission: not Android, skipping')
      dispatchTTPEvent('LOCATION_PERMISSION_PROMISE_RESOLVED', terminalService.getSessionId(), undefined, undefined, 'not_android')
      return { granted: true, locationEnabled: true, canAskAgain: true }
    }

    try {
      // Use shared permission store with force refresh for Tap to Pay
      await nativePermissionsStore.checkLocationPermission({ forceRefresh: true })
      const state = nativePermissionsStore.getState()
      
      const granted = state.location.status === 'granted'
      const locationEnabled = state.location.servicesEnabled === true
      const canAskAgain = state.location.canAskAgain ?? true
      
      console.log('[TTP Hook] Shared permission store result:', { granted, locationEnabled, canAskAgain, status: state.location.status })
      setLocationPermissionGranted(granted)
      setLocationServicesEnabled(locationEnabled)

      dispatchTTPEvent('LOCATION_PERMISSION_PROMISE_RESOLVED', terminalService.getSessionId(), undefined, undefined, granted ? 'granted' : 'denied')
      return { granted, locationEnabled, canAskAgain }
    } catch (error) {
      console.error('[TTP Hook] Failed to check location permission:', error)
      dispatchTTPEvent('LOCATION_PERMISSION_PROMISE_REJECTED', terminalService.getSessionId(), undefined, undefined, String(error))
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      console.log('[TTP Hook] checkLocationPermission: error, returning true (fallback)')
      return { granted: true, locationEnabled: true, canAskAgain: true }
    }
  }, [platform])

  // Request location permission proactively
  const requestLocationPermission = useCallback(async (): Promise<{ granted: boolean; locationEnabled: boolean; canAskAgain: boolean }> => {
    console.log('[TTP Hook] requestLocationPermission called', { platform })
    dispatchTTPEvent('REQUEST_LOCATION_PERMISSION_PROMISE_STARTED', terminalService.getSessionId())
    const startTime = Date.now()
    
    if (platform !== 'android') {
      dispatchTTPEvent('REQUEST_LOCATION_PERMISSION_PROMISE_RESOLVED', terminalService.getSessionId(), undefined, undefined, 'not_android')
      return { granted: true, locationEnabled: true, canAskAgain: true }
    }

    try {
      // Use shared permission store to request location permission
      await nativePermissionsStore.requestLocationPermission()
      const state = nativePermissionsStore.getState()
      
      const granted = state.location.status === 'granted'
      const locationEnabled = state.location.servicesEnabled === true
      const canAskAgain = state.location.canAskAgain ?? true
      
      console.log('[TTP Hook] Shared permission store request result:', { granted, locationEnabled, canAskAgain, status: state.location.status })
      setLocationPermissionGranted(granted)
      setLocationServicesEnabled(locationEnabled)

      dispatchTTPEvent('REQUEST_LOCATION_PERMISSION_PROMISE_RESOLVED', terminalService.getSessionId(), undefined, undefined, granted ? 'granted' : 'denied')
      return { granted, locationEnabled, canAskAgain }
    } catch (error) {
      console.error('[TTP Hook] Failed to request location permission:', error)
      dispatchTTPEvent('REQUEST_LOCATION_PERMISSION_PROMISE_REJECTED', terminalService.getSessionId(), undefined, undefined, String(error))
      return { granted: false, locationEnabled: false, canAskAgain: false }
    }
  }, [platform])

  // Check for unresolved previous attempts on mount
  useEffect(() => {
    // Guard: Prevent recovery from running more than once per modal session
    if (recoveryRunRef.current) {
      console.log('[TTP Hook] RECOVERY_ALREADY_RAN_SKIPPED')
      return
    }

    const checkUnresolvedAttempt = async () => {
      dispatchTTPEvent('RECOVERY_EFFECT_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
      recoveryRunRef.current = true
      
      // Guard: Skip recovery if a payment is already active
      if (startInFlight.current || activeAttemptRef.current) {
        console.log('[TTP Hook] RECOVERY_SKIPPED_ACTIVE_ATTEMPT', {
          startInFlight: startInFlight.current,
          activeAttempt: activeAttemptRef.current
        })
        dispatchTTPEvent('RECOVERY_SKIPPED_ACTIVE_ATTEMPT', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
        return
      }

      const RECOVERY_TIMEOUT_MS = 15000 // 15 seconds
      const timeoutId = setTimeout(() => {
        console.log('[TTP Hook] RECOVERY_TIMEOUT - clearing recovery state')
        setError('')
        setStructuredError(null)
        setMappedError(null)
        dispatchTTPEvent('RECOVERY_TIMEOUT', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
      }, RECOVERY_TIMEOUT_MS)

      try {
        console.log('[TTP Hook] Checking for unresolved attempts')
        dispatchTTPEvent('RECOVERY_PROMISE_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
        const response = await fetch('/api/terminal/attempt-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        // Safe response parsing to handle empty or malformed responses
        const text = await response.text()
        let data = null
        try {
          data = text.trim() ? JSON.parse(text) : null
        } catch (parseError) {
          console.error('[TTP Hook] Failed to parse recovery response', parseError)
          data = null
        }
        
        if (!data) {
          data = { unresolvedAttempt: null }
        }
        
        if (data.unresolvedAttempt) {
          console.log('[TTP Hook] Found unresolved attempt', data.unresolvedAttempt)
          setLastSuccessfulStage('checking_previous_payment')
          
          // If the attempt succeeded, show success
          if (data.unresolvedAttempt.status === 'succeeded') {
            console.log('[TTP Hook] Previous attempt succeeded, showing success')
            clearTimeout(timeoutId)
            setPaymentState('success')
            setLastSuccessfulStage('payment_completed')
            onPaymentComplete?.()
            startInFlight.current = false
            activeAttemptRef.current = false
            console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_SUCCESS')
            dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'previous_attempt_succeeded')
          } else if (data.unresolvedAttempt.status === 'canceled' || data.unresolvedAttempt.status === 'failed') {
            console.log('[TTP Hook] Previous attempt failed/canceled, clearing and transitioning to ready')
            clearTimeout(timeoutId)
            // Clear stale attempt and transition to ready, not canceled
            // Canceled state is only for current session cancellations
            setPaymentState('ready')
            setLastSuccessfulStage('none')
            dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'previous_attempt_cleared')
          } else {
            // Still pending but stale, clear it
            console.log('[TTP Hook] Previous attempt stale, clearing and transitioning to ready')
            clearTimeout(timeoutId)
            setPaymentState('ready')
            setLastSuccessfulStage('none')
            dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'stale_attempt_cleared')
          }
        } else {
          // No unresolved attempt, explicitly set to ready
          console.log('[TTP Hook] No unresolved attempt, transitioning to ready')
          clearTimeout(timeoutId)
          setPaymentState('ready')
          setLastSuccessfulStage('none')
          dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'no_unresolved_attempt')
        }
      } catch (error) {
        console.error('[TTP Hook] Failed to check unresolved attempt', error)
        clearTimeout(timeoutId)
        // On error, ensure we're in ready state
        setPaymentState('ready')
        setLastSuccessfulStage('none')
        dispatchTTPEvent('RECOVERY_PROMISE_REJECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, String(error))
      }
    }
    
    checkUnresolvedAttempt()
  }, []) // Empty dependency array - run only on mount

  // Helper to check if reset is safe given active attempt
  const canResetPaymentUi = useCallback((source: string) => {
    const canReset = !(
      startInFlight.current ||
      activeAttemptRef.current ||
      isPaymentInProgress ||
      activeAttemptIdRef.current !== null
    )
    
    if (!canReset) {
      console.log('[TTP Hook] RESET_SKIPPED_ACTIVE_ATTEMPT', {
        source,
        paymentState: paymentStateRef.current,
        activeAttemptId: activeAttemptIdRef.current,
        startInFlight: startInFlight.current,
        activeAttempt: activeAttemptRef.current,
        isPaymentInProgress,
      })
      dispatchTTPEvent('RESET_SKIPPED_ACTIVE_ATTEMPT', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentStateRef.current, source)
    }
    
    return canReset
  }, [isPaymentInProgress])

  // Helper to check if an async result belongs to the active attempt
  const isResultFromActiveAttempt = useCallback((localAttemptToken: string | null, source: string) => {
    const isActive = activeAttemptTokenRef.current !== null && activeAttemptTokenRef.current === localAttemptToken
    
    if (!isActive && localAttemptToken !== null) {
      console.log('[TTP Hook] STALE_ATTEMPT_RESULT_IGNORED', {
        source,
        localAttemptToken,
        activeAttemptToken: activeAttemptTokenRef.current,
      })
      dispatchTTPEvent('STALE_ATTEMPT_RESULT_IGNORED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentStateRef.current, source)
    }
    
    return isActive
  }, [])

  // Helper to normalize native payment result status
  const normalizeNativePaymentResult = useCallback((status: string): 'succeeded' | 'canceled' | 'failed' | 'pending' | 'ambiguous' => {
    const normalized = status?.toLowerCase() || ''

    if (normalized === 'success' || normalized === 'succeeded') {
      return 'succeeded'
    }
    if (normalized === 'cancel' || normalized === 'canceled' || normalized === 'cancelled') {
      return 'canceled'
    }
    if (normalized === 'fail' || normalized === 'failed' || normalized === 'error') {
      return 'failed'
    }
    if (normalized === 'pending') {
      return 'pending'
    }

    return 'ambiguous'
  }, [])

// Helper to serialize native payment error for diagnostics (safe, no secrets)
  const serializeNativePaymentError = useCallback((error: any): any => {
    const platform = Capacitor.getPlatform()

    // Capture basic error properties
    const serialized: any = {
      typeof: typeof error,
      constructorName: error?.constructor?.name || 'Unknown',
      platform,
      timestamp: new Date().toISOString(),
    }

    // Capture string representation
    try {
      serialized.stringified = String(error)
    } catch (e) {
      serialized.stringified = '[unstringifiable]'
    }

    // Capture standard error fields
    if (error) {
      if (error.name) serialized.name = String(error.name)
      if (error.message) {
        serialized.message = String(error.message)
        serialized.messageContainsCancel = String(error.message).toLowerCase().includes('cancel')
      }
      if (error.code) serialized.code = String(error.code)
      if (error.errorCode) serialized.errorCode = String(error.errorCode)
      if (error.nativeCode) serialized.nativeCode = String(error.nativeCode)
      if (error.technicalCode) serialized.technicalCode = String(error.technicalCode)
      if (error.localizedMessage) serialized.localizedMessage = String(error.localizedMessage)
      if (error.status) serialized.status = String(error.status)
      if (error.userCanceled !== undefined) serialized.userCanceled = Boolean(error.userCanceled)
      if (error.outcome) serialized.outcome = String(error.outcome)
    }

    // Capture all own property names
    try {
      serialized.ownPropertyNames = Object.getOwnPropertyNames(error || {})
    } catch (e) {
      serialized.ownPropertyNames = []
    }

    // Capture all enumerable keys
    try {
      serialized.keys = Object.keys(error || {})
    } catch (e) {
      serialized.keys = []
    }

    // Capture nested data/details safely
    if (error?.data && typeof error.data === 'object') {
      try {
        serialized.data = {
          keys: Object.keys(error.data),
          // Only capture specific safe fields
          ...(error.data.userCanceled !== undefined && { userCanceled: Boolean(error.data.userCanceled) }),
          ...(error.data.outcome !== undefined && { outcome: String(error.data.outcome) }),
          ...(error.data.code !== undefined && { code: String(error.data.code) }),
          ...(error.data.message !== undefined && { message: String(error.data.message) }),
        }
      } catch (e) {
        serialized.data = '[unserializable]'
      }
    }

    if (error?.details && typeof error.details === 'object') {
      try {
        serialized.details = {
          keys: Object.keys(error.details),
          ...(error.details.userCanceled !== undefined && { userCanceled: Boolean(error.details.userCanceled) }),
          ...(error.details.outcome !== undefined && { outcome: String(error.details.outcome) }),
        }
      } catch (e) {
        serialized.details = '[unserializable]'
      }
    }

    // Capture cause chain
    if (error?.cause) {
      try {
        serialized.cause = {
          name: error.cause?.name,
          message: error.cause?.message,
          code: error.cause?.code,
        }
      } catch (e) {
        serialized.cause = '[unserializable]'
      }
    }

    return serialized
  }, [])

  // Helper to classify payment collection outcome from both resolved results and rejected errors
  const classifyPaymentCollectionOutcome = useCallback((resultOrError: any): {
    outcome: 'succeeded' | 'canceled' | 'failed' | 'pending' | 'ambiguous'
    matchedBy: string
    rawCode?: string
    rawMessage?: string
    userCanceled?: boolean
  } => {
    // Handle resolved result
    if (resultOrError && typeof resultOrError === 'object' && resultOrError.status) {
      const status = String(resultOrError.status).toLowerCase()
      if (status === 'canceled' || status === 'cancelled') {
        return {
          outcome: 'canceled',
          matchedBy: 'status',
          rawCode: resultOrError.code,
          rawMessage: resultOrError.message,
          userCanceled: resultOrError.userCanceled,
        }
      }
      if (status === 'success' || status === 'succeeded') {
        return {
          outcome: 'succeeded',
          matchedBy: 'status',
          rawCode: resultOrError.code,
          rawMessage: resultOrError.message,
        }
      }
      if (status === 'fail' || status === 'failed' || status === 'error') {
        return {
          outcome: 'failed',
          matchedBy: 'status',
          rawCode: resultOrError.code,
          rawMessage: resultOrError.message,
        }
      }
      if (status === 'pending') {
        return {
          outcome: 'pending',
          matchedBy: 'status',
          rawCode: resultOrError.code,
          rawMessage: resultOrError.message,
        }
      }
      return {
        outcome: 'ambiguous',
        matchedBy: 'status',
        rawCode: resultOrError.code,
        rawMessage: resultOrError.message,
      }
    }

    // Handle rejected error
    if (resultOrError && (resultOrError instanceof Error || typeof resultOrError === 'object')) {
      const code = String(resultOrError.code || resultOrError.nativeCode || '')
      const message = String(resultOrError.message || '')
      const userCanceled = resultOrError.userCanceled !== undefined ? Boolean(resultOrError.userCanceled) : undefined

      // Check explicit userCanceled flag first
      if (userCanceled === true) {
        return {
          outcome: 'canceled',
          matchedBy: 'userCanceled',
          rawCode: code,
          rawMessage: message,
          userCanceled: true,
        }
      }

      // Check nested data.userCanceled
      if (resultOrError.data?.userCanceled === true || resultOrError.details?.userCanceled === true) {
        return {
          outcome: 'canceled',
          matchedBy: 'nested.userCanceled',
          rawCode: code,
          rawMessage: message,
          userCanceled: true,
        }
      }

      // Check for explicit outcome field
      if (resultOrError.outcome === 'canceled') {
        return {
          outcome: 'canceled',
          matchedBy: 'outcome',
          rawCode: code,
          rawMessage: message,
          userCanceled,
        }
      }

      // Check for cancellation indicators in code/message
      const codeLower = code.toLowerCase()
      const messageLower = message.toLowerCase()

      if (
        codeLower.includes('cancel') ||
        codeLower.includes('canceled') ||
        codeLower.includes('cancelled') ||
        codeLower.includes('user_canceled') ||
        codeLower.includes('command_canceled') ||
        messageLower.includes('cancel') ||
        messageLower.includes('canceled') ||
        messageLower.includes('cancelled')
      ) {
        return {
          outcome: 'canceled',
          matchedBy: 'code_or_message',
          rawCode: code,
          rawMessage: message,
          userCanceled,
        }
      }

      // Check for success indicators in error (shouldn't happen but defensive)
      if (
        codeLower.includes('success') ||
        codeLower.includes('succeeded') ||
        messageLower.includes('success') ||
        messageLower.includes('succeeded')
      ) {
        return {
          outcome: 'succeeded',
          matchedBy: 'code_or_message',
          rawCode: code,
          rawMessage: message,
        }
      }

      // Check for pending indicators
      if (
        codeLower.includes('pending') ||
        messageLower.includes('pending')
      ) {
        return {
          outcome: 'pending',
          matchedBy: 'code_or_message',
          rawCode: code,
          rawMessage: message,
        }
      }

      // Default to failed for other errors
      return {
        outcome: 'failed',
        matchedBy: 'default',
        rawCode: code,
        rawMessage: message,
      }
    }

    return {
      outcome: 'ambiguous',
      matchedBy: 'default',
    }
  }, [])

  // Main payment orchestration function
  const startPayment = useCallback(async () => {
    console.log('[TTP Hook] START_PAYMENT_ENTERED', {
      isNativeSupported,
      platform,
      amountCents,
      leadId,
      jobId,
      previousState: paymentState
    })

    // Guard: Prevent duplicate start calls when attempt is already in flight
    if (startInFlight.current || activeAttemptRef.current) {
      console.log('[TTP Hook] START_IGNORED_ALREADY_IN_FLIGHT', {
        startInFlight: startInFlight.current,
        activeAttempt: activeAttemptRef.current,
      })
      dispatchTTPEvent('START_IGNORED_ALREADY_IN_FLIGHT', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
      return
    }

    if (!isNativeSupported) {
      console.log('[TTP Hook] VALIDATION_FAILED: Native support check failed', {
        platform,
        isNativeSupported,
        nextState: 'ready'
      })
      if (platform === 'web') {
        const errorMsg = 'Tap to Pay is only available on the mobile app'
        setError(errorMsg)
        onPaymentError?.(errorMsg)
      }
      return
    }
    console.log('[TTP Hook] VALIDATION_PASSED: Native support', { platform })

    // Minimum amount validation
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || Math.floor(amountCents) !== amountCents) {
      console.log('[TTP Hook] VALIDATION_FAILED: Invalid amount format', { amountCents })
      const errorMsg = 'Invalid amount. Please enter a valid amount.'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }
    if (amountCents < 50) {
      console.log('[TTP Hook] VALIDATION_FAILED: Amount below minimum', { amountCents })
      const errorMsg = 'Amount must be at least $0.50.'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }
    console.log('[TTP Hook] VALIDATION_PASSED: Amount', { amountCents })

    // Double-tap protection
    if (isPaymentInProgress) {
      console.log('[TTP Hook] Payment already in progress, ignoring')
      return
    }

    autoRetryInProgress.current = false

    // Check for unresolved attempt
    const unresolvedAttemptId = terminalService.getUnresolvedAttempt()
    if (unresolvedAttemptId) {
      console.log('[TTP Hook] Unresolved attempt found:', unresolvedAttemptId)
      updatePaymentStateRef('ambiguous', 'unresolved_attempt_found')
      const errorMsg = 'Please resolve the previous payment status first'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }

    // In-flight guard to prevent repeated starts
    if (startInFlight.current) {
      console.log('[QuickTTP UI] START_IGNORED_ALREADY_IN_FLIGHT')
      return
    }
    startInFlight.current = true
    activeAttemptRef.current = true
    const currentAttemptId = terminalService.getCurrentAttemptId()
    const attemptToken = crypto.randomUUID()
    activeAttemptIdRef.current = currentAttemptId
    activeAttemptTokenRef.current = attemptToken
    console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_SET')
    console.log('[TTP Hook] ATTEMPT_STARTED', {
      sessionId: terminalService.getSessionId(),
      attemptId: currentAttemptId,
      attemptToken
    })
    dispatchTTPEvent('ATTEMPT_STARTED', terminalService.getSessionId(), currentAttemptId)

    setIsPaymentInProgress(true)
    permissionLock.setTapToPayActive(true)
    updatePaymentStateRef('preparing', 'start_payment_called')
    setError('')
    setStructuredError(null)
    setMappedError(null)
    setLastResetReason('') // Clear recovery error when starting new payment
    setLastSuccessfulStage('initializing')

    try {
      console.log('[TTP Hook] DEVICE_SUPPORT_CHECK_STARTED')
      // Check device support
      const supportCheck = await terminalService.isSupported()
      console.log('[TTP Hook] DEVICE_SUPPORT_CHECK_COMPLETED', {
        supported: supportCheck.supported,
        unsupportedReason: supportCheck.unsupportedReason
      })
      if (!supportCheck.supported) {
        console.log('[TTP Hook] VALIDATION_FAILED: Device not supported', { unsupportedReason: supportCheck.unsupportedReason })
        throw new Error('This device does not support Tap to Pay')
      }
      setLastSuccessfulStage('device_supported')

      // Check location permission for Android
      if (platform === 'android') {
        console.log('[QuickTTP UI] LOCATION_BLOCK_ENTERED', { platform })
        let permissionResult: any = await withTimeout(
          checkLocationPermission(),
          'LOCATION_PERMISSION_CHECK',
          TIMEOUTS.PERMISSION_REQUEST,
          terminalService.getSessionId() || 'unknown',
          terminalService.getCurrentAttemptId() || 'unknown'
        )
        console.log('[QuickTTP UI] LOCATION_CHECK_RESULT', { permissionResult })
        
        if (!permissionResult.granted) {
          console.log('[QuickTTP UI] LOCATION_CHECK_FAILED - requesting permission')
          console.log('[QuickTTP UI] BEFORE_PERMISSION_AWAIT')
          permissionResult = await withTimeout(
            requestLocationPermission(),
            'LOCATION_PERMISSION_REQUEST',
            TIMEOUTS.PERMISSION_REQUEST,
            terminalService.getSessionId() || 'unknown',
            terminalService.getCurrentAttemptId() || 'unknown'
          )
          console.log('[QuickTTP UI] AFTER_PERMISSION_AWAIT', {
            granted: permissionResult?.granted,
            locationEnabled: permissionResult?.locationEnabled,
            resultType: typeof permissionResult,
            resultPresent: !!permissionResult
          })
          console.log('[QuickTTP UI] LOCATION_REQUEST_RESULT', { permissionResult })
          
          if (!permissionResult.granted) {
            console.log('[QuickTTP UI] LOCATION_FINAL_RESULT', { granted: false, locationEnabled: permissionResult.locationEnabled })
            console.log('[QuickTTP UI] LOCATION_PERMISSION_DENIED after request', { permissionResult })
            setShowLocationPermissionDialog(true)
            setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
            autoRetryInProgress.current = false
            startInFlight.current = false
            activeAttemptRef.current = false
            console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_PERMISSION_DENIED')
            updatePaymentStateRef('failure', 'location_permission_denied')
            
            const mapped = mapTapToPayError({
              code: 'location_permission_denied',
              message: 'Location permission was denied',
            })
            setMappedError(mapped)
            
            const errorMsg = mapped.message
            setError(errorMsg)
            onPaymentError?.(errorMsg)
            return
          }
          console.log('[QuickTTP UI] LOCATION_PERMISSION_CONTINUING_SAME_ATTEMPT')
        }
        console.log('[QuickTTP UI] LOCATION_FINAL_RESULT', { granted: permissionResult.granted, locationEnabled: permissionResult.locationEnabled })
        
        if (!permissionResult.granted) {
          console.log('[QuickTTP UI] LOCATION_PERMISSION_DENIED_BRANCH')
          throw new Error('Location permission was denied')
        }
        
        if (!permissionResult.locationEnabled) {
          console.log('[QuickTTP UI] LOCATION_SERVICES_DISABLED_BRANCH')
          throw new Error('Location services are disabled')
        }
        
        console.log('[QuickTTP UI] LOCATION_BLOCK_PASSED')
        setLastSuccessfulStage('location_permission_ok')
      }

      // Initialize terminal
      console.log('[QuickTTP UI] ABOUT_TO_INITIALIZE_TERMINAL')
      console.log('[TTP Hook] INITIALIZE_STARTED')
      setLastSuccessfulStage('initializing_terminal')
      const initResult = await withTimeout(
        terminalService.initialize(),
        'TERMINAL_INITIALIZATION',
        TIMEOUTS.TERMINAL_INIT,
        terminalService.getSessionId() || 'unknown',
        terminalService.getCurrentAttemptId() || 'unknown'
      )
      console.log('[TTP Hook] INITIALIZE_COMPLETED', { status: initResult.status })
      if (initResult.status !== 'ready' && initResult.status !== 'connected') {
        console.log('[TTP Hook] INITIALIZE_FAILED', { status: initResult.status })
        throw new Error('Failed to initialize payment terminal')
      }
      setLastSuccessfulStage('initialized')

      // Connect if needed
      if (initResult.status === 'connected') {
        setLastSuccessfulStage('connected')
      } else {
        updatePaymentStateRef('connecting_reader', 'connection_started')
        console.log('[TTP Hook] CONNECTION_STARTED', {
          attemptId: terminalService.getCurrentAttemptId(),
          sessionId: terminalService.getSessionId()
        })
        dispatchTTPEvent('CONNECTION_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader')
        setLastSuccessfulStage('connecting_reader')
        dispatchTTPEvent('CONNECT_PROMISE_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
        
        // Yield two frames to allow React to paint the connecting state before native call
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve())
          })
        })
        
        const localAttemptToken = activeAttemptTokenRef.current
        const connectStartTime = Date.now()
        dispatchTTPEvent('CONNECT_CALL_ENTERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader')

        try {
          const connectResult = await withTimeout(
            terminalService.connectTapToPay(),
            'READER_CONNECTION',
            TIMEOUTS.READER_DISCOVERY,
            terminalService.getSessionId() || 'unknown',
            terminalService.getCurrentAttemptId() || 'unknown'
          )

          // Check if this result belongs to the active attempt
          if (!isResultFromActiveAttempt(localAttemptToken, 'connectTapToPay')) {
            throw new Error('Stale connection result ignored')
          }

          console.log('[TTP Hook] CONNECTION_COMPLETED', { status: connectResult.status })
          dispatchTTPEvent('CONNECTION_COMPLETED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, connectResult.status)
          dispatchTTPEvent('CONNECT_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, connectResult.status)
          if (connectResult.status !== 'connected') {
            console.log('[TTP Hook] CONNECTION_FAILED', { status: connectResult.status })
            throw new Error('Failed to connect to payment terminal')
          }
          setLastSuccessfulStage('connected')
        } catch (connectError: any) {
          const durationMs = Date.now() - connectStartTime
          console.log('[TTP Hook] CONNECT_ERROR_CAUGHT', {
            errorName: connectError?.name,
            errorMessage: connectError?.message,
            errorCode: connectError?.code,
            nativeCode: connectError?.nativeCode,
            technicalCode: connectError?.technicalCode,
            technicalMessage: connectError?.technicalMessage,
            durationMs,
            attemptToken: localAttemptToken,
            terminalSessionId: terminalService.getSessionId(),
            paymentState: paymentStateRef.current,
            timestamp: new Date().toISOString()
          })

          // Dispatch structured rejection diagnostics
          dispatchTTPEvent('CONNECT_PROMISE_REJECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
            errorName: connectError?.name,
            errorMessage: connectError?.message,
            errorCode: connectError?.code,
            nativeCode: connectError?.nativeCode,
            technicalCode: connectError?.technicalCode,
            technicalMessage: connectError?.technicalMessage,
            durationMs,
            attemptToken: localAttemptToken,
            terminalSessionId: terminalService.getSessionId(),
            paymentState: paymentStateRef.current,
            timestamp: new Date().toISOString()
          }))

          // Preserve structured error for outer catch
          throw connectError
        }
      }

      // Start payment collection
      updatePaymentStateRef('creating_payment_intent', 'payment_intent_creation_started')
      console.log('[TTP Hook] PAYMENT_INTENT_CREATION_STARTED', {
        attemptId: terminalService.getCurrentAttemptId(),
        sessionId: terminalService.getSessionId()
      })
      dispatchTTPEvent('PAYMENT_INTENT_CREATION_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'creating_payment_intent')
      
      // Yield two frames to allow React to paint the creating_payment_intent state
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve())
        })
      })
      
      const paymentStartTime = Date.now()
      dispatchTTPEvent('PAYMENT_COLLECTION_PROMISE_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
      
      const paymentPromise = withTimeout(
        terminalService.startTapToPayPayment({
          amountCents,
          currency: 'usd',
          leadId,
          jobId,
          description,
        }),
        'PAYMENT_COLLECTION',
        TIMEOUTS.COLLECT_PAYMENT,
        terminalService.getSessionId() || 'unknown',
        terminalService.getCurrentAttemptId() || 'unknown'
      )

      // Wait for PaymentIntent before showing waiting state
      const startWait = Date.now()
      while (!terminalService.getPaymentIntentId() && Date.now() - startWait < 4000) {
        await new Promise(r => setTimeout(r, 50))
      }
      if (terminalService.getPaymentIntentId()) {
        const paymentIntentId = terminalService.getPaymentIntentId()
        console.log('[TTP Hook] PAYMENT_INTENT_CREATED', {
          paymentIntentId,
          attemptId: terminalService.getCurrentAttemptId(),
          sessionId: terminalService.getSessionId(),
          leadId,
          jobId,
          amountCents
        })
        dispatchTTPEvent('PAYMENT_INTENT_CREATED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'waiting_for_card', 'payment_intent_created')
        updatePaymentStateRef('waiting_for_card')
        setLastSuccessfulStage('payment_intent_created')
      }

      console.log('[TTP Hook] COLLECT_STARTED', {
        attemptId: terminalService.getCurrentAttemptId(),
        sessionId: terminalService.getSessionId()
      })
      dispatchTTPEvent('COLLECT_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'waiting_for_card', 'collect_payment')

      const localAttemptToken = activeAttemptTokenRef.current
      let paymentResult: any

      // Specific try-catch for payment collection to handle cancellation before generic error handler
      try {
        paymentResult = await paymentPromise

        // Check if this result belongs to the active attempt
        if (!isResultFromActiveAttempt(localAttemptToken, 'startTapToPayPayment')) {
          throw new Error('Stale payment result ignored')
        }

        console.log('[TTP Hook] COLLECT_COMPLETED', {
          paymentResult,
          attemptId: terminalService.getCurrentAttemptId(),
          sessionId: terminalService.getSessionId()
        })
        dispatchTTPEvent('COLLECT_COMPLETED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, paymentResult.status)
        dispatchTTPEvent('PAYMENT_COLLECTION_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, paymentResult.status)

        // Normalize the native result status using the new classifier
        const classification = classifyPaymentCollectionOutcome(paymentResult)
        dispatchTTPEvent('PAYMENT_COLLECTION_OUTCOME_CLASSIFIED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, JSON.stringify({
          outcome: classification.outcome,
          matchedBy: classification.matchedBy,
          rawCode: classification.rawCode,
          rawMessage: classification.rawMessage,
          userCanceled: classification.userCanceled
        }))

        // Emit appropriate event based on outcome
        if (classification.outcome === 'succeeded') {
          console.log('[TTP Hook] NATIVE_PAYMENT_SUCCEEDED', {
            status: paymentResult.status,
            outcome: classification.outcome,
            paymentIntentId: terminalService.getPaymentIntentId(),
            attemptId: terminalService.getCurrentAttemptId(),
            sessionId: terminalService.getSessionId()
          })
          dispatchTTPEvent('NATIVE_PAYMENT_SUCCEEDED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, classification.outcome)
        } else if (classification.outcome === 'canceled') {
          console.log('[TTP Hook] NATIVE_PAYMENT_CANCELED', {
            status: paymentResult.status,
            outcome: classification.outcome,
            attemptId: terminalService.getCurrentAttemptId(),
            sessionId: terminalService.getSessionId()
          })
          dispatchTTPEvent('NATIVE_PAYMENT_CANCELED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, classification.outcome)
          updatePaymentStateRef('canceled', 'native_canceled')
          setIsPaymentInProgress(false)
          permissionLock.setTapToPayActive(false)
          startInFlight.current = false
          activeAttemptRef.current = false
          activeAttemptIdRef.current = null
          activeAttemptTokenRef.current = null
          console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_CANCELED')
          return
        } else if (classification.outcome === 'failed') {
          console.log('[TTP Hook] NATIVE_PAYMENT_FAILED', {
            status: paymentResult.status,
            outcome: classification.outcome,
            attemptId: terminalService.getCurrentAttemptId(),
            sessionId: terminalService.getSessionId()
          })
          dispatchTTPEvent('NATIVE_PAYMENT_FAILED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, classification.outcome)
        }
      } catch (collectionError: any) {
        // Serialize the complete error for diagnostics before classification
        const serializedError = serializeNativePaymentError(collectionError)
        dispatchTTPEvent('PAYMENT_COLLECTION_NATIVE_REJECTION_RAW', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, JSON.stringify(serializedError))

        // Classify the error to detect cancellation
        const classification = classifyPaymentCollectionOutcome(collectionError)
        dispatchTTPEvent('PAYMENT_COLLECTION_OUTCOME_CLASSIFIED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, JSON.stringify({
          outcome: classification.outcome,
          matchedBy: classification.matchedBy,
          rawCode: classification.rawCode,
          rawMessage: classification.rawMessage,
          userCanceled: classification.userCanceled
        }))

        if (classification.outcome === 'canceled') {
          console.log('[TTP Hook] PAYMENT_COLLECTION_CANCELED_VIA_ERROR', {
            error: collectionError.message,
            code: collectionError.code,
            nativeCode: collectionError.nativeCode,
            matchedBy: classification.matchedBy,
            userCanceled: classification.userCanceled,
            attemptId: terminalService.getCurrentAttemptId(),
            sessionId: terminalService.getSessionId()
          })
          dispatchTTPEvent('NATIVE_PAYMENT_CANCELED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'native_canceled_error')
          updatePaymentStateRef('canceled', 'native_canceled')
          setIsPaymentInProgress(false)
          permissionLock.setTapToPayActive(false)
          startInFlight.current = false
          activeAttemptRef.current = false
          activeAttemptIdRef.current = null
          activeAttemptTokenRef.current = null
          console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_CANCELED')
          
          // Start cleanup in background - do NOT await to avoid blocking UI
          const paymentIntentId = terminalService.getPaymentIntentId()
          const attemptId = terminalService.getCurrentAttemptId() || undefined
          cleanupCanceledAttempt(paymentIntentId, attemptId).catch(error => {
            console.error('[TTP Hook] Cleanup error (non-blocking):', error)
          })
          
          return
        }

        // Re-throw non-cancellation errors to the generic handler
        throw collectionError
      }

      // Normalize the native result status (for success path)
      const normalizedStatus = normalizeNativePaymentResult(paymentResult.status)

      if (normalizedStatus === 'succeeded') {
        const paymentIntentId = terminalService.getPaymentIntentId()
        console.log('[TTP Hook] RECONCILE_STARTED', {
          paymentIntentId,
          attemptId: terminalService.getCurrentAttemptId(),
          sessionId: terminalService.getSessionId()
        })
        dispatchTTPEvent('RECONCILE_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'processing', 'reconciliation_started')
        
        // Set processing state while reconciling
        updatePaymentStateRef('processing', 'reconciliation_started')
        
        try {
          const reconcileResponse = await fetch('/api/terminal/reconcile-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId }),
          })
          
          console.log('[TTP Hook] RECONCILE_COMPLETED', { paymentIntentId })
          dispatchTTPEvent('RECONCILE_COMPLETED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'processing', 'reconciliation_completed')
          
          // Now commit success
          updatePaymentStateRef('success', 'payment_completed')
          console.log('[TTP Hook] SUCCESS_STATE_ENTERED', {
            paymentIntentId,
            attemptId: terminalService.getCurrentAttemptId(),
            sessionId: terminalService.getSessionId()
          })
          dispatchTTPEvent('SUCCESS_STATE_ENTERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'success')
          
          console.log('[TTP Hook] MODAL_SUCCESS_RENDERED', {
            paymentIntentId,
            attemptId: terminalService.getCurrentAttemptId(),
            sessionId: terminalService.getSessionId()
          })
          dispatchTTPEvent('MODAL_SUCCESS_RENDERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'success')
          
          // Clear flags after success is committed
          setIsPaymentInProgress(false)
          permissionLock.setTapToPayActive(false)
          startInFlight.current = false
          activeAttemptRef.current = false
          activeAttemptIdRef.current = null
          activeAttemptTokenRef.current = null
          console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_SUCCESS')

          // Note: replyflow:payment-completed event is now dispatched by the modal when user dismisses it
          // This prevents the page from refreshing while the success modal is still visible

          onPaymentComplete?.()
        } catch (reconcileError) {
          console.error('[TTP Hook] RECONCILE_FAILED', reconcileError)
          // Still show success even if reconciliation fails - payment was successful
          updatePaymentStateRef('success', 'payment_completed')
          dispatchTTPEvent('MODAL_SUCCESS_RENDERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'success')
          
          // Clear flags
          setIsPaymentInProgress(false)
          permissionLock.setTapToPayActive(false)
          startInFlight.current = false
          activeAttemptRef.current = false
          activeAttemptIdRef.current = null
          activeAttemptTokenRef.current = null
          
          onPaymentComplete?.()
        }
      } else if (normalizedStatus === 'canceled') {
        console.log('[TTP Hook] PAYMENT_CANCELED')
        dispatchTTPEvent('NATIVE_PAYMENT_CANCELED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'native_canceled_result')
        updatePaymentStateRef('canceled', 'native_canceled')
        setIsPaymentInProgress(false)
        permissionLock.setTapToPayActive(false)
        startInFlight.current = false
        activeAttemptRef.current = false
        activeAttemptIdRef.current = null
        activeAttemptTokenRef.current = null
        console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_CANCELED')
        
        // Start cleanup in background - do NOT await to avoid blocking UI
        const paymentIntentId = terminalService.getPaymentIntentId()
        const attemptId = terminalService.getCurrentAttemptId() || undefined
        cleanupCanceledAttempt(paymentIntentId, attemptId).catch(error => {
          console.error('[TTP Hook] Cleanup error (non-blocking):', error)
        })
      } else if (paymentResult.status === 'canceled') {
        dispatchTTPEvent('NATIVE_PAYMENT_CANCELED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'native_canceled_status')
        updatePaymentStateRef('canceled')
        setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
        
        // Start cleanup in background - do NOT await to avoid blocking UI
        const paymentIntentId = terminalService.getPaymentIntentId()
        const attemptId = terminalService.getCurrentAttemptId() || undefined
        cleanupCanceledAttempt(paymentIntentId, attemptId).catch(error => {
          console.error('[TTP Hook] Cleanup error (non-blocking):', error)
        })
      }

    } catch (err: any) {
    console.error('[TTP Hook] START_PAYMENT_FAILED', {
      error: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
      lastSuccessfulStage
    })
    
    // Map the error to user-friendly message
    const mapped = mapTapToPayError({
      code: err.code || err.nativeCode,
      message: err.message,
      nativeCode: err.nativeCode,
      stage: lastSuccessfulStage,
    })
    
    // Check if this is a cancellation and set state accordingly
    const isCancellation = mapped.title === 'Payment canceled'
    updatePaymentStateRef(isCancellation ? 'canceled' : 'failure', isCancellation ? 'user_canceled' : 'error_thrown')
    
    setMappedError(mapped)
    
    const errorMsg = mapped.message
    setError(errorMsg)
    setStructuredError(err as TerminalError)
    setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
    startInFlight.current = false
            activeAttemptRef.current = false
    console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_ERROR')
    onPaymentError?.(errorMsg)
  }
  }, [
    amountCents,
    leadId,
    jobId,
    description,
    isNativeSupported,
    platform,
    isPaymentInProgress,
    terminalService,
    checkLocationPermission,
    requestLocationPermission,
    onPaymentComplete,
    onPaymentError,
    updatePaymentStateRef,
  ])

  // Timeout durations in milliseconds
const TIMEOUTS = {
  PERMISSION_REQUEST: 30000,
  TERMINAL_INIT: 30000,
  READER_DISCOVERY: 45000,
  PAYMENT_INTENT: 30000,
  COLLECT_PAYMENT: 60000,
  CONFIRM_PAYMENT: 45000,
  RECONCILIATION: 30000,
}

// Create a timeout promise that rejects after specified duration
function createTimeout(stage: string, duration: number, sessionId: string, attemptId: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      console.error(`[TTP Hook] TIMEOUT: ${stage} after ${duration}ms`, { sessionId, attemptId })
      reject(new Error(`Timeout: ${stage}`))
    }, duration)
  })
}

// Wrap an async operation with a timeout
async function withTimeout<T>(
  promise: Promise<T>,
  stage: string,
  duration: number,
  sessionId: string,
  attemptId: string
): Promise<T> {
  return Promise.race([
    promise,
    createTimeout(stage, duration, sessionId, attemptId),
  ])
}
  const cancelPayment = useCallback((reason: string = 'user_canceled') => {
    console.log('[QuickTTP UI] CANCEL_PAYMENT_CALLED', { reason, currentPaymentState: paymentState })
    dispatchTTPEvent('RESET_TRIGGERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentState, `cancelPayment:${reason}`)
    setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
    updatePaymentStateRef('canceled', reason)
    setError('')
    setStructuredError(null)
    setMappedError(null)
    autoRetryInProgress.current = false
  }, [updatePaymentStateRef, paymentState, lastSuccessfulStage, isPaymentInProgress])

  // Retry payment
  const retryPayment = useCallback(async () => {
    console.log('[TTP Hook] RETRY_STARTED_AFTER_CONNECT_FAILURE', {
      previousState: paymentState,
      lastSuccessfulStage,
      timestamp: new Date().toISOString()
    })
    dispatchTTPEvent('RETRY_STARTED_AFTER_CONNECT_FAILURE', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentState, 'retry_after_connect_failure')
    setError('')
    setStructuredError(null)
    setMappedError(null)
    await startPayment()
  }, [startPayment, paymentState, lastSuccessfulStage])

  // Retry after cancellation - dedicated function for clean cancellation retry
  // Cleanup function for canceled attempts
  const cleanupCanceledAttempt = useCallback(async (paymentIntentId: string | undefined, attemptId: string | undefined) => {
    console.log('[TTP Hook] CANCELED_ATTEMPT_CLEANUP_STARTED', { paymentIntentId, attemptId })
    dispatchTTPEvent('CANCELED_ATTEMPT_CLEANUP_STARTED', terminalService.getSessionId(), attemptId, 'canceled', 'cleanup_started')

    try {
      if (paymentIntentId) {
        // Update local payment request status to canceled
        console.log('[TTP Hook] CANCELED_LOCAL_ATTEMPT_UPDATE_STARTED', { paymentIntentId })
        dispatchTTPEvent('CANCELED_LOCAL_ATTEMPT_UPDATE_STARTED', terminalService.getSessionId(), attemptId, 'canceled', 'local_update_started')

        const updateResponse = await fetch('/api/terminal/reconcile-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentIntentId, terminalAttemptId: attemptId }),
        })

        if (updateResponse.ok) {
          console.log('[TTP Hook] CANCELED_LOCAL_ATTEMPT_UPDATED', { paymentIntentId })
          dispatchTTPEvent('CANCELED_LOCAL_ATTEMPT_UPDATED', terminalService.getSessionId(), attemptId, 'canceled', 'local_updated')
        } else {
          console.error('[TTP Hook] CANCELED_LOCAL_ATTEMPT_UPDATE_FAILED', { paymentIntentId })
          dispatchTTPEvent('CANCELED_LOCAL_ATTEMPT_UPDATE_FAILED', terminalService.getSessionId(), attemptId, 'canceled', 'local_update_failed')
        }
      }

      // Clear unresolved attempt tracking
      terminalService.clearUnresolvedAttempt()
      console.log('[TTP Hook] CANCELLATION_UNRESOLVED_MARKER_CLEARED')
      dispatchTTPEvent('CANCELLATION_UNRESOLVED_MARKER_CLEARED', terminalService.getSessionId(), attemptId, 'canceled', 'unresolved_cleared')

      console.log('[TTP Hook] CANCELED_ATTEMPT_CLEANUP_COMPLETED', { paymentIntentId, attemptId })
      dispatchTTPEvent('CANCELED_ATTEMPT_CLEANUP_COMPLETED', terminalService.getSessionId(), attemptId, 'ready', 'cleanup_completed')
    } catch (error) {
      console.error('[TTP Hook] CANCELED_ATTEMPT_CLEANUP_FAILED', error)
      dispatchTTPEvent('CANCELED_ATTEMPT_CLEANUP_FAILED', terminalService.getSessionId(), attemptId, 'canceled', 'cleanup_failed')
    }
  }, [terminalService])

  const retryAfterCancellation = useCallback(async () => {
    console.log('[TTP Hook] RETRY_AFTER_CANCELLATION_STARTED', {
      previousState: paymentState,
      timestamp: new Date().toISOString()
    })
    dispatchTTPEvent('RETRY_AFTER_CANCELLATION_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentState, 'retry_after_cancellation')

    // Clear cancellation-specific state
    setError('')
    setStructuredError(null)
    setMappedError(null)
    autoRetryInProgress.current = false

    // Clear all attempt flags to ensure setup controls return
    startInFlight.current = false
    activeAttemptRef.current = false
    activeAttemptIdRef.current = null
    activeAttemptTokenRef.current = null
    setIsPaymentInProgress(false)

    // Clear reset reason to avoid confusion
    setLastResetReason('retry_after_cancellation')

    // Transition to ready state (this will emit STATE_TRANSITION via updatePaymentStateRef)
    updatePaymentStateRef('ready', 'retry_after_cancellation')

    // Complete retry - do NOT auto-start payment
    console.log('[TTP Hook] RETRY_AFTER_CANCELLATION_COMPLETED', {
      paymentState: paymentStateRef.current,
      timestamp: new Date().toISOString()
    })
    dispatchTTPEvent('RETRY_AFTER_CANCELLATION_COMPLETED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentStateRef.current, 'retry_after_cancellation')
  }, [updatePaymentStateRef, paymentState, terminalService])

  // Emergency reset function to clear all UI state
  const resetTapToPayUiState = useCallback((preserveSucceededAttempt: boolean = true) => {
    // Guard: Do not reset if an active attempt is in progress (unless preserving succeeded attempt)
    if (!preserveSucceededAttempt && !canResetPaymentUi('resetTapToPayUiState:emergency_reset')) {
      return
    }
    
    console.log('[TTP Hook] EMERGENCY_RESET', { preserveSucceededAttempt })
    dispatchTTPEvent('RESET_TRIGGERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentState, 'resetTapToPayUiState:emergency_reset')
    setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
    startInFlight.current = false
            activeAttemptRef.current = false
    console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_RESET')
    updatePaymentStateRef('ready', 'emergency_reset')
    setError('')
    setStructuredError(null)
    setMappedError(null)
    autoRetryInProgress.current = false
    setLastSuccessfulStage('none')
    setShowLocationPermissionDialog(false)
    // Note: We don't clear session/attempt IDs here as they're managed by the terminal service
  }, [updatePaymentStateRef, paymentState, lastSuccessfulStage, isPaymentInProgress, canResetPaymentUi])

  const resetToSetup = useCallback((reason: string = 'reset_to_setup') => {
    // Guard: Do not reset if an active attempt is in progress
    if (!canResetPaymentUi(`resetToSetup:${reason}`)) {
      return
    }
    
    console.log('[QuickTTP UI] RESET_TO_SETUP', { reason, currentPaymentState: paymentState })
    dispatchTTPEvent('RESET_TRIGGERED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), paymentState, `resetToSetup:${reason}`)
    setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
    startInFlight.current = false
            activeAttemptRef.current = false
    console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_RESET_TO_SETUP')
    updatePaymentStateRef('ready', reason)
    setError('')
    setStructuredError(null)
    setMappedError(null)
    autoRetryInProgress.current = false
    setShowLocationPermissionDialog(false)
  }, [updatePaymentStateRef, paymentState, lastSuccessfulStage, isPaymentInProgress, canResetPaymentUi])

  return {
    paymentState,
    error,
    structuredError,
    mappedError,
    isPaymentInProgress,
    platform,
    isNativeSupported,
    lastSuccessfulStage,
    lastResetReason,
    locationPermissionGranted,
    locationServicesEnabled,
    locationPermissionState,
    startPayment,
    cancelPayment,
    retryPayment,
    retryAfterCancellation,
    resetTapToPayUiState,
    resetToSetup,
    checkPlatformSupport,
    requestLocationPermission,
    checkLocationPermission,
  }
}