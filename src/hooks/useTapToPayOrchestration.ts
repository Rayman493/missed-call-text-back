'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { 
  logTapToPayEvent, 
  generateCorrelationId, 
  setCorrelationId, 
  getCorrelationId,
  normalizeError,
  updateAppleChecklist
} from '@/lib/tap-to-pay-diagnostics'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { useBusiness } from '@/contexts/BusinessContext'
import ReplyflowStripeTerminal from '@/lib/terminal'
import { Capacitor } from '@capacitor/core'
import type { TerminalError } from '@/lib/terminal'
import { mapTapToPayError } from '@/lib/terminal/error-mapper'
import { permissionLock } from '@/lib/permission-lock'
import { nativePermissionsStore } from '@/lib/native-permissions/native-permissions-store'
import { isNativeCapacitor } from '@/lib/terminal'
import { createEducationPromise, resolveEducation, hasPendingEducationPromise, resetEducationPromise, classifyNativeEducationReturn, type EducationResolution } from '@/lib/education-promise-bridge'
import { maskPhoneNumber } from '@/lib/phone-masking'
import { getDeviceEducationState, setDeviceEducationCompleted } from '@/lib/tap-to-pay-education-persistence'

type PaymentState = 'ready' | 'preparing' | 'connecting_reader' | 'education_pending' | 'education_waiting_for_confirmation' | 'creating_payment_intent' | 'waiting_for_card' | 'processing' | 'success' | 'failure' | 'canceled' | 'pending' | 'ambiguous'

