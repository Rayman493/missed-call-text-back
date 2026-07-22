'use client'

import { useState, useEffect } from 'react'
import { X, CreditCard, Smartphone, Loader2, CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { isNativeCapacitor } from '@/lib/terminal'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import type { TerminalError, DeviceState } from '@/lib/terminal'

interface TapToPayModalProps {
  isOpen: boolean
  onClose: () => void
  amountCents: number
  leadId?: string
  jobId?: string
  description?: string
  customerName?: string
  onPaymentComplete?: () => void
}

type PaymentState = 'ready' | 'preparing' | 'waiting_for_card' | 'processing' | 'success' | 'failure' | 'canceled' | 'pending'

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
}: TapToPayModalProps) {
  const [paymentState, setPaymentState] = useState<PaymentState>('ready')
  const [error, setError] = useState<string>('')
  const [structuredError, setStructuredError] = useState<TerminalError | null>(null)
  const [jsError, setJsError] = useState<{ code: string; message: string; stage?: string; clientSecretPresent?: boolean } | null>(null)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const [terminalService] = useState(() => new TerminalBridgeService())
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [lastSuccessfulStage, setLastSuccessfulStage] = useState<string>('none')

  useBodyScrollLock(isOpen)

  // Check native support when modal opens
  useEffect(() => {
    if (isOpen) {
      const supported = isNativeCapacitor()
      setIsNativeSupported(supported)
      if (!supported) {
        setError('Tap to Pay is only available on the mobile app')
      }
    } else {
      // Reset when closed
      setPaymentState('ready')
      setError('')
      setStructuredError(null)
      setJsError(null)
      setShowTechnicalDetails(false)
      setLastSuccessfulStage('none')
    }
  }, [isOpen])

  // Handle Android back and browser back
  useEffect(() => {
    if (!isOpen) return

    try {
      window.history.pushState({ rfTapToPay: true }, '')
    } catch {}

    const onPopState = () => {
      if (paymentState === 'ready' || paymentState === 'failure' || paymentState === 'canceled') {
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
    ;(async () => {
      try {
        const Terminal = await import('@/lib/terminal')
        const plugin = Terminal.default
        errorListener = await plugin.addListener('error', (data: TerminalError) => {
          console.log('[TapToPayModal] Structured error received:', data)
          setStructuredError(data)
        })
      } catch (err) {
        console.error('[TapToPayModal] Failed to register error listener:', err)
      }
    })()

    return () => {
      errorListener?.remove?.()
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

  const handleStartPayment = async () => {
    if (!isNativeSupported) {
      setError('Tap to Pay is only available on the mobile app')
      return
    }

    setPaymentState('preparing')
    setError('')
    setLastSuccessfulStage('initializing')

    try {
      // Check device support
      const supportCheck = await terminalService.isSupported()
      if (!supportCheck.supported) {
        throw new Error('This device does not support Tap to Pay')
      }
      setLastSuccessfulStage('device_supported')

      // Initialize if needed
      const initResult = await terminalService.initialize()
      if (initResult.status !== 'ready') {
        throw new Error('Failed to initialize payment terminal')
      }
      setLastSuccessfulStage('initialized')

      // Connect if needed (we'll always try to connect to ensure fresh session)
      setPaymentState('preparing')
      const connectResult = await terminalService.connectTapToPay()
      if (connectResult.status !== 'connected') {
        throw new Error('Failed to connect to payment terminal')
      }
      setLastSuccessfulStage('connected')

      // Start payment collection (this creates PaymentIntent internally)
      setPaymentState('waiting_for_card')
      setLastSuccessfulStage('payment_intent_created')

      const paymentResult = await terminalService.startTapToPayPayment({
        amountCents,
        currency: 'usd',
        leadId,
        jobId,
        description,
      })

      if (paymentResult.status === 'succeeded') {
        setLastSuccessfulStage('payment_complete')
        setPaymentState('success')
        if (onPaymentComplete) {
          setTimeout(() => onPaymentComplete(), 1500)
        }
      } else {
        throw new Error(paymentResult.error?.message || 'Payment failed')
      }
    } catch (err) {
      console.error('Tap to Pay error:', err)

      // Check if this is a Capacitor rejection with structured error data
      if (err && typeof err === 'object' && 'data' in err) {
        // Capacitor rejection with structured error from native
        const structuredData = (err as any).data
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
        await terminalService.cancel()
      } catch (err) {
        console.error('Cancel error:', err)
      }
    }
    setPaymentState('canceled')
  }

  const handleRetry = () => {
    setPaymentState('ready')
    setError('')
  }

  const handleDone = () => {
    onClose()
  }

  if (!isOpen) return null

  const renderState = () => {
    switch (paymentState) {
      case 'ready':
        return (
          <div className="space-y-6">
            {/* Amount Display */}
            <div className="text-center py-6">
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

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
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
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-lg font-medium">Preparing Tap to Pay...</p>
            <p className="text-sm text-muted-foreground">Keep this screen open</p>
          </div>
        )

      case 'waiting_for_card':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            {/* NFC Icon */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
                <Smartphone className="w-12 h-12 text-primary" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-2xl font-bold">{formatCurrency(amountCents / 100)}</p>
              <p className="text-lg font-medium">Ready for payment</p>
              <p className="text-sm text-muted-foreground">
                Hold the customer's card or phone near this device
              </p>
            </div>

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
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <p className="text-lg font-medium">Processing payment...</p>
            <p className="text-sm text-muted-foreground">Do not retry or close this screen</p>
          </div>
        )

      case 'success':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-2xl font-bold">{formatCurrency(amountCents / 100)}</p>
              <p className="text-lg font-medium">Payment received</p>
              <p className="text-sm text-muted-foreground">Paid successfully</p>
            </div>

            <button
              onClick={handleDone}
              className="px-6 py-3 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors"
            >
              Done
            </button>
          </div>
        )

      case 'failure':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
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
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onClose}
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
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <XCircle className="w-10 h-10 text-slate-600 dark:text-slate-400" />
            </div>

            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Payment canceled</p>
              <p className="text-sm text-muted-foreground">No charge was made</p>
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
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
        <div className="flex-1 overflow-y-auto px-5 py-6">
          {renderState()}
        </div>
      </div>
    </div>
  )
}
