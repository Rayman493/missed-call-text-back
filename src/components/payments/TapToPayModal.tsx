'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, CreditCard, Smartphone, Loader2, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import TapToPayDiagnosticsPanel from '@/components/TapToPayDiagnosticsPanel'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { isNativeCapacitor } from '@/lib/terminal'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { TerminalError, DeviceState } from '@/lib/terminal'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { Capacitor } from '@capacitor/core'
import { SHOW_TAP_TO_PAY_DIAGNOSTICS } from './tapToPayUiConfig'

interface TapToPayModalProps {
  isOpen: boolean
  onClose: () => void
  amountCents: number
  leadId?: string
  jobId?: string
  description?: string
  customerName?: string
  onPaymentComplete?: () => void
  autoStart?: boolean
}

type PaymentState = 'ready' | 'preparing' | 'waiting_for_card' | 'processing' | 'success' | 'failure' | 'canceled' | 'pending' | 'ambiguous'

// Internal diagnostic build marker - gate technical details to this specific build
const DIAGNOSTIC_BUILD_MARKER = 'TAP_TO_PAY_REAL_NFC_DIAGNOSTIC_2026_07_22_V2'

export default function TapToPayModal({
  isOpen,
  onClose,
  amountCents,
  leadId,
  jobId,
  description,
  customerName,
  onPaymentComplete,
  autoStart = false,
}: TapToPayModalProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>('ready')
  const [error, setError] = useState<string>('')
  const [structuredError, setStructuredError] = useState<TerminalError | null>(null)
  const [jsError, setJsError] = useState<{ code: string; message: string; stage?: string; clientSecretPresent?: boolean } | null>(null)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [terminalService] = useState(() => TerminalBridgeService.getInstance())
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [lastSuccessfulStage, setLastSuccessfulStage] = useState<string>('none')
  const [isPaymentInProgress, setIsPaymentInProgress] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('web')

  useBodyScrollLock(isOpen)

  // Track current UI state in a ref to guard against stale callbacks
  const paymentStateRef = useRef<PaymentState>(paymentState)
  useEffect(() => { paymentStateRef.current = paymentState }, [paymentState])

  // Emit WAITING_FOR_CONFIRMATION exactly once per attempt when native indicates confirm stage
  const waitingForConfirmationEmitted = useRef<string | null>(null) // attemptId

  // Do NOT auto-expand diagnostics in production - keep technical details hidden from users
  // Diagnostics can be manually expanded via "Show diagnostics" button if needed

  // Check native support when modal opens
  useEffect(() => {
    if (isOpen) {
      try { logTapToPayEvent('MODAL_OPENED', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay', visible: true } }) } catch {}
      setShowDiagnostics(false)
      
      // Detect platform for platform-specific messaging
      const detectedPlatform = Capacitor.getPlatform() as 'ios' | 'android' | 'web'
      setPlatform(detectedPlatform)
      
      // Development logging for platform detection
      if (process.env.NODE_ENV === 'development') {
        // Development-only platform detection diagnostics
      }
      
      const supported = isNativeCapacitor()
      setIsNativeSupported(supported)
      // Only set error message in web - never in native app
      // The user is already in the app, so this message is redundant
      if (!supported && detectedPlatform === 'web') {
        setError('Tap to Pay is only available on the mobile app')
      }

      // Check for unresolved attempt from previous session
      const unresolvedAttemptId = terminalService.getUnresolvedAttempt()
      if (unresolvedAttemptId) {
        setPaymentState('ambiguous')
        setError('Payment status uncertain - checking...')
        // Trigger recovery check
        checkAttemptStatus(unresolvedAttemptId)
      } else if (autoStart) {
        // Auto-start on initial open to remove redundant Start press
        // Guard with in-progress flag to avoid duplicate starts
        if (!isPaymentInProgress) {
          // Defer to next tick to allow initial state to settle
          setTimeout(() => {
            // Double-check visibility and no unresolved attempt before starting
            if (paymentStateRef.current === 'ready') {
              handleStartPayment()
            }
          }, 0)
        }
      }
    } else {
      // Reset when closed
      try { logTapToPayEvent('MODAL_CLOSED', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay', visible: false } }) } catch {}
      setPaymentState('ready')
      setError('')
      setStructuredError(null)
      setJsError(null)
      setShowTechnicalDetails(false)
      setLastSuccessfulStage('none')
      setIsPaymentInProgress(false)
      waitingForConfirmationEmitted.current = null
    }
  }, [isOpen])

  // Track modalVisible state transitions
  const prevVisibleRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (prevVisibleRef.current === null) {
      prevVisibleRef.current = isOpen
    } else if (prevVisibleRef.current !== isOpen) {
      try { logTapToPayEvent('STATE_CHANGED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, paymentIntentId: terminalService.getPaymentIntentId(), readerId: terminalService.getReaderId(), meta: { stateName: 'modalVisible', previousValue: prevVisibleRef.current, nextValue: isOpen } }) } catch {}
      prevVisibleRef.current = isOpen
    }
  }, [isOpen])

  // Track visible UI state transitions and emit UI-state events
  const prevUiStateRef = useRef<PaymentState | null>(null)
  useEffect(() => {
    if (prevUiStateRef.current === null) {
      prevUiStateRef.current = paymentState
    } else if (prevUiStateRef.current !== paymentState) {
      try { logTapToPayEvent('STATE_CHANGED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, paymentIntentId: terminalService.getPaymentIntentId(), readerId: terminalService.getReaderId(), meta: { stateName: 'uiState', previousValue: prevUiStateRef.current, nextValue: paymentState } }) } catch {}
      prevUiStateRef.current = paymentState
    }
    const common = { sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, paymentIntentId: terminalService.getPaymentIntentId(), phase: terminalService.getCurrentPhase() as any }
    if (paymentState === 'ready') {
      try { logTapToPayEvent('READY_FOR_PAYMENT', common) } catch {}
    } else if (paymentState === 'waiting_for_card') {
      try { logTapToPayEvent('WAITING_FOR_TAP', common) } catch {}
    } else if (paymentState === 'processing') {
      try { logTapToPayEvent('WAITING_FOR_CONFIRMATION', common) } catch {}
    } else if (paymentState === 'success') {
      try { logTapToPayEvent('PAYMENT_SUCCESS_UI', common) } catch {}
    } else if (paymentState === 'failure') {
      try { logTapToPayEvent('PAYMENT_ERROR_UI', { ...common, message: error }) } catch {}
    } else if (paymentState === 'canceled') {
      try { logTapToPayEvent('PAYMENT_CANCELLED_UI', common) } catch {}
    }
  }, [paymentState])

  // Handle Android back and browser back
  useEffect(() => {
    if (!isOpen) return

    try {
      window.history.pushState({ rfTapToPay: true }, '')
    } catch {}

    const onPopState = () => {
      if (paymentState === 'ready' || paymentState === 'failure' || paymentState === 'canceled') {
        try { logTapToPayEvent('BACK_BUTTON_PRESSED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}
        onClose()
      }
    }
    window.addEventListener('popstate', onPopState)

    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => {
          if (paymentState === 'ready' || paymentState === 'failure' || paymentState === 'canceled') {
            try { logTapToPayEvent('BACK_BUTTON_PRESSED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}
            onClose()
          }
        })
      } catch {}
    })()

    return () => {
      window.removeEventListener('popstate', onPopState)
      capListener?.remove?.()
    }
  }, [isOpen, onClose, paymentState])

  // Listen for structured errors from native plugin
  useEffect(() => {
    if (!isOpen || !isNativeSupported) return

    let errorListener: { remove: () => void } | undefined
    let diagListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const Terminal = await import('@/lib/terminal')
        const plugin = Terminal.default
        errorListener = await plugin.addListener('error', (data: TerminalError) => {
          // Guard against stale callbacks after cancel→retry: only react when UI is in a collecting/processing state
          const ps = paymentStateRef.current
          if (ps !== 'waiting_for_card' && ps !== 'processing' && ps !== 'ambiguous') {
            // Ignore late error updates when UI is no longer collecting
            try { logTapToPayEvent('STALE_UI_ERROR_IGNORED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, message: data?.message, code: (data as any)?.code }) } catch {}
            return
          }
          setStructuredError(data)
        })

        // Diagnostics lifecycle tap: infer confirmation-wait once per attempt
        diagListener = await (plugin as any).addListener('tpDiagnostics', (payload: any) => {
          try {
            const name = String(payload?.name || '')
            const attemptId = terminalService.getCurrentAttemptId() || null
            if (!attemptId) return
            if (waitingForConfirmationEmitted.current === attemptId) return
            if (name === 'confirm_payment_intent_started' || name === 'collect_payment_method_completed') {
              waitingForConfirmationEmitted.current = attemptId
              logTapToPayEvent('WAITING_FOR_CONFIRMATION', { phase: 'confirm_payment', sessionId: terminalService.getSessionId(), attemptId, paymentIntentId: terminalService.getPaymentIntentId() }).catch(() => {})
              // Explicitly surface Processing state in UI without delaying success
              if (paymentStateRef.current === 'waiting_for_card') {
                setPaymentState('processing')
              }
            }
          } catch {}
        })
      } catch (err) {
        console.error('[TapToPayModal] Failed to register error listener:', err)
      }
    })()

    return () => {
      errorListener?.remove?.()
      diagListener?.remove?.()
    }
  }, [isOpen, isNativeSupported])

  const getErrorMessage = (error: any): string => {
    // Log raw error in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('[TapToPayModal] Raw error:', error)
    }

    // Preserve structured errors from native with specific codes
    if (error?.code && error?.stage) {
      // This is a structured native error - preserve it for diagnostics
      // Only map specific known codes to user-friendly messages
      if (error.code === 'unsupported_os') {
        return 'Tap to Pay isn\'t supported on this device.'
      }
      if (error.code === 'nfc_unavailable') {
        return 'NFC is unavailable. Check your device settings and try again.'
      }
      if (error.code === 'device_not_secure') {
        return 'This device doesn\'t meet the security requirements for Tap to Pay.'
      }
      if (error.code === 'network_error') {
        return 'We couldn\'t connect. Check your connection and try again.'
      }
      if (error.code === 'payment_declined') {
        return 'The payment was declined. Ask the customer to try another payment method.'
      }
      if (error.code === 'terminal-init-failed') {
        return 'Tap to Pay couldn\'t start. Restart the app and try again.'
      }
      if (error.code === 'terminal-init-in-progress') {
        return 'Tap to Pay is starting. Please wait...'
      }
      if (error.code === 'client-secret-required') {
        return 'Payment setup could not be completed. Please try again.'
      }
      if (error.code === 'local_payment_record_failed') {
        return 'Payment setup could not be completed. Please try again.'
      }
      // USER_ERROR.CANCELED is handled separately - not mapped to error message
      if (error.code === 'USER_ERROR.CANCELED' || error.nativeCode === 'USER_ERROR.CANCELED') {
        return '' // Empty message for cancellation - handled as neutral state
      }

      // For other structured native errors, return a generic message but preserve the code for diagnostics
      return 'Payment failed. Please try again.'
    }

    // Generic error handling for non-structured errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase()
      if (message.includes('support')) {
        return 'This device does not support Tap to Pay'
      }
      if (message.includes('initialize')) {
        return 'Failed to initialize payment terminal'
      }
      if (message.includes('network') || message.includes('fetch')) {
        return 'Network error. Please check your connection and try again.'
      }
      if (message.includes('client-secret-required')) {
        return 'Payment setup could not be completed. Please try again.'
      }
      // Don't swallow "connect" errors - let them through for diagnostics
      return error.message
    }

    return 'Payment failed. Please try again.'
  }

  const checkAttemptStatus = async (terminalAttemptId: string) => {
    try {
      const headers = await terminalService.getAuthHeaders()
      const response = await fetch(`/api/terminal/attempt-status?terminalAttemptId=${terminalAttemptId}`, {
        method: 'GET',
        headers,
      })

      if (response.ok) {
        const data = await response.json()

        if (data.status === 'paid') {
          setPaymentState('success')
          setError('')
          terminalService.clearUnresolvedAttempt()
          if (onPaymentComplete) {
            setTimeout(() => onPaymentComplete(), 1500)
          }
        } else if (data.status === 'failed' || data.status === 'canceled') {
          setPaymentState(data.status === 'failed' ? 'failure' : 'canceled')
          setError(data.message || 'Payment failed')
          terminalService.clearUnresolvedAttempt()
        } else if (data.status === 'processing') {
          setPaymentState('ambiguous')
          setError('Payment is still processing - please wait')
          // Continue polling - do NOT convert to failed on timeout
          setTimeout(() => checkAttemptStatus(terminalAttemptId), 3000)
        } else if (data.status === 'not_found') {
          // Attempt not found - clear and allow new payment
          terminalService.clearUnresolvedAttempt()
          setPaymentState('ready')
          setError('')
        }
      } else {
        console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=recovery_check_failed')
        setPaymentState('ambiguous')
        setError('Unable to check payment status. Please try again.')
        // Do NOT clear unresolved attempt - keep for retry
      }
    } catch (error) {
      console.error('[TAP_ATTEMPT] attempt_id=' + terminalAttemptId + ' stage=recovery_check_error error=' + (error instanceof Error ? error.message : 'Unknown'))
      setPaymentState('ambiguous')
      setError('Unable to check payment status. Please try again.')
      // Do NOT clear unresolved attempt - keep for retry
    }
  }

  const handleStartPayment = async () => {
    console.log('[TTP UI] Payment started:', {
      isNativeSupported,
      platform,
      amountCents,
      leadId,
      jobId
    })
    console.log('[TTP UI] Platform detected:', platform)

    if (!isNativeSupported) {
      console.log('[TTP UI] Native support check failed')
      // Only show error message in web - never in native app
      // The user is already in the app, so this message is redundant
      if (platform === 'web') {
        setError('Tap to Pay is only available on the mobile app')
      }
      return
    }

    // Minimum amount validation BEFORE any initialization/connect/attempt
    if (typeof amountCents !== 'number' || !Number.isFinite(amountCents) || Math.floor(amountCents) !== amountCents) {
      // Defensive: ensure integer cents
      try { logTapToPayEvent('INVALID_AMOUNT_FORMAT', { phase: 'startup', sessionId: terminalService.getSessionId(), meta: { raw: amountCents } }) } catch {}
      setError('Invalid amount. Please enter a valid amount.')
      return
    }
    if (amountCents < 50) {
      try { logTapToPayEvent('AMOUNT_BELOW_MINIMUM', { phase: 'startup', sessionId: terminalService.getSessionId(), meta: { amountCents } }) } catch {}
      setError('Amount must be at least $0.50.')
      return
    }

    // Double-tap protection - prevent multiple simultaneous payment attempts
    if (isPaymentInProgress) {
      console.log('[TTP UI] Payment already in progress, ignoring')
      return
    }

    // Check for unresolved attempt before starting new payment
    const unresolvedAttemptId = terminalService.getUnresolvedAttempt()
    if (unresolvedAttemptId) {
      console.log('[TTP UI] Unresolved attempt found:', unresolvedAttemptId)
      setPaymentState('ambiguous')
      setError('Please resolve the previous payment status first')
      checkAttemptStatus(unresolvedAttemptId)
      return
    }

    setIsPaymentInProgress(true)
    setPaymentState('preparing')
    setError('')
    setStructuredError(null)
    setJsError(null)
    setLastSuccessfulStage('initializing')

    try {
      console.log('[TTP UI] Checking device support')
      // Check device support
      const supportCheck = await terminalService.isSupported()
      console.log('[TTP UI] Device support check result:', supportCheck)
      if (!supportCheck.supported) {
        throw new Error('This device does not support Tap to Pay')
      }
      setLastSuccessfulStage('device_supported')

      console.log('[TTP UI] Initializing terminal')
      // Initialize if needed
      const initResult = await terminalService.initialize()
      console.log('[TTP UI] Initialize result:', initResult)
      try {
        logTapToPayEvent('RIGHT_AFTER_INITIALIZE_RETURN', {
          phase: 'initialize',
          sessionId: terminalService.getSessionId(),
          meta: {
            returnedKeys: Object.keys(initResult || {}),
            returnedStatus: (initResult as any)?.status,
            currentServiceStatus: (terminalService as any).connectionStatus,
            component: 'TapToPayModal.tsx'
          }
        })
      } catch {}
      if (initResult.status !== 'ready' && initResult.status !== 'connected') {
        try { logTapToPayEvent('INITIALIZE_RESULT_REJECTED', { phase: 'initialize', sessionId: terminalService.getSessionId(), meta: { returnedStatus: initResult.status, reason: 'unexpected_status' } }) } catch {}
        throw new Error('Failed to initialize payment terminal')
      }
      try {
        const path = initResult.status === 'connected' ? 'already_connected' : 'ready'
        logTapToPayEvent('INITIALIZE_RESULT_ACCEPTED', { phase: 'initialize', sessionId: terminalService.getSessionId(), meta: { returnedStatus: initResult.status, path } })
      } catch {}
      setLastSuccessfulStage('initialized')

      // Connect if needed (we'll always try to connect to ensure fresh session)
      if (initResult.status === 'connected') {
        try { logTapToPayEvent('CONNECT_SKIPPED_ALREADY_CONNECTED', { phase: 'connect_reader', sessionId: terminalService.getSessionId(), meta: { reason: 'already_connected_after_initialize' } }) } catch {}
        setLastSuccessfulStage('connected')
      } else {
        if (paymentStateRef.current !== 'preparing') {
          setPaymentState('preparing')
        }
        console.log('[TTP UI] Connecting to Tap to Pay')
        const connectResult = await terminalService.connectTapToPay()
        console.log('[TTP UI] Connect result:', connectResult)
        if (connectResult.status !== 'connected') {
          throw new Error('Failed to connect to payment terminal')
        }
        setLastSuccessfulStage('connected')
      }

      console.log('[TTP UI] Starting payment collection')
      // Start payment collection (this creates PaymentIntent internally)
      const paymentPromise = terminalService.startTapToPayPayment({
        amountCents,
        currency: 'usd',
        leadId,
        jobId,
        description,
      })
      // Only display WAITING_FOR_TAP once PaymentIntent exists to avoid premature UI state
      try {
        const startWait = Date.now()
        while (!terminalService.getPaymentIntentId() && Date.now() - startWait < 4000) {
          await new Promise(r => setTimeout(r, 50))
        }
        if (terminalService.getPaymentIntentId()) {
          setPaymentState('waiting_for_card')
          setLastSuccessfulStage('payment_intent_created')
        }
      } catch {}

      const paymentResult = await paymentPromise
      console.log('[TTP UI] Payment result:', paymentResult)

      if (paymentResult.status === 'succeeded') {
        setLastSuccessfulStage('payment_complete')
        setPaymentState('success')
        setIsPaymentInProgress(false)
        if (onPaymentComplete) {
          setTimeout(() => onPaymentComplete(), 1500)
        }
      } else if (
        paymentResult.status === 'canceled' ||
        paymentResult?.error?.code === 'USER_ERROR.CANCELED' ||
        paymentResult?.error?.code === 'canceled'
      ) {
        setIsPaymentInProgress(false)
        setStructuredError(null)
        setJsError(null)
        setError('')
        setPaymentState('canceled')
      } else {
        throw new Error(paymentResult.error?.message || 'Payment failed')
      }
    } catch (err) {
      console.error('[TTP ERROR] stage=payment_error error=' + (err instanceof Error ? err.message : 'Unknown'))
      console.error('[TTP ERROR] Full error object:', err)
      console.error('Tap to Pay error:', err)
      setIsPaymentInProgress(false)

      // Check if this is a Capacitor rejection with structured error data
      if (err && typeof err === 'object' && 'data' in err) {
        // Capacitor rejection with structured error from native
        const structuredData = (err as any).data
        console.log('[TTP ERROR] Structured error data:', structuredData)
        if (structuredData && structuredData.stage && structuredData.code) {
          // Check for user cancellation - treat as neutral state, not error
          if (structuredData.code === 'USER_ERROR.CANCELED' || structuredData.nativeCode === 'USER_ERROR.CANCELED') {
            setStructuredError(null) // Don't show technical details for expected cancellation
            setJsError(null)
            setError('')
            setPaymentState('canceled')
            return
          }

          setStructuredError(structuredData)
          setError(getErrorMessage(structuredData))
          setPaymentState('failure')
          return
        }
      }

      // Capture JS/service-layer error for diagnostics (only if not structured)
      if (err instanceof Error) {
        const message = err.message.toLowerCase()
        console.log('[TTP ERROR] Error message:', message)
        if (message.includes('client-secret-required')) {
          setJsError({
            code: 'client-secret-required',
            message: err.message,
            stage: 'collect_payment',
            clientSecretPresent: false
          })
        }
        // Don't create generic payment-error that overwrites structured errors
      }

      setError(getErrorMessage(err))
      setPaymentState('failure')
    }
  }

  const handleCancel = async () => {
    if (paymentState === 'waiting_for_card' || paymentState === 'processing') {
      try {
        try { logTapToPayEvent('CANCEL_BUTTON_PRESSED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined }) } catch {}
        await terminalService.cancel()
      } catch (err) {
        console.error('Cancel error:', err)
      }
    }
    setPaymentState('canceled')
  }

  const handleRetry = () => {
    try { logTapToPayEvent('RETRY_BUTTON_PRESSED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined }) } catch {}
    try { logTapToPayEvent('RESET_STARTED', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined }) } catch {}
    setPaymentState('ready')
    setError('')
    try { logTapToPayEvent('RESET_TO_READY', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined }) } catch {}
    try { logTapToPayEvent('RESET_COMPLETED', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined }) } catch {}
    waitingForConfirmationEmitted.current = null
    // Ensure service-layer internal state is fully reset so a brand new attempt/PI will be created
    terminalService.resetForRetry('user_retry').catch(() => {})
  }

  const handleDone = () => {
    onClose()
  }

  if (!isOpen) return null

  const renderState = () => {
    switch (paymentState) {
      case 'ready':
        return (
          <div className="space-y-4 sm:space-y-6">
            {/* Amount Display */}
            <div className="text-center py-4 sm:py-6">
              <p className="text-sm text-muted-foreground mb-2">Amount to collect</p>
              <p className="text-4xl font-bold text-foreground">{formatCurrency(amountCents / 100)}</p>
            </div>

            {/* Customer Context */}
            {(customerName || description) && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                {customerName && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{customerName}</span>
                  </div>
                )}
                {description && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">For:</span>
                    <span className="font-medium">{description}</span>
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            )}

            {/* Collapsible Tap to Pay Diagnostics */}
            {SHOW_TAP_TO_PAY_DIAGNOSTICS && (
              <div className="space-y-2">
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center justify-center gap-2"
                  aria-expanded={showDiagnostics}
                >
                  {showDiagnostics ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      Hide diagnostics
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      Show diagnostics
                    </>
                  )}
                </button>
                {showDiagnostics && (
                  <div className="min-h-[240px] animate-in slide-in-from-top-2 duration-200">
                    <TapToPayDiagnosticsPanel />
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => { try { logTapToPayEvent('CLOSE_BUTTON_PRESSED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; try { logTapToPayEvent('MODAL_DISMISSED', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; try { logTapToPayEvent('USER_EXITED_MODAL', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; onClose() }}
                className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartPayment}
                disabled={!isNativeSupported}
                className="flex-1 px-4 py-3 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Smartphone className="w-4 h-4" />
                Start Tap to Pay
              </button>
            </div>
          </div>
        )

      case 'preparing':
        return (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4 min-h-[200px]">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 motion-safe:animate-pulse" />
            </div>
            <p className="text-lg font-medium">Preparing Tap to Pay</p>
            <p className="text-sm text-muted-foreground">Getting the secure reader ready</p>
          </div>
        )

      case 'waiting_for_card':
        return (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4 sm:space-y-6 min-h-[240px]">
            {/* NFC Icon with breathing animation */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Smartphone className="w-12 h-12 text-primary" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 motion-safe:animate-pulse" />
              <div className="absolute inset-0 rounded-full border-2 border-primary/10 motion-safe:animate-ping" style={{ animationDuration: '2s' }} />
            </div>

            <div className="text-center space-y-2">
              <p className="text-2xl font-bold">{formatCurrency(amountCents / 100)}</p>
              <p className="text-lg font-medium">Ready for Tap</p>
              <p className="text-sm text-muted-foreground">
                {platform === 'ios' ? 'Hold card near the top of this iPhone' :
                 platform === 'android' ? 'Hold card near the back of this device' :
                 'Hold the customer\'s card or phone near this device'}
              </p>
            </div>

            {/* Collapsible Diagnostics */}
            {SHOW_TAP_TO_PAY_DIAGNOSTICS && (
              <div className="w-full space-y-2">
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center justify-center gap-2"
                  aria-expanded={showDiagnostics}
                >
                  {showDiagnostics ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      Hide diagnostics
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      Show diagnostics
                    </>
                  )}
                </button>
                {showDiagnostics && (
                  <div className="w-full px-4 min-h-[240px] animate-in slide-in-from-top-2 duration-200">
                    <TapToPayDiagnosticsPanel />
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )

      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4 min-h-[200px]">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 motion-safe:animate-pulse" />
            </div>
            <p className="text-lg font-medium">Processing payment</p>
            <p className="text-sm text-muted-foreground">Keep ReplyFlow open</p>
          </div>
        )

      case 'success':
        return (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4 sm:space-y-6 min-h-[240px]">
            <div className="relative transition-opacity duration-300 motion-reduce:opacity-100">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center motion-safe:scale-95 motion-safe:opacity-0 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out motion-safe:opacity-100 motion-safe:scale-100">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-green-500/20 motion-safe:scale-100 motion-safe:opacity-100 motion-safe:transition-all motion-safe:duration-500 motion-safe:ease-out motion-safe:opacity-0 motion-safe:scale-125" />
            </div>

            <div className="text-center space-y-2 motion-safe:translate-y-4 motion-safe:opacity-0 motion-safe:transition-all motion-safe:duration-300 motion-safe:ease-out motion-safe:translate-y-0 motion-safe:opacity-100">
              <p className="text-2xl font-bold">Payment successful</p>
              <p className="text-lg font-medium">{formatCurrency(amountCents / 100)}</p>
              <p className="text-sm text-muted-foreground">Payment complete</p>
            </div>

            <button
              onClick={() => { try { logTapToPayEvent('USER_EXITED_MODAL', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; handleDone() }}
              className="px-6 py-3 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        )

      case 'failure':
        return (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4 sm:space-y-6 min-h-[240px] motion-safe:opacity-0 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:opacity-100">
            <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Payment wasn't completed</p>
              {error && (
                <p className="text-sm text-muted-foreground">{error}</p>
              )}
            </div>

            {/* Technical details - only for diagnostic build */}
            {(structuredError || jsError) && (
              <div className="w-full space-y-2">
                <button
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {showTechnicalDetails ? (
                    <>
                      <ChevronUp className="w-3 h-3" />
                      Hide technical details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-3 h-3" />
                      Show technical details
                    </>
                  )}
                </button>

                {showTechnicalDetails && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2 text-xs">
                    <div className="font-medium text-foreground">Error Details</div>
                    <div className="space-y-1 text-muted-foreground">
                      {structuredError && (
                        <>
                          <div>Stage: {structuredError.stage}</div>
                          <div>Code: {structuredError.code}</div>
                          {structuredError.nativeCode && <div>Native Code: {structuredError.nativeCode}</div>}
                          <div>Message: {structuredError.message}</div>
                        </>
                      )}
                      {jsError && (
                        <>
                          <div>Stage: {jsError.stage}</div>
                          <div>Code: {jsError.code}</div>
                          <div>Message: {jsError.message}</div>
                          {jsError.clientSecretPresent !== undefined && (
                            <div>Client Secret Present: {jsError.clientSecretPresent ? 'Yes' : 'No'}</div>
                          )}
                        </>
                      )}
                      <div>Last Successful Stage: {lastSuccessfulStage}</div>
                    </div>

                    {structuredError?.deviceState && (
                      <>
                        <div className="font-medium text-foreground mt-3">Device State</div>
                        <div className="space-y-1 text-muted-foreground">
                          <div>Build: {structuredError.deviceState.buildMarker}</div>
                          <div>Debuggable: {structuredError.deviceState.isDebuggable ? 'Yes' : 'No'}</div>
                          <div>Android SDK: {structuredError.deviceState.androidSdk}</div>
                          <div>Device: {structuredError.deviceState.manufacturer} {structuredError.deviceState.model}</div>
                          <div>NFC Available: {structuredError.deviceState.nfcAvailable ? 'Yes' : 'No'}</div>
                          <div>NFC Enabled: {structuredError.deviceState.nfcEnabled ? 'Yes' : 'No'}</div>
                          <div>Terminal Initialized: {structuredError.deviceState.terminalInitialized ? 'Yes' : 'No'}</div>
                          <div>Connection Status: {structuredError.deviceState.connectionStatus}</div>
                          <div>Reader Connected: {structuredError.deviceState.readerConnected ? 'Yes' : 'No'}</div>
                          {structuredError.deviceState.operationState && (
                            <div>Operation State: {structuredError.deviceState.operationState}</div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { try { logTapToPayEvent('CLOSE_BUTTON_PRESSED', { phase: terminalService.getCurrentPhase() as any, sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; try { logTapToPayEvent('MODAL_DISMISSED', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; try { logTapToPayEvent('USER_EXITED_MODAL', { phase: 'startup', sessionId: terminalService.getSessionId(), attemptId: terminalService.getCurrentAttemptId() || undefined, meta: { modal: 'TapToPay' } }) } catch {}; onClose() }}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleRetry}
                className="px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )

      case 'canceled':
        return (
          <div className="flex flex-col items-center justify-center py-8 sm:py-12 space-y-4 sm:space-y-6 min-h-[240px] motion-safe:opacity-0 motion-safe:transition-opacity motion-safe:duration-200 motion-safe:opacity-100">
            <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-slate-600 dark:text-slate-400" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Payment canceled</p>
              <p className="text-sm text-muted-foreground">You can try again when ready</p>
            </div>

            <button
              onClick={handleRetry}
              className="px-6 py-3 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Start Again
            </button>
          </div>
        )

      case 'pending':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <AlertCircle className="w-10 h-10 text-amber-600 dark:text-amber-400" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Payment is still being confirmed</p>
              <p className="text-sm text-muted-foreground">
                We're confirming the final payment status. Don't charge the customer again yet.
              </p>
            </div>

            <button
              onClick={handleDone}
              className="px-6 py-3 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        )

      default:
        return null
    }
  }

  return (
    typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-x-0 top-0 h-[100dvh] z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-md max-h-[calc(100dvh-32px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:max-h-[90vh] overflow-hidden flex flex-col min-h-0 animate-in zoom-in-95 duration-200 mx-auto sm:mx-0">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 sm:px-5 sm:py-4 border-b border-border/50 bg-card shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Tap to Pay</h3>
          </div>
          {(paymentState === 'ready' || paymentState === 'failure' || paymentState === 'canceled') && (
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div data-scroll-lock-allow className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5 sm:py-6 space-y-3 sm:space-y-4 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' as any, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {renderState()}
        </div>
      </div>
    </div>, document.body) : null
  )
}
