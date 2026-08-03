'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { isNativeCapacitor } from '@/lib/terminal'
import type { TerminalError } from '@/lib/terminal'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'
import { mapTapToPayError } from '@/lib/terminal/error-mapper'
import { permissionLock } from '@/lib/permission-lock'

type PaymentState = 'ready' | 'preparing' | 'waiting_for_card' | 'processing' | 'success' | 'failure' | 'canceled' | 'pending' | 'ambiguous'

interface UseTapToPayOrchestrationOptions {
  amountCents: number
  leadId?: string
  jobId?: string
  description?: string
  customerName?: string
  onPaymentComplete?: () => void
  onPaymentError?: (error: string) => void
}

interface UseTapToPayOrchestrationReturn {
  paymentState: PaymentState
  error: string
  structuredError: TerminalError | null
  mappedError: {
    title: string
    message: string
    action: 'retry' | 'open_app_settings' | 'open_location_settings' | 'back' | 'none'
    technicalCode?: string
    technicalMessage?: string
  } | null
  isPaymentInProgress: boolean
  platform: 'ios' | 'android' | 'web'
  isNativeSupported: boolean
  lastSuccessfulStage: string
  lastResetReason: string
  startPayment: () => Promise<void>
  cancelPayment: (reason?: string) => void
  retryPayment: () => Promise<void>
  resetTapToPayUiState: (preserveSucceededAttempt?: boolean) => void
  resetToSetup: (reason?: string) => void
  checkPlatformSupport: () => Promise<{ platform: 'ios' | 'android' | 'web'; isNativeSupported: boolean }>
  requestLocationPermission: () => Promise<{ granted: boolean; locationEnabled: boolean }>
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
  const [showLocationPermissionDialog, setShowLocationPermissionDialog] = useState(false)
  const [lastResetReason, setLastResetReason] = useState<string>('none')

  const terminalService = TerminalBridgeService.getInstance()
  const paymentStateRef = useRef<PaymentState>(paymentState)
  const autoRetryInProgress = useRef(false)
  const startInFlight = useRef(false)
  const activeAttemptRef = useRef(false)

