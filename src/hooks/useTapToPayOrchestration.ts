'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { isNativeCapacitor } from '@/lib/terminal'
import type { TerminalError } from '@/lib/terminal'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'
import { mapTapToPayError } from '@/lib/terminal/error-mapper'

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
  checkPlatformSupport: () => Promise<{ platform: 'ios' | 'android' | 'web'; isNativeSupported: boolean }>
  requestLocationPermission: () => Promise<boolean>
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

  // Update ref when state changes with logging and reason
  const updatePaymentStateRef = useCallback((newState: PaymentState, reason: string = 'unknown') => {
    const previousState = paymentStateRef.current
    paymentStateRef.current = newState
    setPaymentState(newState)
    setLastResetReason(reason)
    console.log('[TTP Hook] STATE_CHANGE', {
      previousState,
      nextState: newState,
      reason,
      sessionId: terminalService.getSessionId(),
      attemptId: terminalService.getCurrentAttemptId(),
      timestamp: new Date().toISOString()
    })
  }, [])

  useEffect(() => {
    paymentStateRef.current = paymentState
  }, [paymentState])

  // Check platform and native support
  const checkPlatformSupport = useCallback(async () => {
    const MAX_RETRIES = 20
    const RETRY_DELAY = 50
    let retries = 0

    while (retries < MAX_RETRIES) {
      const pluginAvailable = Capacitor.isPluginAvailable('ReplyflowStripeTerminal')
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
    setIsNativeSupported(supported)

    return { platform: detectedPlatform, isNativeSupported: supported }
  }, [])

  // Check location permission for Android
  const checkLocationPermission = useCallback(async (): Promise<boolean> => {
    console.log('[TTP Hook] checkLocationPermission called', { platform })
    if (platform !== 'android') {
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      console.log('[TTP Hook] checkLocationPermission: not Android, skipping')
      return true
    }

    try {
      const Terminal = await import('@/lib/terminal')
      const plugin = Terminal.default

      console.log('[TTP Hook] Calling plugin.checkLocationPermission')
      const result = await plugin.checkLocationPermission()
      console.log('[TTP Hook] plugin.checkLocationPermission result:', result)
      setLocationPermissionGranted(result.granted)
      setLocationServicesEnabled(result.locationEnabled)

      return result.granted && result.locationEnabled
    } catch (error) {
      console.error('[TTP Hook] Failed to check location permission:', error)
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      console.log('[TTP Hook] checkLocationPermission: error, returning true (fallback)')
      return true
    }
  }, [platform])

  // Request location permission proactively
  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    console.log('[TTP Hook] requestLocationPermission called', { platform })
    if (platform !== 'android') {
      return true
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
        setLocationServicesEnabled(locationServicesEnabled)
        return locationCheck
      }
      
      return false
    } catch (error) {
      console.error('[TTP Hook] Failed to request location permission:', error)
      return false
    }
  }, [platform, checkLocationPermission])

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

    setIsPaymentInProgress(true)
    updatePaymentStateRef('preparing', 'start_payment_called')
    setError('')
    setStructuredError(null)
    setMappedError(null)
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
        console.log('[TTP Hook] LOCATION_CHECK_STARTED', { platform })
        const locationOk = await checkLocationPermission()
        console.log('[TTP Hook] LOCATION_CHECK_COMPLETED', { locationOk })
        
        if (!locationOk) {
          console.log('[TTP Hook] LOCATION_PERMISSION_CHECK_FAILED - requesting permission')
          const permissionGranted = await requestLocationPermission()
          console.log('[TTP Hook] LOCATION_PERMISSION_REQUEST_RESULT', { permissionGranted })
          
          if (!permissionGranted) {
            console.log('[TTP Hook] LOCATION_PERMISSION_DENIED after request')
            setShowLocationPermissionDialog(true)
            setIsPaymentInProgress(false)
            autoRetryInProgress.current = false
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
        }
        setLastSuccessfulStage('location_permission_ok')
      }

      // Initialize terminal
      console.log('[TTP Hook] INITIALIZE_STARTED')
      const initResult = await terminalService.initialize()
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
        const connectResult = await terminalService.connectTapToPay()
        console.log('[TTP Hook] CONNECTION_COMPLETED', { status: connectResult.status })
        if (connectResult.status !== 'connected') {
          console.log('[TTP Hook] CONNECTION_FAILED', { status: connectResult.status })
          throw new Error('Failed to connect to payment terminal')
        }
        setLastSuccessfulStage('connected')
      }

      // Start payment collection
      const paymentPromise = terminalService.startTapToPayPayment({
        amountCents,
        currency: 'usd',
        leadId,
        jobId,
        description,
      })

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
        onPaymentComplete?.()
      } else if (paymentResult.status === 'failed') {
        const errorMsg = paymentResult.error || 'Payment failed'
        setError(errorMsg)
        updatePaymentStateRef('failure')
        setIsPaymentInProgress(false)
        onPaymentError?.(errorMsg)
      } else if (paymentResult.status === 'canceled') {
        updatePaymentStateRef('canceled')
        setIsPaymentInProgress(false)
      }

    } catch (err: any) {
    console.error('[TTP Hook] START_PAYMENT_FAILED', {
      error: err.message,
      code: err.code,
      name: err.name,
      stack: err.stack,
      lastSuccessfulStage
    })
    updatePaymentStateRef('failure', 'error_thrown')
    
    // Map the error to user-friendly message
    const mapped = mapTapToPayError({
      code: err.code || err.nativeCode,
      message: err.message,
      nativeCode: err.nativeCode,
      stage: lastSuccessfulStage,
    })
    setMappedError(mapped)
    
    const errorMsg = err.message || 'Payment failed'
    setError(errorMsg)
    setStructuredError(err as TerminalError)
    setIsPaymentInProgress(false)
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

  // Cancel payment
  const cancelPayment = useCallback((reason: string = 'user_canceled') => {
    console.log('[TTP Hook] Payment canceled', { reason })
    setIsPaymentInProgress(false)
    updatePaymentStateRef('canceled', reason)
    setError('')
    setStructuredError(null)
    setMappedError(null)
    autoRetryInProgress.current = false
  }, [updatePaymentStateRef])

  // Retry payment
  const retryPayment = useCallback(async () => {
    console.log('[TTP Hook] Retrying payment')
    setError('')
    setStructuredError(null)
    setMappedError(null)
    await startPayment()
  }, [startPayment])

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
    checkPlatformSupport,
    requestLocationPermission,
  }
}