// Runtime state validation helper
function isValidPaymentState(value: string): value is PaymentState {
  const validStates: PaymentState[] = [
    'ready',
    'preparing',
    'connecting_reader',
    'education_pending',
    'education_waiting_for_confirmation',
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
  educationWaitingForConfirmation: boolean
  paymentRequestId: string | null
  lastCompletedAttempt: {
    attemptId: string | null
    outcome: 'success' | 'failure' | 'canceled' | null
    completedAt: string | null
    paymentRequestId: string | null
  }
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
  const { business } = useBusiness()
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
  const [educationWaitingForConfirmation, setEducationWaitingForConfirmation] = useState(false)
  const [lastResetReason, setLastResetReason] = useState<string>('none')
  const [initializationStartTime, setInitializationStartTime] = useState<number | null>(null)
  const [paymentRequestId, setPaymentRequestId] = useState<string | null>(null)
  const [lastCompletedAttempt, setLastCompletedAttempt] = useState<{
    attemptId: string | null
    outcome: 'success' | 'failure' | 'canceled' | null
    completedAt: string | null
    paymentRequestId: string | null
  }>({
    attemptId: null,
    outcome: null,
    completedAt: null,
    paymentRequestId: null,
  })
  const isInitializationPendingRef = useRef(false)
  const preparingTimerRef = useRef<NodeJS.Timeout | null>(null)

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
      educationWaitingForConfirmation: false,
      paymentRequestId: null,
      lastCompletedAttempt: {
        attemptId: null,
        outcome: null,
        completedAt: null,
        paymentRequestId: null,
      },
      startPayment: async () => {},
      cancelPayment: () => {},
      retryPayment: async () => {},
      retryAfterCancellation: async () => {},
      resetTapToPayUiState: () => {},
      resetToSetup: () => {},
      checkPlatformSupport: async () => ({ platform: 'web', isNativeSupported: false }),
      requestLocationPermission: async () => ({ granted: true, locationEnabled: true, canAskAgain: true }),
      checkLocationPermission: async () => ({ granted: true, locationEnabled: true, canAskAgain: true }),
    }
  }
  
  const paymentStateRef = useRef<PaymentState>(paymentState)
  const autoRetryInProgress = useRef(false)
  const connectionRetryAttempted = useRef(false)
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

    // Log state transition to diagnostic timeline
    const correlationId = getCorrelationId() ?? undefined
    logTapToPayEvent('STATE_TRANSITION', {
      correlationId,
      attemptId: terminalService.getCurrentAttemptId() ?? undefined,
      sessionId: terminalService.getSessionId(),
      source: 'orchestration',
      paymentState: newState,
      stage: 'state_transition',
      meta: {
        from: previousState,
        to: newState,
        reason
      }
    }).catch(() => {})

    // Dispatch event for timeline (for window event listeners)
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

  // Subscribe to connection status for progress tracking
  useEffect(() => {
    const unsubscribe = terminalService.subscribeToConnectionStatus((status) => {
      console.log('[TTP Hook] Connection status changed:', status)
      
      // Map connection status to payment states
      if (status === 'connecting' && paymentStateRef.current === 'ready') {
        // Show preparing state if initialization takes >300ms
        if (initializationStartTime) {
          const elapsed = Date.now() - initializationStartTime
          if (elapsed > 300) {
            updatePaymentStateRef('preparing', 'connection_progress')
          }
        }
      } else if (status === 'connected') {
        // Connection complete, proceed with payment flow
        if (paymentStateRef.current === 'preparing' || paymentStateRef.current === 'connecting_reader') {
          setLastSuccessfulStage('connected')
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [initializationStartTime])

  // Independent 300ms timer for preparing UI
  useEffect(() => {
    // Clear any existing timer
    if (preparingTimerRef.current) {
      clearTimeout(preparingTimerRef.current)
      preparingTimerRef.current = null
    }
    
    if (isInitializationPendingRef.current && initializationStartTime && paymentStateRef.current === 'ready') {
      preparingTimerRef.current = setTimeout(() => {
        const elapsed = Date.now() - initializationStartTime
        // Check ref (not state) to avoid stale closure
        if (elapsed >= 300 && isInitializationPendingRef.current && paymentStateRef.current === 'ready') {
          updatePaymentStateRef('preparing', 'initialization_timeout')
        }
        preparingTimerRef.current = null
      }, 300)
    }
    
    return () => {
      if (preparingTimerRef.current) {
        clearTimeout(preparingTimerRef.current)
        preparingTimerRef.current = null
      }
    }
  }, [initializationStartTime])

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

  // Education check function for first-time Tap to Pay users
  const checkAndPresentEducation = useCallback(async (): Promise<{ completed: boolean; method: string; reason?: string }> => {
    console.log('[TTP Hook] checkAndPresentEducation called')
    const educationStartTime = Date.now()
    
    try {
      dispatchTTPEvent('EDUCATION_REQUIRED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education')
      dispatchTTPEvent('EDUCATION_ELIGIBILITY_CHECK_STARTED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education')
      await logTapToPayEvent('EDUCATION_ELIGIBILITY_CHECK_STARTED', {
        phase: 'education',
        sessionId: terminalService.getSessionId() || undefined,
        attemptId: terminalService.getCurrentAttemptId() || undefined,
        paymentState: 'education'
      })
      
      // Try native ProximityReaderDiscovery on iOS 18+
      const nativeCallStartTime = Date.now()
      dispatchTTPEvent('EDUCATION_NATIVE_CALL_STARTED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'native_ios18')
      await logTapToPayEvent('EDUCATION_NATIVE_CALL_STARTED', {
        phase: 'education',
        sessionId: terminalService.getSessionId() || undefined,
        attemptId: terminalService.getCurrentAttemptId() || undefined,
        paymentState: 'education',
        meta: { method: 'native_ios18' }
      })
      updateAppleChecklist('nativeIos18EducationAttempted', 'shown')

      const result = await ReplyflowStripeTerminal.presentMerchantEducation()
      
      const nativeCallDurationMs = Date.now() - nativeCallStartTime
      dispatchTTPEvent('EDUCATION_NATIVE_CALL_RETURNED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', result.completionStatus || 'unknown')
      await logTapToPayEvent('EDUCATION_NATIVE_CALL_RETURNED', {
        phase: 'education',
        sessionId: terminalService.getSessionId() || undefined,
        attemptId: terminalService.getCurrentAttemptId() || undefined,
        paymentState: 'education',
        durationMs: nativeCallDurationMs,
        meta: { 
          method: result.method, 
          presented: result.presented, 
          completionStatus: result.completionStatus, 
          requiresConfirmation: result.requiresConfirmation,
          reason: result.reason 
        }
      })
      
      // Classify the native return value
      const classifiedStatus = classifyNativeEducationReturn(result.presented, result.completionStatus, result.requiresConfirmation)
      console.log('[TTP Hook] Native education classified as:', classifiedStatus)
      
      if (result.presented && result.method === 'native_ios18') {
        console.log('[TTP Hook] Native education presented, completionStatus:', result.completionStatus)
        dispatchTTPEvent('EDUCATION_PRESENTED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'native_ios18')
        await logTapToPayEvent('EDUCATION_PRESENTED', {
          phase: 'education',
          sessionId: terminalService.getSessionId() || undefined,
          attemptId: terminalService.getCurrentAttemptId() || undefined,
          paymentState: 'education',
          meta: { method: 'native_ios18', classifiedStatus }
        })
        updateAppleChecklist('merchantEducationShown', 'shown')
        
        // Apple's presentContent does not await dismissal
        // We need explicit confirmation from the user
        if (result.requiresConfirmation) {
          console.log('[TTP Hook] Native education requires explicit confirmation')
          dispatchTTPEvent('EDUCATION_COMPLETION_CALLBACK', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'confirmation_required')
          await logTapToPayEvent('EDUCATION_COMPLETION_CALLBACK', {
            phase: 'education',
            sessionId: terminalService.getSessionId() || undefined,
            attemptId: terminalService.getCurrentAttemptId() || undefined,
            paymentState: 'education',
            meta: { requiresConfirmation: true }
          })

          // Create promise bridge for UI confirmation with 5-minute timeout
          const educationPromise = createEducationPromise(5 * 60 * 1000) // 5 minutes
          await logTapToPayEvent('EDUCATION_PROMISE_CREATED', {
            phase: 'education',
            sessionId: terminalService.getSessionId() || undefined,
            attemptId: terminalService.getCurrentAttemptId() || undefined,
            paymentState: 'education',
            meta: { correlationId: getCorrelationId(), timeoutMs: 5 * 60 * 1000 }
          })

          // Set state to indicate waiting for confirmation
          setEducationWaitingForConfirmation(true)
          updatePaymentStateRef('education_waiting_for_confirmation', 'education_awaiting_confirmation')
          setLastSuccessfulStage('education_presented')

          // Await user confirmation
          const resolution = await educationPromise

          // Clear waiting state
          setEducationWaitingForConfirmation(false)

          console.log('[TTP Hook] Education resolution:', resolution)
          await logTapToPayEvent('EDUCATION_PROMISE_RESOLVED', {
            phase: 'education',
            sessionId: terminalService.getSessionId() || undefined,
            attemptId: terminalService.getCurrentAttemptId() || undefined,
            paymentState: 'education_waiting_for_confirmation',
            meta: { resolution, correlationId: getCorrelationId() }
          })

          dispatchTTPEvent('EDUCATION_DISMISSED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', String(resolution))
          await logTapToPayEvent('EDUCATION_DISMISSED', {
            phase: 'education',
            sessionId: terminalService.getSessionId() || undefined,
            attemptId: terminalService.getCurrentAttemptId() || undefined,
            paymentState: 'education_waiting_for_confirmation',
            meta: { resolution }
          })
          
          if (resolution === 'timeout') {
            console.log('[TTP Hook] Education timed out')
            const educationDurationMs = Date.now() - educationStartTime
            dispatchTTPEvent('EDUCATION_TIMEOUT', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'timeout')
            await logTapToPayEvent('EDUCATION_TIMEOUT', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: educationDurationMs,
              meta: { reason: 'timeout' }
            })
            return { completed: false, method: 'native_ios18', reason: 'timeout' }
          }
          
          if (resolution === 'canceled' || resolution === 'dismissed') {
            console.log('[TTP Hook] Education canceled/dismissed by user')
            const educationDurationMs = Date.now() - educationStartTime
            dispatchTTPEvent('EDUCATION_CANCELED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'user_canceled')
            await logTapToPayEvent('EDUCATION_CANCELED', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: educationDurationMs,
              meta: { reason: resolution }
            })
            return { completed: false, method: 'native_ios18', reason: resolution }
          }
          
          if (resolution === 'failed') {
            console.log('[TTP Hook] Education failed')
            const educationDurationMs = Date.now() - educationStartTime
            dispatchTTPEvent('EDUCATION_FAILED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'failed')
            await logTapToPayEvent('EDUCATION_FAILED', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: educationDurationMs,
              meta: { reason: 'failed' }
            })
            return { completed: false, method: 'native_ios18', reason: 'failed' }
          }
          
          console.log('[TTP Hook] Education confirmed by user')
          dispatchTTPEvent('EDUCATION_CONFIRMED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'confirmed')
          await logTapToPayEvent('EDUCATION_CONFIRMED', {
            phase: 'education',
            sessionId: terminalService.getSessionId() || undefined,
            attemptId: terminalService.getCurrentAttemptId() || undefined,
            paymentState: 'education'
          })
          updateAppleChecklist('paymentHeldUntilEducationCompleted', 'shown')

          // User confirmed completion, persist it
          try {
            const persistenceStartTime = Date.now()
            const response = await fetch('/api/business/tap-to-pay-education', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
            const persistenceDurationMs = Date.now() - persistenceStartTime
            
            if (response.ok) {
              console.log('[TTP Hook] Education completion persisted after confirmation')
              dispatchTTPEvent('EDUCATION_GATE_VERIFIED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'persisted')
              await logTapToPayEvent('EDUCATION_GATE_VERIFIED', {
                phase: 'education',
                sessionId: terminalService.getSessionId() || undefined,
                attemptId: terminalService.getCurrentAttemptId() || undefined,
                paymentState: 'education',
                durationMs: persistenceDurationMs
              })
              // Update local business state immediately to avoid stale state
              if (business) {
                const businessAny = business as any
                businessAny.tap_to_pay_education_completed_at = new Date().toISOString()
              }
              const educationDurationMs = Date.now() - educationStartTime
              dispatchTTPEvent('PAYMENT_FLOW_RESUMED_AFTER_EDUCATION', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'resumed')
              await logTapToPayEvent('PAYMENT_FLOW_RESUMED_AFTER_EDUCATION', {
                phase: 'education',
                sessionId: terminalService.getSessionId() || undefined,
                attemptId: terminalService.getCurrentAttemptId() || undefined,
                paymentState: 'education',
                durationMs: educationDurationMs
              })
              return { completed: true, method: 'native_ios18' }
            } else {
              console.error('[TTP Hook] Failed to persist education completion')
              dispatchTTPEvent('EDUCATION_FAILED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'persistence_failed')
              await logTapToPayEvent('EDUCATION_FAILED', {
                phase: 'education',
                sessionId: terminalService.getSessionId() || undefined,
                attemptId: terminalService.getCurrentAttemptId() || undefined,
                paymentState: 'education',
                durationMs: Date.now() - educationStartTime,
                meta: { reason: 'persistence_failed', httpStatus: response.status }
              })
              return { completed: false, method: 'native_ios18', reason: 'persistence_failed' }
            }
          } catch (error) {
            console.error('[TTP Hook] Error persisting education completion:', error)
            const errorObj = error as Error
            dispatchTTPEvent('EDUCATION_FAILED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'persistence_error')
            await logTapToPayEvent('EDUCATION_FAILED', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: Date.now() - educationStartTime,
              normalizedErrorMessage: errorObj.message,
              meta: { reason: 'persistence_error' }
            })
            return { completed: false, method: 'native_ios18', reason: 'persistence_error' }
          }
        }
        
        // If confirmation not required, persist completion immediately
        try {
          const persistenceStartTime = Date.now()
          const response = await fetch('/api/business/tap-to-pay-education', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          const persistenceDurationMs = Date.now() - persistenceStartTime
          
          if (response.ok) {
            console.log('[TTP Hook] Education completion persisted')
            dispatchTTPEvent('EDUCATION_GATE_VERIFIED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'persisted')
            await logTapToPayEvent('EDUCATION_GATE_VERIFIED', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: persistenceDurationMs
            })
            // Update local business state immediately to avoid stale state
            if (business) {
              const businessAny = business as any
              businessAny.tap_to_pay_education_completed_at = new Date().toISOString()
            }
            const educationDurationMs = Date.now() - educationStartTime
            dispatchTTPEvent('PAYMENT_FLOW_RESUMED_AFTER_EDUCATION', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'resumed')
            await logTapToPayEvent('PAYMENT_FLOW_RESUMED_AFTER_EDUCATION', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: educationDurationMs
            })
            return { completed: true, method: 'native_ios18' }
          } else {
            console.error('[TTP Hook] Failed to persist education completion')
            dispatchTTPEvent('EDUCATION_FAILED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'persistence_failed')
            await logTapToPayEvent('EDUCATION_FAILED', {
              phase: 'education',
              sessionId: terminalService.getSessionId() || undefined,
              attemptId: terminalService.getCurrentAttemptId() || undefined,
              paymentState: 'education',
              durationMs: Date.now() - educationStartTime,
              meta: { reason: 'persistence_failed', httpStatus: response.status }
            })
            return { completed: false, method: 'native_ios18', reason: 'persistence_failed' }
          }
        } catch (error) {
          console.error('[TTP Hook] Error persisting education completion:', error)
          const errorObj = error as Error
          dispatchTTPEvent('EDUCATION_FAILED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'persistence_error')
          await logTapToPayEvent('EDUCATION_FAILED', {
            phase: 'education',
            sessionId: terminalService.getSessionId() || undefined,
            attemptId: terminalService.getCurrentAttemptId() || undefined,
            paymentState: 'education',
            durationMs: Date.now() - educationStartTime,
            normalizedErrorMessage: errorObj.message,
            meta: { reason: 'persistence_error' }
          })
          return { completed: false, method: 'native_ios18', reason: 'persistence_error' }
        }
      } else {
        console.log('[TTP Hook] Native education not available, using custom modal:', result.reason)
        dispatchTTPEvent('EDUCATION_PRESENTATION_STARTED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', 'fallback')
        await logTapToPayEvent('EDUCATION_PRESENTATION_STARTED', {
          phase: 'education',
          sessionId: terminalService.getSessionId() || undefined,
          attemptId: terminalService.getCurrentAttemptId() || undefined,
          paymentState: 'education',
          meta: { method: 'fallback', reason: result.reason }
        })
        
        // For iOS < 18 or when native fails, use custom modal with promise bridge
        const educationPromise = createEducationPromise(5 * 60 * 1000) // 5 minutes
        const resolution = await educationPromise
        
        console.log('[TTP Hook] Custom education resolution:', resolution)
        dispatchTTPEvent('EDUCATION_DISMISSED', terminalService.getSessionId() || undefined, terminalService.getCurrentAttemptId() || undefined, 'education', String(resolution))
        await logTapToPayEvent('EDUCATION_DISMISSED', {
          phase: 'education',
          sessionId: terminalService.getSessionId() || undefined,
          attemptId: terminalService.getCurrentAttemptId() || undefined,
          paymentState: 'education',
          meta: { resolution, method: 'fallback' }
        })
        
        if (resolution === 'timeout') {
          console.log('[TTP Hook] Custom education timed out')
          return { completed: false, method: 'fallback', reason: 'timeout' }
        }
        
        if (resolution === 'canceled' || resolution === 'dismissed') {
          console.log('[TTP Hook] Custom education canceled/dismissed by user')
          return { completed: false, method: 'fallback', reason: resolution }
        }
        
        if (resolution === 'failed') {
          console.log('[TTP Hook] Custom education failed')
          return { completed: false, method: 'fallback', reason: 'failed' }
        }
        
        // User completed custom education, persist it
        try {
          const response = await fetch('/api/business/tap-to-pay-education', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          if (response.ok) {
            console.log('[TTP Hook] Custom education completion persisted')
            // Update local business state immediately to avoid stale state
            if (business) {
              const businessAny = business as any
              businessAny.tap_to_pay_education_completed_at = new Date().toISOString()
            }
            return { completed: true, method: 'fallback' }
          } else {
            console.error('[TTP Hook] Failed to persist education completion')
            return { completed: false, method: 'fallback', reason: 'persistence_failed' }
          }
        } catch (error) {
          console.error('[TTP Hook] Error persisting education completion:', error)
          return { completed: false, method: 'fallback', reason: 'persistence_error' }
        }
      }
    } catch (error) {
      console.error('[TTP Hook] Failed to present education:', error)
      return { completed: false, method: 'fallback', reason: 'presentation_error' }
    }
  }, [business])

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
        
        // Get the unresolved attempt ID from localStorage
        const unresolvedAttemptId = typeof window !== 'undefined' ? localStorage.getItem('terminal_unresolved_attempt_id') : null
        
        if (!unresolvedAttemptId) {
          console.log('[TTP Hook] No unresolved attempt ID found in localStorage')
          clearTimeout(timeoutId)
          setPaymentState('ready')
          setLastSuccessfulStage('none')
          dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'no_unresolved_attempt')
          return
        }
        
        const response = await fetch(`/api/terminal/attempt-status?terminalAttemptId=${unresolvedAttemptId}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
        
        if (!response.ok) {
          console.error('[TTP Hook] Failed to check attempt status', response.status)
          clearTimeout(timeoutId)
          setPaymentState('ready')
          setLastSuccessfulStage('none')
          dispatchTTPEvent('RECOVERY_PROMISE_REJECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, `status_${response.status}`)
          return
        }
        
        const data = await response.json()
        
        // Map the endpoint response to the expected format
        if (data.status === 'paid' || data.status === 'succeeded') {
          console.log('[TTP Hook] Previous attempt succeeded, showing success')
          clearTimeout(timeoutId)
          setPaymentState('success')
          setLastSuccessfulStage('payment_completed')
          onPaymentComplete?.()
          startInFlight.current = false
          activeAttemptRef.current = false
          console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_SUCCESS')
          dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'previous_attempt_succeeded')
        } else if (data.status === 'canceled' || data.status === 'failed' || data.status === 'not_found') {
          console.log('[TTP Hook] Previous attempt failed/canceled/not_found, clearing and transitioning to ready')
          clearTimeout(timeoutId)
          // Clear stale attempt and transition to ready, not canceled
          // Canceled state is only for current session cancellations
          setPaymentState('ready')
          setLastSuccessfulStage('none')
          dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'previous_attempt_cleared')
        } else {
          // Still pending or processing, clear it
          console.log('[TTP Hook] Previous attempt stale (pending/processing), clearing and transitioning to ready')
          clearTimeout(timeoutId)
          setPaymentState('ready')
          setLastSuccessfulStage('none')
          dispatchTTPEvent('RECOVERY_PROMISE_RESOLVED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), undefined, 'stale_attempt_cleared')
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
    // Generate correlation ID for this attempt
    const correlationId = generateCorrelationId()
    setCorrelationId(correlationId)
    
    console.log('[TTP Hook] START_PAYMENT_ENTERED', {
      correlationId,
      isNativeSupported,
      platform,
      amountCents,
      leadId,
      jobId,
      previousState: paymentState
    })

    // Clear last completed attempt when starting new payment (attempt isolation)
    setLastCompletedAttempt({
      attemptId: null,
      outcome: null,
      completedAt: null,
      paymentRequestId: null,
    })
    console.log('[TTP Hook] LAST_COMPLETED_ATTEMPT_CLEARED', { reason: 'new_payment_started' })

    // Log payment attempt started
    await logTapToPayEvent('PAYMENT_ATTEMPT_STARTED', {
      correlationId,
      source: 'orchestration',
      paymentState,
      meta: {
        platform,
        amountCents,
        leadId,
        jobId,
        isNativeSupported
      }
    })

    // Guard: Prevent duplicate start calls when attempt is already in flight
    if (startInFlight.current || activeAttemptRef.current) {
      console.log('[TTP Hook] START_IGNORED_ALREADY_IN_FLIGHT', {
        correlationId,
        startInFlight: startInFlight.current,
        activeAttempt: activeAttemptRef.current,
      })
      dispatchTTPEvent('START_IGNORED_ALREADY_IN_FLIGHT', terminalService.getSessionId(), terminalService.getCurrentAttemptId())
      await logTapToPayEvent('DUPLICATE_ATTEMPT_IGNORED', {
        correlationId,
        source: 'orchestration',
        paymentState,
        meta: {
          startInFlight: startInFlight.current,
          activeAttempt: activeAttemptRef.current
        }
      })
      return
    }

    if (!isNativeSupported) {
      console.log('[TTP Hook] VALIDATION_FAILED: Native support check failed', {
        correlationId,
        platform,
        isNativeSupported,
        nextState: 'ready'
      })
      await logTapToPayEvent('PLATFORM_VALIDATION_FAILED', {
        correlationId,
        source: 'orchestration',
        paymentState,
        normalizedErrorCode: 'unsupported_device',
        normalizedErrorMessage: 'Tap to Pay is only available on the mobile app',
        meta: {
          platform,
          isNativeSupported
        }
      })
      if (platform === 'web') {
        const errorMsg = 'Tap to Pay is only available on the mobile app'
        setError(errorMsg)
        onPaymentError?.(errorMsg)
      }
      return
    }
    console.log('[TTP Hook] VALIDATION_PASSED: Native support', { correlationId, platform })

    // Minimum amount validation
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || Math.floor(amountCents) !== amountCents) {
      console.log('[TTP Hook] VALIDATION_FAILED: Invalid amount format', { correlationId, amountCents })
      await logTapToPayEvent('AMOUNT_VALIDATION_FAILED', {
        correlationId,
        source: 'orchestration',
        paymentState,
        normalizedErrorCode: 'unknown',
        normalizedErrorMessage: 'Invalid amount format',
        meta: { amountCents }
      })
      const errorMsg = 'Invalid amount. Please enter a valid amount.'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }
    if (amountCents < 50) {
      console.log('[TTP Hook] VALIDATION_FAILED: Amount below minimum', { correlationId, amountCents })
      await logTapToPayEvent('AMOUNT_VALIDATION_FAILED', {
        correlationId,
        source: 'orchestration',
        paymentState,
        normalizedErrorCode: 'unknown',
        normalizedErrorMessage: 'Amount must be at least $0.50',
        meta: { amountCents }
      })
      const errorMsg = 'Amount must be at least $0.50.'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }
    console.log('[TTP Hook] VALIDATION_PASSED: Amount', { correlationId, amountCents })

    // Double-tap protection
    if (isPaymentInProgress) {
      console.log('[TTP Hook] Payment already in progress, ignoring')
      await logTapToPayEvent('DUPLICATE_ATTEMPT_IGNORED', {
        correlationId,
        source: 'orchestration',
        paymentState,
        normalizedErrorMessage: 'Payment already in progress'
      })
      return
    }

    autoRetryInProgress.current = false

    // Check for unresolved attempt
    const unresolvedAttemptId = terminalService.getUnresolvedAttempt()
    if (unresolvedAttemptId) {
      console.log('[TTP Hook] Unresolved attempt found:', { correlationId, unresolvedAttemptId })
      updatePaymentStateRef('ambiguous', 'unresolved_attempt_found')
      await logTapToPayEvent('UNRESOLVED_ATTEMPT_DETECTED', {
        correlationId,
        source: 'orchestration',
        paymentState: 'ambiguous',
        normalizedErrorMessage: 'Please resolve the previous payment status first',
        meta: { unresolvedAttemptId }
      })
      const errorMsg = 'Please resolve the previous payment status first'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }

    // In-flight guard to prevent repeated starts
    if (startInFlight.current) {
      console.log('[QuickTTP UI] START_IGNORED_ALREADY_IN_FLIGHT')
      await logTapToPayEvent('DUPLICATE_ATTEMPT_IGNORED', {
        correlationId,
        source: 'orchestration',
        paymentState,
        normalizedErrorMessage: 'Start already in flight'
      })
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
      correlationId,
      sessionId: terminalService.getSessionId(),
      attemptId: currentAttemptId,
      attemptToken
    })
    dispatchTTPEvent('ATTEMPT_STARTED', terminalService.getSessionId(), currentAttemptId)
    await logTapToPayEvent('ATTEMPT_STARTED', {
      correlationId,
      attemptId: currentAttemptId || undefined,
      sessionId: terminalService.getSessionId(),
      source: 'orchestration',
      paymentState: 'preparing',
      stage: 'start_payment',
      meta: { attemptToken }
    })

    setIsPaymentInProgress(true)
    permissionLock.setTapToPayActive(true)
    updatePaymentStateRef('preparing', 'start_payment_called')
    updateAppleChecklist('tapToPayButtonVisible', 'shown')
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
      setInitializationStartTime(Date.now())
      isInitializationPendingRef.current = true
      let initResult: { status: string }
      try {
        initResult = await withTimeout(
          terminalService.initialize(),
          'TERMINAL_INITIALIZATION',
          TIMEOUTS.TERMINAL_INIT,
          terminalService.getSessionId() || 'unknown',
          terminalService.getCurrentAttemptId() || 'unknown'
        )
        isInitializationPendingRef.current = false
        // Synchronously clear timer
        if (preparingTimerRef.current) {
          clearTimeout(preparingTimerRef.current)
          preparingTimerRef.current = null
        }
        console.log('[TTP Hook] INITIALIZE_COMPLETED', { status: initResult.status })
        if (initResult.status !== 'ready' && initResult.status !== 'connected') {
          console.log('[TTP Hook] INITIALIZE_FAILED', { status: initResult.status })
          throw new Error('Failed to initialize payment terminal')
        }
        setLastSuccessfulStage('initialized')
      } catch (error) {
        isInitializationPendingRef.current = false
        // Synchronously clear timer
        if (preparingTimerRef.current) {
          clearTimeout(preparingTimerRef.current)
          preparingTimerRef.current = null
        }
        throw error
      }

      // Enforce education check BEFORE reader connection (iOS only)
      // This prevents the Swift education presentation from interfering with active discovery
      const isIOS = Capacitor.getPlatform() === 'ios'
      if (isIOS && business?.id) {
        console.log('[TTP Hook] EDUCATION_GATE: Checking device-scoped education status')
        
        // Device-scoped education is authoritative
        const deviceEducationState = await getDeviceEducationState(business.id)
        const educationRequired = !deviceEducationState.completed
        
        // Log both device and business state for diagnostics
        await logTapToPayEvent('EDUCATION_GATE_DECISION', {
          correlationId: getCorrelationId() ?? undefined,
          attemptId: terminalService.getCurrentAttemptId() ?? undefined,
          sessionId: terminalService.getSessionId(),
          source: 'orchestration',
          paymentState: 'education_pending',
          stage: 'education_gate',
          meta: {
            businessId: business.id,
            businessEducationCompletedAt: (business as any).tap_to_pay_education_completed_at,
            deviceEducationCompleted: deviceEducationState.completed,
            deviceEducationCompletedAt: deviceEducationState.completedAt,
            deviceEducationVersion: deviceEducationState.educationVersion,
            educationRequired,
            educationGateSource: 'device_scoped'
          }
        }).catch(() => {})
        
        if (educationRequired) {
          console.log('[TTP Hook] EDUCATION_REQUIRED: Device education not completed')
          updatePaymentStateRef('education_pending', 'education_check_started')
          dispatchTTPEvent('EDUCATION_CHECK_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'education_pending')
          
          const educationResult = await checkAndPresentEducation()
          
          if (!educationResult.completed) {
            // Education was canceled or failed - do not proceed to payment
            console.log('[TTP Hook] EDUCATION_NOT_COMPLETED: Canceling payment flow', educationResult)
            dispatchTTPEvent('EDUCATION_CANCELED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'education_pending', JSON.stringify(educationResult))
            updatePaymentStateRef('canceled', 'education_canceled')
            throw new Error('Education required before payment. Please complete the Tap to Pay education guide.')
          }
          
          console.log('[TTP Hook] EDUCATION_COMPLETED: Persisting device education state')
          // Persist device-scoped education completion
          try {
            await setDeviceEducationCompleted(business.id)
            console.log('[TTP Hook] Device education persisted successfully')
            
            // Also persist to business-level for audit purposes only (not used for gate)
            const response = await fetch('/api/business/tap-to-pay-education', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
            if (response.ok) {
              console.log('[TTP Hook] Business-level education audit record updated')
              // Update local business state immediately to avoid stale state
              const businessAny = business as any
              businessAny.tap_to_pay_education_completed_at = new Date().toISOString()
            } else {
              console.warn('[TTP Hook] Failed to update business-level audit record (non-critical)')
            }
          } catch (error) {
            console.error('[TTP Hook] Failed to persist education state:', error)
            // Continue anyway - native education was completed
          }
          
          console.log('[TTP Hook] EDUCATION_COMPLETED: Proceeding to reader connection')
          dispatchTTPEvent('EDUCATION_COMPLETED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'education_pending')
        } else {
          console.log('[TTP Hook] EDUCATION_SKIPPED: Device education already completed')
          dispatchTTPEvent('EDUCATION_SKIPPED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'education_pending', 'device_completed')
        }
      }

      // Check Apple account linkage status before connecting (iOS compliance requirement)
      let accountLinkedBeforeConnect = true
      if (isIOS) {
        try {
          console.log('[TTP Hook] ACCOUNT_LINKAGE_CHECK: Checking Apple Tap to Pay account linkage status')
          const linkageResult = await terminalService.isTapToPayAccountLinked()
          accountLinkedBeforeConnect = linkageResult.isLinked
          console.log('[TTP Hook] ACCOUNT_LINKAGE_STATUS', { isLinked: accountLinkedBeforeConnect })
          dispatchTTPEvent('ACCOUNT_LINKAGE_CHECKED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', String(accountLinkedBeforeConnect))
        } catch (error) {
          console.warn('[TTP Hook] ACCOUNT_LINKAGE_CHECK_FAILED: Proceeding with connection', error)
          // Proceed with connection even if check fails - Apple Terms will be presented if needed
        }
      }

      // Connect if needed
      if (initResult.status === 'connected') {
        setLastSuccessfulStage('connected')
      } else {
        updatePaymentStateRef('connecting_reader', 'connection_started')
        console.log('[TTP Hook] CONNECTION_STARTED', {
          attemptId: terminalService.getCurrentAttemptId(),
          sessionId: terminalService.getSessionId(),
          accountLinkedBeforeConnect
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

        // Determine timeout based on whether this is first-ever connection
        const isFirstConnectionOnDevice = terminalService.getIsFirstConnectionOnDevice()
        const connectionTimeout = isFirstConnectionOnDevice ? TIMEOUTS.READER_DISCOVERY_COLD : TIMEOUTS.READER_DISCOVERY_WARM
        
        console.log('[TTP Hook] CONNECTION_TIMEOUT_SELECTED', {
          isFirstConnectionOnDevice,
          timeoutMs: connectionTimeout,
          sessionId: terminalService.getSessionId(),
          attemptId: terminalService.getCurrentAttemptId()
        })

        try {
          const connectResult = await withTimeout(
            terminalService.connectTapToPay(),
            'READER_CONNECTION',
            connectionTimeout,
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

          // Re-check Apple account linkage status after connection to verify Apple Terms were accepted (iOS compliance requirement)
          if (isIOS && !accountLinkedBeforeConnect) {
            try {
              console.log('[TTP Hook] ACCOUNT_LINKAGE_POST_CONNECT: Re-checking after connection (Terms may have been presented)')
              const linkageResult = await terminalService.isTapToPayAccountLinked()
              const accountLinkedAfterConnect = linkageResult.isLinked
              console.log('[TTP Hook] ACCOUNT_LINKAGE_POST_CONNECT_STATUS', {
                wasLinkedBefore: accountLinkedBeforeConnect,
                isLinkedAfter: accountLinkedAfterConnect
              })
              dispatchTTPEvent('ACCOUNT_LINKAGE_POST_CONNECT_CHECKED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', String(accountLinkedAfterConnect))

              // If still not linked after connection, stop payment flow and show setup error
              if (!accountLinkedAfterConnect) {
                console.error('[TTP Hook] ACCOUNT_LINKAGE_POST_CONNECT_FALSE: Apple Terms not accepted, stopping payment flow')
                dispatchTTPEvent('ACCOUNT_LINKAGE_POST_CONNECT_FALSE_STOPPED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader')
                throw new Error('Tap to Pay setup isn\'t complete yet. Please accept the Apple Terms in Settings.')
              }
            } catch (error: any) {
              console.warn('[TTP Hook] ACCOUNT_LINKAGE_POST_CONNECT_CHECK_FAILED:', error)
              // If it's a known error about account linkage, surface it
              if (error?.message?.includes('setup') || error?.message?.includes('Terms')) {
                throw error // Re-throw to stop payment flow
              }
              // For other errors, log but continue (non-critical - connection succeeded)
            }
          }

          setLastSuccessfulStage('connected')
        } catch (connectError: any) {
          const durationMs = Date.now() - connectStartTime
          const isTimeout = connectError?.message?.includes('Timeout') || connectError?.name === 'Error'
          
          console.log('[TTP Hook] CONNECT_ERROR_CAUGHT', {
            errorName: connectError?.name,
            errorMessage: connectError?.message,
            errorCode: connectError?.code,
            nativeCode: connectError?.nativeCode,
            technicalCode: connectError?.technicalCode,
            technicalMessage: connectError?.technicalMessage,
            durationMs,
            isTimeout,
            attemptToken: localAttemptToken,
            terminalSessionId: terminalService.getSessionId(),
            paymentState: paymentStateRef.current,
            timestamp: new Date().toISOString()
          })

          // On timeout, check if native connection actually succeeded concurrently
          if (isTimeout) {
            const nativeStatus = terminalService.getConnectionStatus()
            console.log('[TTP Hook] TIMEOUT_NATIVE_STATUS_CHECK', {
              nativeStatus,
              readerId: terminalService.getReaderId(),
              sessionId: terminalService.getSessionId()
            })
            
            // If reader is actually connected, continue instead of failing
            if (nativeStatus === 'connected' && terminalService.getReaderId()) {
              console.log('[TTP Hook] TIMEOUT_NATIVE_CONNECTED', {
                nativeStatus,
                readerId: terminalService.getReaderId(),
                durationMs
              })
              dispatchTTPEvent('TIMEOUT_NATIVE_CONNECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                nativeStatus,
                readerId: terminalService.getReaderId(),
                durationMs
              }))
              setLastSuccessfulStage('connected')
              // Continue to payment intent creation
            } else {
              // Native is not connected - attempt one automatic retry if not already tried
              if (!connectionRetryAttempted.current) {
                // Check if native connection is still in-flight before retrying
                const isNativeInFlight = terminalService.isConnectionInFlight()
                const nativeStatus = terminalService.getConnectionStatus()
                
                console.log('[TTP Hook] CONNECTION_RETRY_PRE_CHECK', {
                  isFirstConnectionOnDevice,
                  durationMs,
                  isNativeInFlight,
                  nativeStatus,
                  sessionId: terminalService.getSessionId()
                })
                
                // If native is still actively connecting, wait and poll status instead of starting competing call
                if (isNativeInFlight && nativeStatus === 'connecting') {
                  console.log('[TTP Hook] NATIVE_STILL_CONNECTING - waiting for completion')
                  dispatchTTPEvent('CONNECTION_RETRY_NATIVE_STILL_ACTIVE', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                    isFirstConnectionOnDevice,
                    durationMs,
                    nativeStatus
                  }))
                  
                  // Mark retry as attempted to prevent duplicate retry after poll
                  connectionRetryAttempted.current = true
                  
                  // Poll native status for up to 30 seconds
                  const pollStartTime = Date.now()
                  const maxPollTime = 30000
                  let pollInterval: NodeJS.Timeout | null = null
                  
                  try {
                    await new Promise<void>((resolve, reject) => {
                      pollInterval = setInterval(() => {
                        const currentStatus = terminalService.getConnectionStatus()
                        const elapsed = Date.now() - pollStartTime
                        
                        if (currentStatus === 'connected' && terminalService.getReaderId()) {
                          console.log('[TTP Hook] NATIVE_POLL_SUCCESS', { elapsed })
                          dispatchTTPEvent('CONNECTION_RETRY_POLL_SUCCESS', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                            elapsed
                          }))
                          if (pollInterval) clearInterval(pollInterval)
                          setLastSuccessfulStage('connected')
                          resolve()
                        } else if (elapsed >= maxPollTime) {
                          console.log('[TTP Hook] NATIVE_POLL_TIMEOUT', { elapsed })
                          if (pollInterval) clearInterval(pollInterval)
                          reject(new Error('Native connection poll timeout'))
                        }
                      }, 500)
                    })
                    // Continue to payment intent creation after successful poll
                  } catch (pollError: any) {
                    console.log('[TTP Hook] NATIVE_POLL_FAILED', { error: String(pollError) })
                    dispatchTTPEvent('CONNECTION_RETRY_POLL_FAILED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                      error: String(pollError)
                    }))
                    // Poll failed - throw original timeout error since retry already marked as attempted
                    throw connectError
                  }
                } else {
                  // Native is not still connecting - attempt retry
                  console.log('[TTP Hook] CONNECTION_RETRY_ATTEMPT', {
                    isFirstConnectionOnDevice,
                    durationMs,
                    sessionId: terminalService.getSessionId()
                  })
                  dispatchTTPEvent('CONNECTION_RETRY_ATTEMPT', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                    isFirstConnectionOnDevice,
                    durationMs
                  }))
                  connectionRetryAttempted.current = true
                
                  // Wait a brief moment before retry
                  await new Promise(resolve => setTimeout(resolve, 1000))
                
                  // Retry connection with same timeout
                  try {
                    const retryResult = await withTimeout(
                      terminalService.connectTapToPay(),
                      'READER_CONNECTION_RETRY',
                      connectionTimeout,
                      terminalService.getSessionId() || 'unknown',
                      terminalService.getCurrentAttemptId() || 'unknown'
                    )
                  
                    console.log('[TTP Hook] CONNECTION_RETRY_SUCCESS', {
                      status: retryResult.status,
                      durationMs: Date.now() - connectStartTime
                    })
                    dispatchTTPEvent('CONNECTION_RETRY_SUCCESS', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', retryResult.status)
                  
                    if (retryResult.status !== 'connected') {
                      throw new Error('Retry connection failed')
                    }
                    setLastSuccessfulStage('connected')
                    // Continue to payment intent creation
                  } catch (retryError: any) {
                    console.log('[TTP Hook] CONNECTION_RETRY_FAILED', {
                      error: retryError?.message,
                      durationMs: Date.now() - connectStartTime
                    })
                    dispatchTTPEvent('CONNECTION_RETRY_FAILED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                      error: retryError?.message,
                      durationMs: Date.now() - connectStartTime
                    }))
                    // Throw original timeout error
                    dispatchTTPEvent('CONNECT_PROMISE_REJECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                      errorName: connectError?.name,
                      errorMessage: connectError?.message,
                      errorCode: connectError?.code,
                      nativeCode: connectError?.nativeCode,
                      technicalCode: connectError?.technicalCode,
                      technicalMessage: connectError?.technicalMessage,
                      durationMs,
                      isTimeout,
                      nativeStatus,
                      attemptToken: localAttemptToken,
                      terminalSessionId: terminalService.getSessionId(),
                      paymentState: paymentStateRef.current,
                      timestamp: new Date().toISOString(),
                      retryAttempted: true,
                      retryFailed: true
                    }))
                    throw connectError
                  }
                }
              } else {
                // Already retried - dispatch timeout diagnostics and throw
                dispatchTTPEvent('CONNECT_PROMISE_REJECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
                  errorName: connectError?.name,
                  errorMessage: connectError?.message,
                  errorCode: connectError?.code,
                  nativeCode: connectError?.nativeCode,
                  technicalCode: connectError?.technicalCode,
                  technicalMessage: connectError?.technicalMessage,
                  durationMs,
                  isTimeout,
                  nativeStatus,
                  attemptToken: localAttemptToken,
                  terminalSessionId: terminalService.getSessionId(),
                  paymentState: paymentStateRef.current,
                  timestamp: new Date().toISOString(),
                  retryAttempted: true
                }))
                throw connectError
              }
            }
          } else {
            // Non-timeout error - dispatch diagnostics and throw
            dispatchTTPEvent('CONNECT_PROMISE_REJECTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'connecting_reader', JSON.stringify({
              errorName: connectError?.name,
              errorMessage: connectError?.message,
              errorCode: connectError?.code,
              nativeCode: connectError?.nativeCode,
              technicalCode: connectError?.technicalCode,
              technicalMessage: connectError?.technicalMessage,
              durationMs,
              isTimeout,
              attemptToken: localAttemptToken,
              terminalSessionId: terminalService.getSessionId(),
              paymentState: paymentStateRef.current,
              timestamp: new Date().toISOString()
            }))
            throw connectError
          }
        }
      }

      // Start payment collection
      updatePaymentStateRef('creating_payment_intent', 'payment_intent_creation_started')
      console.log('[TTP Hook] PAYMENT_INTENT_CREATION_STARTED', {
        attemptId: terminalService.getCurrentAttemptId(),
        sessionId: terminalService.getSessionId()
      })
      dispatchTTPEvent('PAYMENT_INTENT_CREATION_STARTED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'creating_payment_intent')

      // Emit EDUCATION_GATE_VERIFIED before PaymentIntent creation
      const businessAny = business as any
      const educationCompleted = businessAny?.tap_to_pay_education_completed_at != null
      await logTapToPayEvent('EDUCATION_GATE_VERIFIED', {
        correlationId: getCorrelationId() ?? undefined,
        attemptId: terminalService.getCurrentAttemptId() ?? undefined,
        sessionId: terminalService.getSessionId(),
        source: 'orchestration',
        paymentState: 'creating_payment_intent',
        stage: 'education_gate',
        meta: {
          educationCompleted,
          educationCompletedAt: businessAny?.tap_to_pay_education_completed_at
        }
      }).catch(() => {})
      updateAppleChecklist('paymentHeldUntilEducationCompleted', educationCompleted ? 'shown' : 'skipped')
      
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
        updateAppleChecklist('preparingUiShown', 'shown')
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
          // Add bounded timeout for reconciliation (15 seconds)
          const abortController = new AbortController()
          const timeoutId = setTimeout(() => abortController.abort(), 15000)

          const reconcileResponse = await fetch('/api/terminal/reconcile-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentIntentId }),
            signal: abortController.signal,
          })

          clearTimeout(timeoutId)
          
          if (!reconcileResponse.ok) {
            console.error('[TTP Hook] RECONCILE_FAILED', reconcileResponse.status)
            dispatchTTPEvent('RECONCILE_FAILED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'processing', 'reconciliation_failed')

            // Reconciliation failed - native succeeded but verification unresolved
            // Use ambiguous state to indicate payment may have succeeded
            updatePaymentStateRef('ambiguous', 'reconciliation_failed')
            setError('Payment verification is still pending. Check payment history before retrying.')
            setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
            startInFlight.current = false
            activeAttemptRef.current = false
            activeAttemptIdRef.current = null
            activeAttemptTokenRef.current = null
            console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_AMBIGUOUS')
            return
          }
          
          const reconcileData = await reconcileResponse.json()
          console.log('[TTP Hook] RECONCILE_RESPONSE_RECEIVED', { paymentIntentId, status: reconcileData.status })

          // Only show success if reconciliation confirms payment is paid
          if (reconcileData.status === 'paid') {
            console.log('[TTP Hook] RECONCILE_COMPLETED', { paymentIntentId, status: reconcileData.status })
            dispatchTTPEvent('RECONCILE_COMPLETED', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'processing', 'reconciliation_completed')

            // Store paymentRequestId for receipt sending
            if (reconcileData.paymentRequestId) {
              setPaymentRequestId(reconcileData.paymentRequestId)
              console.log('[TTP Hook] PAYMENT_REQUEST_ID_STORED', { paymentRequestId: reconcileData.paymentRequestId })
            }

            // Store last completed attempt for diagnostics
            setLastCompletedAttempt({
              attemptId: terminalService.getCurrentAttemptId(),
              outcome: 'success',
              completedAt: new Date().toISOString(),
              paymentRequestId: reconcileData.paymentRequestId || null,
            })
            console.log('[TTP Hook] LAST_COMPLETED_ATTEMPT_STORED', {
              outcome: 'success',
              attemptId: terminalService.getCurrentAttemptId(),
              paymentRequestId: reconcileData.paymentRequestId
            })

            // Emit SUCCESS_GATE_VERIFIED before success UI
            await logTapToPayEvent('SUCCESS_GATE_VERIFIED', {
              correlationId: getCorrelationId() ?? undefined,
              attemptId: terminalService.getCurrentAttemptId() ?? undefined,
              sessionId: terminalService.getSessionId(),
              source: 'orchestration',
              paymentState: 'processing',
              stage: 'success_gate',
              meta: {
                reconciliationStatus: reconcileData.status,
                reconciliationEvidence: {
                  paymentIntentId,
                  reconcileData
                }
              }
            }).catch(() => {})
            updateAppleChecklist('approvedDeclinedFinalStateShown', 'shown')

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
          } else {
            // Reconciliation returned non-paid status - treat as failure
            console.error('[TTP Hook] RECONCILE_RETURNED_NON_PAID', reconcileData.status)
            dispatchTTPEvent('RECONCILE_RETURNED_NON_PAID', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'failure', `status_${reconcileData.status}`)

            // Store last completed attempt for diagnostics
            setLastCompletedAttempt({
              attemptId: terminalService.getCurrentAttemptId(),
              outcome: 'failure',
              completedAt: new Date().toISOString(),
              paymentRequestId: reconcileData.paymentRequestId || null,
            })
            console.log('[TTP Hook] LAST_COMPLETED_ATTEMPT_STORED', {
              outcome: 'failure',
              attemptId: terminalService.getCurrentAttemptId(),
              paymentRequestId: reconcileData.paymentRequestId
            })

            updatePaymentStateRef('failure', 'reconciliation_not_paid')
            setError('Payment verification failed. Please check your payment history.')
            setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
            startInFlight.current = false
            activeAttemptRef.current = false
            activeAttemptIdRef.current = null
            activeAttemptTokenRef.current = null
            console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_FAILURE')
          }
        } catch (reconcileError) {
          console.error('[TTP Hook] RECONCILE_EXCEPTION', reconcileError)
          dispatchTTPEvent('RECONCILE_EXCEPTION', terminalService.getSessionId(), terminalService.getCurrentAttemptId(), 'ambiguous', 'exception')

          // Reconciliation failed due to exception - native succeeded but verification unresolved
          // Use ambiguous state to indicate payment may have succeeded
          updatePaymentStateRef('ambiguous', 'reconciliation_exception')
          setError('Payment verification is still pending. Check payment history before retrying.')
          setIsPaymentInProgress(false)
          permissionLock.setTapToPayActive(false)
          startInFlight.current = false
          activeAttemptRef.current = false
          activeAttemptIdRef.current = null
          activeAttemptTokenRef.current = null
          console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_AMBIGUOUS')
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
    const outcome: 'success' | 'failure' | 'canceled' = isCancellation ? 'canceled' : 'failure'

    // Store last completed attempt for diagnostics
    setLastCompletedAttempt({
      attemptId: terminalService.getCurrentAttemptId(),
      outcome,
      completedAt: new Date().toISOString(),
      paymentRequestId: paymentRequestId || null,
    })
    console.log('[TTP Hook] LAST_COMPLETED_ATTEMPT_STORED', {
      outcome,
      attemptId: terminalService.getCurrentAttemptId(),
      paymentRequestId
    })

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
  READER_DISCOVERY_WARM: 45000,    // Normal warm connections
  READER_DISCOVERY_COLD: 90000,    // First-ever or cold initialization
  PAYMENT_INTENT: 30000,
  COLLECT_PAYMENT: 60000,
  CONFIRM_PAYMENT: 45000,
  RECONCILIATION: 30000,
}

// Create a timeout promise that rejects after specified duration
function createTimeout(stage: string, duration: number, sessionId: string, attemptId: string): { promise: Promise<never>, timeoutId: NodeJS.Timeout } {
  const timeoutId = setTimeout(() => {
    console.error(`[TTP Hook] TIMEOUT: ${stage} after ${duration}ms`, { sessionId, attemptId })
  }, duration)
  
  const promise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      console.error(`[TTP Hook] TIMEOUT: ${stage} after ${duration}ms`, { sessionId, attemptId })
      reject(new Error(`Timeout: ${stage}`))
    }, duration)
  })
  
  return { promise, timeoutId }
}

// Wrap an async operation with a timeout
async function withTimeout<T>(
  promise: Promise<T>,
  stage: string,
  duration: number,
  sessionId: string,
  attemptId: string
): Promise<T> {
  const { promise: timeoutPromise, timeoutId } = createTimeout(stage, duration, sessionId, attemptId)
  
  try {
    return await Promise.race([
      promise,
      timeoutPromise,
    ])
  } finally {
    // Clear timeout if promise wins the race
    clearTimeout(timeoutId)
  }
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
    setPaymentRequestId(null)
    // DO NOT clear lastCompletedAttempt - preserve across modal reset for diagnostics
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
    setPaymentRequestId(null)
    // DO NOT clear lastCompletedAttempt - preserve across modal reset for diagnostics
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
    educationWaitingForConfirmation,
    paymentRequestId,
    lastCompletedAttempt,
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