  // Update ref when state changes with logging and reason
  const updatePaymentStateRef = useCallback((newState: PaymentState, reason: string = 'unknown') => {
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
  const checkLocationPermission = useCallback(async (): Promise<{ granted: boolean; locationEnabled: boolean }> => {
    console.log('[TTP Hook] checkLocationPermission called', { platform })
    if (platform !== 'android') {
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      console.log('[TTP Hook] checkLocationPermission: not Android, skipping')
      return { granted: true, locationEnabled: true }
    }

    try {
      const Terminal = await import('@/lib/terminal')
      const plugin = Terminal.default

      console.log('[TTP Hook] Calling plugin.checkLocationPermission')
      const result = await plugin.checkLocationPermission()
      console.log('[TTP Hook] plugin.checkLocationPermission result:', result)
      setLocationPermissionGranted(result.granted)
      setLocationServicesEnabled(result.locationEnabled)

      return { granted: result.granted, locationEnabled: result.locationEnabled }
    } catch (error) {
      console.error('[TTP Hook] Failed to check location permission:', error)
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      console.log('[TTP Hook] checkLocationPermission: error, returning true (fallback)')
      return { granted: true, locationEnabled: true }
    }
  }, [platform])

  // Request location permission proactively
  const requestLocationPermission = useCallback(async (): Promise<{ granted: boolean; locationEnabled: boolean }> => {
    console.log('[TTP Hook] requestLocationPermission called', { platform })
    if (platform !== 'android') {
      return { granted: true, locationEnabled: true }
    }

    try {
      const Terminal = await import('@/lib/terminal')
      const plugin = Terminal.default

      console.log('[TTP Hook] Calling plugin.requestLocationPermission')
      const result = await plugin.requestLocationPermission()
      console.log('[TTP Hook] plugin.requestLocationPermission result:', result)
      setLocationPermissionGranted(result.granted)
      
      // After requesting permission, check location services
      if (result.granted) {
        const locationCheck = await checkLocationPermission()
        setLocationServicesEnabled(locationCheck.locationEnabled)
        return locationCheck
      }
      
      return { granted: false, locationEnabled: false }
    } catch (error) {
      console.error('[TTP Hook] Failed to request location permission:', error)
      return { granted: false, locationEnabled: false }
    }
  }, [platform, checkLocationPermission])

  // Check for unresolved previous attempts on mount
  useEffect(() => {
    const checkUnresolvedAttempt = async () => {
      // Guard: Skip recovery if a payment is already active
      if (startInFlight.current || activeAttemptRef.current) {
        console.log('[TTP Hook] RECOVERY_SKIPPED_ACTIVE_ATTEMPT', {
          startInFlight: startInFlight.current,
          activeAttempt: activeAttemptRef.current
        })
        return
      }

      const RECOVERY_TIMEOUT_MS = 15000 // 15 seconds
      const timeoutId = setTimeout(() => {
        console.log('[TTP Hook] RECOVERY_TIMEOUT - clearing recovery state')
        updatePaymentStateRef('ready', 'recovery_timeout')
        setError('')
        setStructuredError(null)
        setMappedError(null)
      }, RECOVERY_TIMEOUT_MS)

      try {
        console.log('[TTP Hook] Checking for unresolved attempts')
        const response = await fetch('/api/terminal/attempt-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        const data = await response.json()
        
        if (data.unresolvedAttempt) {
          console.log('[TTP Hook] Found unresolved attempt', data.unresolvedAttempt)
          setLastSuccessfulStage('checking_previous_payment')
          
          // If the attempt succeeded, show success
          if (data.unresolvedAttempt.status === 'succeeded') {
            console.log('[TTP Hook] Previous attempt succeeded, showing success')
            clearTimeout(timeoutId)
            updatePaymentStateRef('success', 'previous_attempt_succeeded')
            onPaymentComplete?.()
            startInFlight.current = false
            activeAttemptRef.current = false
            console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_SUCCESS')
          } else if (data.unresolvedAttempt.status === 'canceled' || data.unresolvedAttempt.status === 'failed') {
            console.log('[TTP Hook] Previous attempt failed/canceled, clearing and transitioning to ready')
            clearTimeout(timeoutId)
            // Clear stale attempt and transition to ready, not canceled
            // Canceled state is only for current session cancellations
            updatePaymentStateRef('ready', 'previous_attempt_cleared')
          } else {
            // Still pending but stale, clear it
            console.log('[TTP Hook] Previous attempt stale, clearing and transitioning to ready')
            clearTimeout(timeoutId)
            updatePaymentStateRef('ready', 'stale_attempt_cleared')
          }
        } else {
          // No unresolved attempt, explicitly set to ready
          console.log('[TTP Hook] No unresolved attempt, transitioning to ready')
          clearTimeout(timeoutId)
          updatePaymentStateRef('ready', 'no_unresolved_attempt')
        }
      } catch (error) {
        console.error('[TTP Hook] Failed to check unresolved attempt', error)
        clearTimeout(timeoutId)
        // On error, ensure we're in ready state
        updatePaymentStateRef('ready', 'recovery_error')
      }
    }
    
    checkUnresolvedAttempt()
  }, [updatePaymentStateRef, onPaymentComplete])

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
    console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_SET')
    console.log('[TTP Hook] ATTEMPT_STARTED', {
      sessionId: terminalService.getSessionId(),
      attemptId: terminalService.getCurrentAttemptId()
    })

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
        if (paymentStateRef.current !== 'preparing') {
          updatePaymentStateRef('preparing', 'reconnect_to_preparing')
        }
        console.log('[TTP Hook] CONNECTION_STARTED')
        setLastSuccessfulStage('connecting_reader')
        const connectResult = await withTimeout(
          terminalService.connectTapToPay(),
          'READER_CONNECTION',
          TIMEOUTS.READER_DISCOVERY,
          terminalService.getSessionId() || 'unknown',
          terminalService.getCurrentAttemptId() || 'unknown'
        )
        console.log('[TTP Hook] CONNECTION_COMPLETED', { status: connectResult.status })
        if (connectResult.status !== 'connected') {
          console.log('[TTP Hook] CONNECTION_FAILED', { status: connectResult.status })
          throw new Error('Failed to connect to payment terminal')
        }
        setLastSuccessfulStage('connected')
      }

      // Start payment collection
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
        updatePaymentStateRef('waiting_for_card')
        setLastSuccessfulStage('payment_intent_created')
      }

      const paymentResult = await paymentPromise
      console.log('[TTP Hook] Payment result:', paymentResult)

      if (paymentResult.status === 'success') {
        updatePaymentStateRef('success')
        setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
        startInFlight.current = false
            activeAttemptRef.current = false
        console.log('[QuickTTP UI] START_IN_FLIGHT_GUARD_CLEARED_SUCCESS')
        onPaymentComplete?.()
      } else if (paymentResult.status === 'failed') {
        const errorMsg = paymentResult.error || 'Payment failed'
        setError(errorMsg)
        updatePaymentStateRef('failure')
        setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
        onPaymentError?.(errorMsg)
      } else if (paymentResult.status === 'canceled') {
        updatePaymentStateRef('canceled')
        setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
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
    setIsPaymentInProgress(false)
            permissionLock.setTapToPayActive(false)
    updatePaymentStateRef('canceled', reason)
    setError('')
    setStructuredError(null)
    setMappedError(null)
    autoRetryInProgress.current = false
  }, [updatePaymentStateRef, paymentState])

  // Retry payment
  const retryPayment = useCallback(async () => {
    console.log('[TTP Hook] Retrying payment')
    setError('')
    setStructuredError(null)
    setMappedError(null)
    await startPayment()
  }, [startPayment])

  // Emergency reset function to clear all UI state
  const resetTapToPayUiState = useCallback((preserveSucceededAttempt: boolean = true) => {
    console.log('[TTP Hook] EMERGENCY_RESET', { preserveSucceededAttempt })
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
  }, [updatePaymentStateRef])

  // Reset to setup state (separate from cancelPayment)
  const resetToSetup = useCallback((reason: string = 'reset_to_setup') => {
    console.log('[QuickTTP UI] RESET_TO_SETUP', { reason, currentPaymentState: paymentState })
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
  }, [updatePaymentStateRef, paymentState])

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
    startPayment,
    cancelPayment,
    retryPayment,
    resetTapToPayUiState,
    resetToSetup,
    checkPlatformSupport,
    requestLocationPermission,
  }
}