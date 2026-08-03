'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { isNativeCapacitor } from '@/lib/terminal'
import type { TerminalError } from '@/lib/terminal'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'

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
  isPaymentInProgress: boolean
  platform: 'ios' | 'android' | 'web'
  isNativeSupported: boolean
  startPayment: () => Promise<void>
  cancelPayment: () => void
  retryPayment: () => Promise<void>
  checkPlatformSupport: () => Promise<{ platform: 'ios' | 'android' | 'web'; isNativeSupported: boolean }>
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
  const [isPaymentInProgress, setIsPaymentInProgress] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web')
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [lastSuccessfulStage, setLastSuccessfulStage] = useState<string>('none')
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null)
  const [locationServicesEnabled, setLocationServicesEnabled] = useState<boolean | null>(null)
  const [showLocationPermissionDialog, setShowLocationPermissionDialog] = useState(false)

  const terminalService = TerminalBridgeService.getInstance()
  const paymentStateRef = useRef<PaymentState>(paymentState)
  const autoRetryInProgress = useRef(false)

  // Update ref when state changes
  const updatePaymentStateRef = useCallback((newState: PaymentState) => {
    paymentStateRef.current = newState
    setPaymentState(newState)
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
    if (platform !== 'android') {
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      return true
    }

    try {
      const Terminal = await import('@/lib/terminal')
      const plugin = Terminal.default

      const result = await plugin.checkLocationPermission()
      setLocationPermissionGranted(result.granted)
      setLocationServicesEnabled(result.locationEnabled)

      return result.granted && result.locationEnabled
    } catch (error) {
      console.error('[TTP Hook] Failed to check location permission:', error)
      setLocationPermissionGranted(true)
      setLocationServicesEnabled(true)
      return true
    }
  }, [platform])

  // Main payment orchestration function
  const startPayment = useCallback(async () => {
    console.log('[TTP Hook] Payment started:', {
      isNativeSupported,
      platform,
      amountCents,
      leadId,
      jobId
    })

    if (!isNativeSupported) {
      console.log('[TTP Hook] Native support check failed')
      if (platform === 'web') {
        const errorMsg = 'Tap to Pay is only available on the mobile app'
        setError(errorMsg)
        onPaymentError?.(errorMsg)
      }
      return
    }

    // Minimum amount validation
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || Math.floor(amountCents) !== amountCents) {
      const errorMsg = 'Invalid amount. Please enter a valid amount.'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }
    if (amountCents < 50) {
      const errorMsg = 'Amount must be at least $0.50.'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }

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
      updatePaymentStateRef('ambiguous')
      const errorMsg = 'Please resolve the previous payment status first'
      setError(errorMsg)
      onPaymentError?.(errorMsg)
      return
    }

    setIsPaymentInProgress(true)
    updatePaymentStateRef('preparing')
    setError('')
    setStructuredError(null)
    setLastSuccessfulStage('initializing')

    try {
      // Check device support
      const supportCheck = await terminalService.isSupported()
      if (!supportCheck.supported) {
        throw new Error('This device does not support Tap to Pay')
      }
      setLastSuccessfulStage('device_supported')

      // Check location permission for Android
      if (platform === 'android') {
        const locationOk = await checkLocationPermission()
        if (!locationOk) {
          console.log('[TTP Hook] Location permission or services not available')
          setShowLocationPermissionDialog(true)
          setIsPaymentInProgress(false)
          autoRetryInProgress.current = false
          updatePaymentStateRef('ready')
          const errorMsg = 'Location permission is required for Tap to Pay'
          setError(errorMsg)
          onPaymentError?.(errorMsg)
          return
        }
        setLastSuccessfulStage('location_permission_ok')
      }

      // Initialize terminal
      const initResult = await terminalService.initialize()
      if (initResult.status !== 'ready' && initResult.status !== 'connected') {
        throw new Error('Failed to initialize payment terminal')
      }
      setLastSuccessfulStage('initialized')

      // Connect if needed
      if (initResult.status === 'connected') {
        setLastSuccessfulStage('connected')
      } else {
        if (paymentStateRef.current !== 'preparing') {
          updatePaymentStateRef('preparing')
        }
        const connectResult = await terminalService.connectTapToPay()
        if (connectResult.status !== 'connected') {
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
      console.error('[TTP Hook] Payment error:', err)
      const errorMsg = err.message || 'Payment failed'
      setError(errorMsg)
      setStructuredError(err as TerminalError)
      updatePaymentStateRef('failure')
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
    onPaymentComplete,
    onPaymentError,
    updatePaymentStateRef,
  ])

  // Cancel payment
  const cancelPayment = useCallback(() => {
    console.log('[TTP Hook] Payment canceled')
    setIsPaymentInProgress(false)
    updatePaymentStateRef('canceled')
    setError('')
    setStructuredError(null)
    autoRetryInProgress.current = false
  }, [updatePaymentStateRef])

  // Retry payment
  const retryPayment = useCallback(async () => {
    console.log('[TTP Hook] Retrying payment')
    setError('')
    setStructuredError(null)
    await startPayment()
  }, [startPayment])

  return {
    paymentState,
    error,
    structuredError,
    isPaymentInProgress,
    platform,
    isNativeSupported,
    startPayment,
    cancelPayment,
    retryPayment,
    checkPlatformSupport,
  }
}