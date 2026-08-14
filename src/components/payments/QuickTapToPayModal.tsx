'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Smartphone, User, Briefcase, Loader2, ChevronRight, CheckCircle2, AlertCircle, XCircle, MapPin, BookOpen } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { useTapToPayOrchestration } from '@/hooks/useTapToPayOrchestration'
import { useTapToPayReaderPresentation } from '@/hooks/useTapToPayReaderPresentation'
import { Capacitor } from '@capacitor/core'
import { TapToPayEducationModal } from '@/components/TapToPayEducationModal'
import { hasPendingEducationPromise, resolveEducation } from '@/lib/education-promise-bridge'
import { normalizeToE164 } from '@/utils/phone-formatting'
import QuickTapToPayDiagnostics from './QuickTapToPayDiagnostics'

interface QuickTapToPayModalProps {
  isOpen: boolean
  onClose: () => void
  onRefreshAfterSuccess?: () => Promise<void> | void
}

export default function QuickTapToPayModal({
  isOpen,
  onClose,
  onRefreshAfterSuccess,
}: QuickTapToPayModalProps) {
  const { business } = useBusiness()
  const terminalService = useMemo(() => TerminalBridgeService.getInstance(), [])
  const [amountCents, setAmountCents] = useState<number>(0)
  const [amountDisplay, setAmountDisplay] = useState<string>('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  // Minimum payment amount validation
  const MINIMUM_AMOUNT_CENTS = 50 // $0.50
  const isAmountValid = amountCents === 0 || amountCents >= MINIMUM_AMOUNT_CENTS
  const isAmountBelowMinimum = amountCents > 0 && amountCents < MINIMUM_AMOUNT_CENTS
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [description, setDescription] = useState<string>('')
  const [leads, setLeads] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [isLoadingLeads, setIsLoadingLeads] = useState(false)
  const [isLoadingJobs, setIsLoadingJobs] = useState(false)
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [disabledReason, setDisabledReason] = useState<string>('')

  // Location guidance card states (inline on setup screen, not overlays)
const [showLocationPermissionCard, setShowLocationPermissionCard] = useState(false)
const [showLocationServicesCard, setShowLocationServicesCard] = useState(false)
const [showLocationBlockedCard, setShowLocationBlockedCard] = useState(false)
const [isRequestingLocationPermission, setIsRequestingLocationPermission] = useState(false)

// Education modal state
const [showEducationModal, setShowEducationModal] = useState(false)
const [showEducationConfirmation, setShowEducationConfirmation] = useState(false)

// Receipt modal state
const [showReceiptModal, setShowReceiptModal] = useState(false)
const [receiptPhoneNumber, setReceiptPhoneNumber] = useState('')
const [isSendingReceipt, setIsSendingReceipt] = useState(false)
const [receiptSent, setReceiptSent] = useState(false)
const [receiptError, setReceiptError] = useState('')

const handleEducationComplete = async () => {
  try {
    const response = await fetch('/api/business/tap-to-pay-education', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (response.ok) {
      const data = await response.json()
      console.log('[QuickTapToPayModal] Education completed:', data)
      resolveEducation('completed')
      setShowEducationModal(false)
      setShowEducationConfirmation(false)
    }
  } catch (error) {
    console.error('[QuickTapToPayModal] Failed to complete education:', error)
  }
}

const handleEducationCancel = () => {
  resolveEducation('canceled')
  setShowEducationModal(false)
  setShowEducationConfirmation(false)
}

const handleConfirmationContinue = async () => {
  await logTapToPayEvent('EDUCATION_CONFIRMATION_PRIMARY_PRESSED', {
    phase: 'education',
    sessionId: terminalService?.getSessionId() || undefined,
    attemptId: terminalService?.getCurrentAttemptId() || undefined,
    paymentState: 'education_waiting_for_confirmation',
    meta: { action: 'yes_continue' }
  })
  resolveEducation('completed')
  setShowEducationConfirmation(false)
}

const handleConfirmationCancel = async () => {
  await logTapToPayEvent('EDUCATION_CONFIRMATION_SECONDARY_PRESSED', {
    phase: 'education',
    sessionId: terminalService?.getSessionId() || undefined,
    attemptId: terminalService?.getCurrentAttemptId() || undefined,
    paymentState: 'education_waiting_for_confirmation',
    meta: { action: 'not_yet' }
  })
  resolveEducation('canceled')
  setShowEducationConfirmation(false)
}

const handleSendReceipt = () => {
  // Prefill customer phone number if available
  if (paymentAssociation.type === 'customer' && paymentAssociation.leadId) {
    const lead = leads.find(l => l.id === paymentAssociation.leadId)
    if (lead?.phone) {
      setReceiptPhoneNumber(lead.phone)
    }
  }
  setShowReceiptModal(true)
  setReceiptSent(false)
  setReceiptError('')
  // Update Apple checklist
  if (terminalService) {
    import('@/lib/tap-to-pay-diagnostics').then(({ updateAppleChecklist }) => {
      updateAppleChecklist('receiptOptionShown', 'shown')
    }).catch(() => {})
  }
}

const handleSendReceiptSubmit = async () => {
  setIsSendingReceipt(true)
  setReceiptError('')

  try {
    // Validate paymentRequestId is available
    if (!paymentRequestId) {
      throw new Error('Payment information not available. Please close and try again.')
    }

    // Normalize phone to E.164 format
    const normalizedPhone = normalizeToE164(receiptPhoneNumber)
    if (!normalizedPhone) {
      throw new Error('Enter a valid phone number')
    }

    console.log('[QuickTapToPayModal] Sending receipt:', {
      paymentRequestId,
      normalizedPhone,
      originalPhone: receiptPhoneNumber
    })

    // Call receipt endpoint
    const response = await fetch('/api/payments/send-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentRequestId,
        phoneNumber: normalizedPhone,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || 'Failed to send receipt')
    }

    const result = await response.json()
    console.log('[QuickTapToPayModal] Receipt sent successfully:', result)

    // Show success state
    setReceiptSent(true)
  } catch (error) {
    console.error('[QuickTapToPayModal] Failed to send receipt:', error)
    setReceiptError(error instanceof Error ? error.message : 'Failed to send receipt')
  } finally {
    setIsSendingReceipt(false)
  }
}

const handleOpenStripeManagement = async () => {
  if (!business?.id || !business.stripe_connect_account_id) {
    return
  }

  try {
    const response = await fetch('/api/stripe/connect/management-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    })

    if (!response.ok) {
      throw new Error('Failed to open Stripe management')
    }

    const data = await response.json()
    if (data.url) {
      window.open(data.url, '_blank', 'noopener,noreferrer')
    }
  } catch (error) {
    console.error('[QuickTapToPayModal] Failed to open Stripe management:', error)
  }
}

// Canonical association object for customer/job selection
type PaymentAssociation =
  | {
      type: 'quick'
      leadId: null
      jobId: null
      label: 'Quick Payment'
      secondaryLabel: null
    }
  | {
      type: 'customer'
      leadId: string
      jobId: null
      label: string
      secondaryLabel: string | null
    }
  | {
      type: 'job'
      leadId: string | null
      jobId: string
      label: string
      secondaryLabel: string | null
    }

type AssociationView = 'payment_setup' | 'association_menu' | 'customer_list' | 'job_list'

const [paymentAssociation, setPaymentAssociation] = useState<PaymentAssociation>({
  type: 'quick',
  leadId: null,
  jobId: null,
  label: 'Quick Payment',
  secondaryLabel: null
})

const [associationView, setAssociationView] = useState<AssociationView>('payment_setup')

// Selection commit guard to prevent duplicate commits
const selectionCommitInProgressRef = useRef(false)

// One-shot continuation guard to prevent duplicate ATTEMPT_STARTED
const continuationAttemptedRef = useRef(false)

// Permission normalizer to ensure correct classification
const normalizeLocationPermissionResult = (raw: any, source: 'check' | 'request') => {
  const rawStatus = raw?.status || null
  const rawCanAskAgain = raw?.canAskAgain ?? null
  const rawLocationEnabled = raw?.locationEnabled ?? false
  const rawGranted = raw?.granted ?? false
  
  // Preserve null/undefined as null, don't coerce to false
  const canAskAgain = rawCanAskAgain === null ? null : rawCanAskAgain
  
  const result = {
    granted: rawGranted,
    canAskAgain,
    locationEnabled: rawLocationEnabled,
    rawStatus,
    source
  }
  
  return result
}

  // Ref for modal title for accessibility focus
  const titleRef = useRef<HTMLHeadingElement>(null)





  // Track previous isOpen state to detect modal open transition
  const previousIsOpenRef = useRef(false)

  // Use the orchestration hook
  const {
    paymentState,
    error,
    structuredError,
    mappedError,
    isPaymentInProgress,
    platform,
    isNativeSupported: hookIsNativeSupported,
    lastSuccessfulStage,
    lastResetReason,
    startPayment,
    cancelPayment,
    retryPayment,
    retryAfterCancellation,
    resetTapToPayUiState,
    resetToSetup,
    checkPlatformSupport,
    requestLocationPermission,
    checkLocationPermission,
    educationWaitingForConfirmation,
    paymentRequestId,
    lastCompletedAttempt,
  } = useTapToPayOrchestration({
    amountCents,
    leadId: selectedLeadId || undefined,
    jobId: selectedJobId || undefined,
    description,
    onPaymentComplete: () => {
      // Payment completion handling is now done in handlePaymentComplete when user dismisses modal
      // This prevents page refresh while success modal is still visible
    },
    onPaymentError: () => {},
  })

  // Use shared reader presentation hook
  const {
    state: readerState,
    resetState: resetReaderState,
    setPreparing: setReaderPreparing,
  } = useTapToPayReaderPresentation(isOpen && hookIsNativeSupported)

  // ===== PRESENTATION PHASE DERIVATION =====
  // This is a pure presentation layer that maps authoritative paymentState
  // to stable user-visible phases. It does NOT modify orchestration behavior.
  type PresentationPhase =
    | 'ready'
    | 'preparing'
    | 'waiting_for_card'
    | 'processing'
    | 'confirming'
    | 'success'
    | 'declined'
    | 'canceled'
    | 'recoverable_error'
    | 'uncertain'
    | 'education_pending'
    | 'education_waiting_for_confirmation'

  const visiblePhase: PresentationPhase = useMemo(() => {
    // Education states pass through
    if (paymentState === 'education_pending') return 'education_pending'
    if (paymentState === 'education_waiting_for_confirmation') return 'education_waiting_for_confirmation'

    // Terminal states pass through
    if (paymentState === 'ready') return 'ready'
    if (paymentState === 'canceled') return 'canceled'

    // Collapse preparation states into one stable phase
    if (paymentState === 'preparing' || paymentState === 'connecting_reader' || paymentState === 'creating_payment_intent') {
      return 'preparing'
    }

    // Waiting for card
    if (paymentState === 'waiting_for_card') return 'waiting_for_card'

    // Processing
    if (paymentState === 'processing') {
      // Check if we should show confirming phase instead
      // Use available evidence: native success + reconciliation in progress
      // This is presentation-only - actual success gate remains in orchestration
      const attemptId = terminalService?.getCurrentAttemptId()
      const sessionId = terminalService?.getSessionId()

      // If we have evidence of native success but not yet authoritative success,
      // show confirming phase
      if (lastSuccessfulStage === 'payment_native_succeeded' ||
          lastSuccessfulStage === 'reconciliation_started') {
        return 'confirming'
      }

      return 'processing'
    }

    // Success - controlled by existing orchestration success gate
    if (paymentState === 'success') return 'success'

    // Failure - check if it's a decline vs other error
    if (paymentState === 'failure') {
      // If the mapped error indicates a decline, show declined phase
      if (mappedError?.title === 'Card Declined') {
        return 'declined'
      }
      // If it's ambiguous outcome, show uncertain
      if (mappedError?.title === 'Payment in Progress' ||
          mappedError?.action === 'back') {
        return 'uncertain'
      }
      // Otherwise show as recoverable error
      return 'recoverable_error'
    }

    // Ambiguous state
    if (paymentState === 'ambiguous') {
      return 'uncertain'
    }

    // Pending/ambiguous states
    if (paymentState === 'pending' || paymentState === 'ambiguous') {
      return 'uncertain'
    }

    // Default fallback
    return 'ready'
  }, [paymentState, lastSuccessfulStage, mappedError, terminalService])

  // Derive whether error is still presentation-relevant
  // Errors from preparation should not show if we've advanced to success
  const isErrorPresentationRelevant = useMemo(() => {
    // If we're in success phase, no error is relevant
    if (visiblePhase === 'success') return false

    // If we're in confirming phase, no preparation errors are relevant
    if (visiblePhase === 'confirming') return false

    // If we're in processing, only show errors if the state is actually failure
    if (visiblePhase === 'processing' && paymentState !== 'failure') return false

    // If we're in education states, no error is relevant (education is expected flow)
    if (visiblePhase === 'education_pending' || visiblePhase === 'education_waiting_for_confirmation') return false

    // Otherwise, error is relevant
    return true
  }, [visiblePhase, paymentState])

  // Normalize reader display messages for user-facing presentation
  // Filter out technical Stripe Terminal messages, keep only actionable customer prompts
  const normalizedReaderMessage = useMemo(() => {
    if (!readerState.displayMessage && !readerState.instruction) return null

    // List of technical/internal messages to filter out
    const technicalPatterns = [
      /reader/i,
      /terminal/i,
      /connect/i,
      /disconnect/i,
      /update/i,
      /config/i,
      /initialize/i,
      /ready/i,
      /scanning/i,
      /bluetooth/i,
    ]

    const message = readerState.displayMessage || readerState.instruction || ''

    // Filter out numeric values (enum codes) and non-string types
    if (typeof message !== 'string' || message.trim() === '' || /^\d+$/.test(message.trim())) {
      return null
    }

    // If it looks like a technical message, don't display it
    if (technicalPatterns.some(pattern => pattern.test(message))) {
      return null
    }

    // If it's a genuine customer instruction, display it
    return message
  }, [readerState.displayMessage, readerState.instruction])

  // Ref to store resetToSetup for modal-open effect (avoid unstable dependency)
  const resetToSetupRef = useRef(resetToSetup)
  resetToSetupRef.current = resetToSetup

  // Show confirmation UI when hook indicates waiting for confirmation
  useEffect(() => {
    if (educationWaitingForConfirmation && !showEducationConfirmation) {
      logTapToPayEvent('EDUCATION_CONFIRMATION_UI_SHOWN', {
        phase: 'education',
        sessionId: terminalService?.getSessionId() || undefined,
        attemptId: terminalService?.getCurrentAttemptId() || undefined,
        paymentState: 'education_waiting_for_confirmation',
        meta: { correlationId: undefined }
      }).catch(() => {})
      setShowEducationConfirmation(true)
    } else if (!educationWaitingForConfirmation && showEducationConfirmation) {
      setShowEducationConfirmation(false)
    }
  }, [educationWaitingForConfirmation, showEducationConfirmation])

  // Ref to track previous payment state for accurate reset reasons
  const prevPaymentStateRef = useRef<string>('ready')
  const prevIsOpenRef = useRef(false)

  // Ref to prevent duplicate close handlers
  const closeHandledRef = useRef(false)

  // Derive showPaymentSetup from paymentState to ensure UI is always in sync
  const showPaymentSetup = paymentState === 'ready'

  // Emergency cleanup function to reset UI state
  const emergencyCleanup = useCallback(() => {
    // Clear spinner flags
    setIsLoadingLeads(false)
    setIsLoadingJobs(false)
    
    // Reset orchestration state
    resetTapToPayUiState()
    
    // Note: We don't clear amount/customer/job as user may want to retry
  }, [resetTapToPayUiState])

  // Modal-open effect: reset state when opening, but use accurate reasons
  useEffect(() => {
    if (!isOpen) {
      // Track state when modal closes
      prevIsOpenRef.current = false
      prevPaymentStateRef.current = paymentState
      // Reset reader presentation state when modal closes
      resetReaderState()
      return
    }

    // Modal is opening
    const wasClosed = !prevIsOpenRef.current
    const previousState = prevPaymentStateRef.current

    // Only reset if modal was previously closed (fresh open, not state change within open modal)
    if (wasClosed) {
      // Reset close guard for fresh modal session
      closeHandledRef.current = false

      // Use accurate reset reason based on previous state
      let resetReason = 'modal_reopened'
      if (previousState === 'success') {
        resetReason = 'reset_prepared_for_next_open'
      } else if (previousState === 'ready') {
        resetReason = 'setup_initialized'
      }

      // Call resetToSetup via ref to avoid unstable dependency
      resetToSetupRef.current(resetReason)
    }

    prevIsOpenRef.current = true
  }, [isOpen, paymentState, resetReaderState])

  // Focus modal title on open for accessibility (prevents keyboard from opening on amount input)
  useEffect(() => {
    if (isOpen && titleRef.current) {
      titleRef.current.focus()
    }
  }, [isOpen])

  // Scroll ref for content area
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useBodyScrollLock(isOpen)

  // Check native support when modal opens
  useEffect(() => {
    if (isOpen) {
      ;(async () => {
        try {
          const result = await checkPlatformSupport()
          setIsNativeSupported(result.isNativeSupported)
          if (!result.isNativeSupported) {
            setDisabledReason('Native platform not supported or plugin not available')
          } else {
            setDisabledReason('')
          }
        } catch (err) {
          console.error('[QuickTTP UI] Platform detection error:', err)
          setIsNativeSupported(false)
          setDisabledReason('Platform detection error')
        }
      })()

      // Diagnostics: modal opened
      if (terminalService) {
        logTapToPayEvent('MODAL_OPENED', { phase: 'startup', sessionId: terminalService.getSessionId(), meta: { modal: 'QuickTapToPay' } }).catch(() => {})
      }

      // Reset state only on actual modal open, not on dependency changes
      setAmountCents(0)
      setAmountDisplay('')
      setSelectedLeadId(null)
      setSelectedJobId(null)
      setDescription('')
      setAssociationView('payment_setup')
      setPaymentAssociation({
        type: 'quick',
        leadId: null,
        jobId: null,
        label: 'Quick Payment',
        secondaryLabel: null
      })
      continuationAttemptedRef.current = false
    }
    return () => {
      if (isOpen) {
        if (terminalService) {
        logTapToPayEvent('MODAL_CLOSED', { phase: 'startup', sessionId: terminalService.getSessionId(), meta: { modal: 'QuickTapToPay' } }).catch(() => {})
      }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Load jobs when lead is selected
  useEffect(() => {
    if (selectedLeadId && !isLoadingJobs && jobs.length === 0) {
      loadJobs(selectedLeadId)
    } else if (!selectedLeadId) {
      setJobs([])
      setSelectedJobId(null)
    }
  }, [selectedLeadId, isLoadingJobs, jobs.length])

  const loadLeads = async () => {
    setIsLoadingLeads(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`/api/leads?business_id=${business?.id}&limit=50`, {
        headers,
      })

      if (response.ok) {
        const data = await response.json()
        setLeads(data.leads || [])
      }
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      setIsLoadingLeads(false)
    }
  }

  const loadJobs = async (leadId: string) => {
    setIsLoadingJobs(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(`/api/jobs?lead_id=${leadId}`, {
        headers,
      })

      if (response.ok) {
        const data = await response.json()
        setJobs(data.jobs || [])
      }
    } catch (error) {
      console.error('Failed to load jobs:', error)
    } finally {
      setIsLoadingJobs(false)
    }
  }

  const prevHadAmountRef = useRef(false)
  const handleAmountChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    if (parts.length > 2) {
      parts.splice(2)
    }
    if (parts[1] && parts[1].length > 2) {
      parts[1] = parts[1].slice(0, 2)
    }
    const newValue = parts.join('.')
    setAmountDisplay(newValue)
    const dollars = parseFloat(newValue) || 0
    setAmountCents(Math.round(dollars * 100))
    const hasAmount = Math.round(dollars * 100) > 0
    if (terminalService) {
      logTapToPayEvent('AMOUNT_CHANGED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents: Math.round(dollars * 100) } }).catch(() => {})
    }
    if (dollars > 0 && terminalService) {
      logTapToPayEvent('AMOUNT_ENTERED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents: Math.round(dollars * 100) } }).catch(() => {})
    }
    prevHadAmountRef.current = hasAmount
  }

  const handleQuickAmount = (dollars: number) => {
    setAmountDisplay(dollars.toString())
    setAmountCents(dollars * 100)
    if (terminalService) {
      logTapToPayEvent('QUICK_AMOUNT_SELECTED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents: dollars * 100 } }).catch(() => {})
    }
  }

  const handleStartPayment = async () => {
    if (amountCents > 0 && amountCents < MINIMUM_AMOUNT_CENTS) {
      return
    }
    if (terminalService) {
      logTapToPayEvent('PAY_BUTTON_PRESSED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents } }).catch(() => {})
    }
    
    // Check location permission first for Android
    if (platform === 'android') {
      const rawLocationCheck = await checkLocationPermission()
      const locationCheck = normalizeLocationPermissionResult(rawLocationCheck, 'check')
      
      if (!locationCheck.granted && locationCheck.canAskAgain === true) {
        // Show inline permission card on setup screen
        setShowLocationPermissionCard(true)
        return
      } else if (!locationCheck.granted && locationCheck.canAskAgain === false) {
        // Show inline blocked card on setup screen
        setShowLocationBlockedCard(true)
        return
      } else if (!locationCheck.granted && locationCheck.canAskAgain === null) {
        // Unknown state - show permission card with re-prompt
        setShowLocationPermissionCard(true)
        return
      } else if (locationCheck.granted && !locationCheck.locationEnabled) {
        // Show inline services card on setup screen
        setShowLocationServicesCard(true)
        return
      }
    }
    
    // One-shot continuation guard to prevent duplicate ATTEMPT_STARTED
    if (continuationAttemptedRef.current) {
      return
    }
    continuationAttemptedRef.current = true
    
    await startPayment()
  }

  const handlePaymentComplete = async () => {
    // Prevent duplicate close handlers
    if (closeHandledRef.current) {
      return
    }
    closeHandledRef.current = true

    // Dispatch event for Recent Payments refresh before closing modal
    const paymentIntentId = terminalService?.getPaymentIntentId()
    if (paymentIntentId) {
      window.dispatchEvent(new CustomEvent('replyflow:payment-completed', {
        detail: { paymentIntentId }
      }))
    }
    onClose()
    onRefreshAfterSuccess?.()
  }

  // Handle Android back and browser back
  useEffect(() => {
    if (!isOpen) return

    try {
      window.history.pushState({ rfQuickTapToPay: true }, '')
    } catch {}

    const onPopState = () => {
      if (visiblePhase === 'recoverable_error' || visiblePhase === 'uncertain' || visiblePhase === 'declined') {
        // On back from error, go to setup
        // handled by cancelPayment which resets state
        cancelPayment()
      } else if (visiblePhase === 'success') {
        handlePaymentComplete()
      } else if (visiblePhase === 'canceled') {
        onClose()
      } else if (visiblePhase === 'ready') {
        onClose()
      } else {
        // During active payment, allow cancel
        cancelPayment()
      }
    }
    window.addEventListener('popstate', onPopState)

    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => {
          if (visiblePhase === 'recoverable_error' || visiblePhase === 'uncertain' || visiblePhase === 'declined') {
            cancelPayment()
          } else if (visiblePhase === 'success') {
            handlePaymentComplete()
          } else if (visiblePhase === 'canceled') {
            onClose()
          } else if (visiblePhase === 'ready') {
            onClose()
          } else {
            cancelPayment()
          }
        })
      } catch {}
    })()

    return () => {
      window.removeEventListener('popstate', onPopState)
      capListener?.remove?.()
    }
  }, [isOpen, onClose, visiblePhase, cancelPayment])

  // Timer for connecting state to show elapsed time reassurance
  // REMOVED: We now use a stable "Preparing Tap to Pay" phase instead of time-based messages

  if (!isOpen) return null

  const selectedLead = leads.find(l => l.id === paymentAssociation.leadId)
  const selectedJob = jobs.find(j => j.id === paymentAssociation.jobId)

  return (
    <>
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-x-0 top-0 h-[100dvh] z-[70] flex items-center justify-center p-3 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-md max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] overflow-hidden flex flex-col min-h-0 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-green-500/10 rounded-lg flex items-center justify-center select-none">
                  <Smartphone className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                </div>
                <h3 ref={titleRef} className="text-base font-semibold text-foreground select-none" tabIndex={-1}>
                  {showPaymentSetup ? 'Tap to Pay' :
                   visiblePhase === 'preparing' ? 'Preparing Tap to Pay' :
                   visiblePhase === 'waiting_for_card' ? 'Ready for payment' :
                   visiblePhase === 'processing' ? 'Processing payment' :
                   visiblePhase === 'confirming' ? 'Confirming payment' :
                   visiblePhase === 'success' ? 'Payment complete' :
                   visiblePhase === 'declined' ? 'Payment declined' :
                   visiblePhase === 'canceled' ? 'Payment canceled' :
                   visiblePhase === 'recoverable_error' ? 'Payment failed' :
                   visiblePhase === 'uncertain' ? 'Payment status uncertain' :
                   visiblePhase === 'education_pending' ? 'Tap to Pay Setup' :
                   visiblePhase === 'education_waiting_for_confirmation' ? 'Tap to Pay Setup' :
                   'Tap to Pay'}
                </h3>
              </div>
              <button
                onClick={() => {
                  if (showPaymentSetup) {
                    onClose()
                  } else if (visiblePhase === 'success') {
                    handlePaymentComplete()
                  } else if (visiblePhase === 'canceled') {
                    onClose()
                  } else if (visiblePhase === 'recoverable_error' || visiblePhase === 'uncertain' || visiblePhase === 'declined') {
                    onClose()
                  } else {
                    // During active payment states, allow cancellation
                    cancelPayment('user_canceled')
                  }
                }}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                style={{ minWidth: '44px', minHeight: '44px' }}
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div
              ref={scrollRef}
              data-scroll-lock-allow
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
              style={{ WebkitOverflowScrolling: 'touch' as any, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
            >
              {showPaymentSetup ? (
                /* Payment Setup Screen */
                <div className="space-y-4">
                  {/* Amount Input */}
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground mb-2">Enter amount</p>
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-3xl font-bold text-muted-foreground">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={amountDisplay}
                        onChange={(e) => handleAmountChange(e.target.value)}
                        placeholder="0.00"
                        className="w-40 text-4xl font-bold text-foreground bg-transparent border-none outline-none text-center placeholder:text-muted-foreground/30"
                      />
                    </div>
                  </div>

                  {/* Quick Amount Buttons */}
                  <div className="grid grid-cols-4 gap-2">
                    {[10, 25, 50, 100].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handleQuickAmount(amount)}
                        className="h-11 text-sm font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors active:scale-95"
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>

                  {/* Optional Customer/Job */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setAssociationView('association_menu')}
                      className="w-full p-3 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                            {paymentAssociation.type !== 'quick' ? (
                              <User className="w-4.5 h-4.5 text-foreground" />
                            ) : (
                              <Smartphone className="w-4.5 h-4.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-foreground text-sm">
                              {paymentAssociation.label}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {paymentAssociation.type === 'quick' ? 'No customer or job' : paymentAssociation.secondaryLabel || ''}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </button>
                  </div>

                  {/* Error */}
                  {amountCents <= 0 && amountDisplay && (
                    <p className="text-sm text-red-500 text-center">Please enter a valid amount</p>
                  )}

                  {/* Minimum amount validation */}
                  {isAmountBelowMinimum && (
                    <p className="text-sm text-red-500 text-center animate-in fade-in duration-200">
                      Minimum payment amount is $0.50.
                    </p>
                  )}

                  {/* Only show app-only message in web */}
                  {!isNativeSupported && platform === 'web' && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                      Tap to Pay is only available on the mobile app
                    </p>
                  )}

                  {/* Inline Location Permission Card */}
                  {showLocationPermissionCard && (
                    <div className="bg-blue-50/80 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl p-3 animate-in fade-in duration-200">
                      <div className="flex items-start gap-2.5">
                        <div className="flex-shrink-0">
                          <MapPin className="w-4 h-4 text-blue-600/80 dark:text-blue-400/80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Location Required</h4>
                          <p className="text-[11px] text-gray-700 dark:text-gray-300 mb-2.5 leading-relaxed">
                            Android requires location access to prepare Tap to Pay. ReplyFlow only uses it while starting a contactless payment.
                          </p>
                          <button
                            onClick={async () => {
                              setIsRequestingLocationPermission(true)
                              const rawResult = await requestLocationPermission()
                              const result = normalizeLocationPermissionResult(rawResult, 'request')
                              setIsRequestingLocationPermission(false)
                              
                              // Trust the native request result directly without immediate re-check
                              if (result.granted && result.locationEnabled) {
                                setShowLocationPermissionCard(false)
                                await startPayment()
                              } else if (!result.granted && result.canAskAgain === false) {
                                setShowLocationPermissionCard(false)
                                setShowLocationBlockedCard(true)
                              } else if (!result.granted && result.canAskAgain === null) {
                                // Unknown state - allow re-prompt
                              } else if (result.granted && !result.locationEnabled) {
                                setShowLocationPermissionCard(false)
                                setShowLocationServicesCard(true)
                              }
                            }}
                            disabled={isRequestingLocationPermission}
                            className="w-full h-[44px] px-3 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {isRequestingLocationPermission ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Requesting...
                              </>
                            ) : (
                              'Allow Location'
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Location Services Card */}
                  {showLocationServicesCard && (
                    <div className="bg-blue-50/80 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl p-3 animate-in fade-in duration-200">
                      <div className="flex items-start gap-2.5">
                        <div className="flex-shrink-0">
                          <MapPin className="w-4 h-4 text-blue-600/80 dark:text-blue-400/80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Location Required</h4>
                          <p className="text-[11px] text-gray-700 dark:text-gray-300 mb-2.5 leading-relaxed">
                            Turn on Location Services, then try Tap to Pay again.
                          </p>
                          <button
                            onClick={async () => {
                              const rawResult = await checkLocationPermission()
                              const result = normalizeLocationPermissionResult(rawResult, 'check')
                              if (result.granted && result.locationEnabled) {
                                setShowLocationServicesCard(false)
                                await startPayment()
                              } else if (!result.locationEnabled) {
                                // Keep card visible if services still off
                              } else if (!result.granted) {
                                setShowLocationServicesCard(false)
                                setShowLocationPermissionCard(true)
                              }
                            }}
                            className="w-full h-[44px] px-3 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          >
                            Check Again
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inline Location Blocked Card */}
                  {showLocationBlockedCard && (
                    <div className="bg-blue-50/80 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl p-3 animate-in fade-in duration-200">
                      <div className="flex items-start gap-2.5">
                        <div className="flex-shrink-0">
                          <MapPin className="w-4 h-4 text-blue-600/80 dark:text-blue-400/80" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Location Required</h4>
                          <p className="text-[11px] text-gray-700 dark:text-gray-300 mb-2.5 leading-relaxed">
                            Location access is disabled for ReplyFlow. Enable it in your phone's app settings, then try Tap to Pay again.
                          </p>
                          <button
                            onClick={async () => {
                              const rawResult = await checkLocationPermission()
                              const result = normalizeLocationPermissionResult(rawResult, 'check')
                              if (result.granted && result.locationEnabled) {
                                setShowLocationBlockedCard(false)
                                await startPayment()
                              } else if (!result.canAskAgain) {
                                // Keep card visible if still blocked
                              } else {
                                // canAskAgain is true or null - switch back to normal permission card
                                setShowLocationBlockedCard(false)
                                setShowLocationPermissionCard(true)
                              }
                            }}
                            className="w-full h-[44px] px-3 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                          >
                            Try Again
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Association Menu View */}
                  {associationView === 'association_menu' && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 mb-4">
                        <button
                          onClick={() => {
                            setAssociationView('payment_setup')
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
                        </button>
                        <h3 className="text-sm font-semibold text-foreground">Choose Association</h3>
                      </div>

                      <button
                        onClick={() => {
                          if (selectionCommitInProgressRef.current) {
                            return
                          }
                          selectionCommitInProgressRef.current = true
                          setPaymentAssociation({
                            type: 'quick',
                            leadId: null,
                            jobId: null,
                            label: 'Quick Payment',
                            secondaryLabel: null
                          })
                          setSelectedLeadId(null)
                          setSelectedJobId(null)
                          setAssociationView('payment_setup')
                          setTimeout(() => {
                            selectionCommitInProgressRef.current = false
                          }, 0)
                        }}
                        className="w-full p-4 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Smartphone className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-sm">Quick Payment</p>
                            <p className="text-xs text-muted-foreground">No customer or job attached</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setAssociationView('customer_list')
                          if (!leads.length && !isLoadingLeads) {
                            loadLeads()
                          }
                        }}
                        className="w-full p-4 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-sm">Choose Customer</p>
                            <p className="text-xs text-muted-foreground">Attach this payment to a customer</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          setAssociationView('job_list')
                          if (paymentAssociation.leadId && !jobs.length && !isLoadingJobs) {
                            loadJobs(paymentAssociation.leadId)
                          }
                        }}
                        className="w-full p-4 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <Briefcase className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground text-sm">Choose Job</p>
                            <p className="text-xs text-muted-foreground">Attach this payment to an existing job</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Customer List View */}
                  {associationView === 'customer_list' && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 mb-4">
                        <button
                          onClick={() => {
                            setAssociationView('association_menu')
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
                        </button>
                        <h3 className="text-sm font-semibold text-foreground">Choose Customer</h3>
                      </div>

                      {isLoadingLeads ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : leads.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground mb-4">No customers found</p>
                          <button
                            onClick={() => {
                              if (selectionCommitInProgressRef.current) {
                                return
                              }
                              selectionCommitInProgressRef.current = true
                              setPaymentAssociation({
                                type: 'quick',
                                leadId: null,
                                jobId: null,
                                label: 'Quick Payment',
                                secondaryLabel: null
                              })
                              setSelectedLeadId(null)
                              setSelectedJobId(null)
                              setAssociationView('payment_setup')
                              setTimeout(() => {
                                selectionCommitInProgressRef.current = false
                              }, 0)
                            }}
                            className="text-sm text-green-600 dark:text-green-400 font-medium hover:underline"
                          >
                            Continue with Quick Payment
                          </button>
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {leads.map((lead) => (
                            <button
                              key={lead.id}
                              onClick={() => {
                                if (paymentAssociation.type === 'customer' && paymentAssociation.leadId === lead.id) {
                                  return
                                }
                                if (selectionCommitInProgressRef.current) {
                                  return
                                }
                                selectionCommitInProgressRef.current = true
                                setPaymentAssociation({
                                  type: 'customer',
                                  leadId: lead.id,
                                  jobId: null,
                                  label: (lead.name && lead.name !== 'Not collected') ? lead.name : 'Unknown',
                                  secondaryLabel: lead.caller_phone ?? null
                                })
                                setSelectedLeadId(lead.id)
                                setSelectedJobId(null)
                                setAssociationView('payment_setup')
                                setTimeout(() => {
                                  selectionCommitInProgressRef.current = false
                                }, 0)
                              }}
                              className="w-full p-4 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                  <User className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-foreground text-sm truncate">{(lead.name && lead.name !== 'Not collected') ? lead.name : 'Unknown'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{lead.caller_phone || ''}</p>
                                </div>
                                {paymentAssociation.type === 'customer' && paymentAssociation.leadId === lead.id && (
                                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Job List View */}
                  {associationView === 'job_list' && (
                    <div className="space-y-2 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 mb-4">
                        <button
                          onClick={() => {
                            setAssociationView('association_menu')
                          }}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <ChevronRight className="w-5 h-5 text-muted-foreground rotate-180" />
                        </button>
                        <h3 className="text-sm font-semibold text-foreground">Choose Job</h3>
                      </div>

                      {isLoadingJobs ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : jobs.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground mb-4">No jobs found</p>
                          <button
                            onClick={() => {
                              if (selectionCommitInProgressRef.current) {
                                return
                              }
                              selectionCommitInProgressRef.current = true
                              setPaymentAssociation({
                                type: 'quick',
                                leadId: null,
                                jobId: null,
                                label: 'Quick Payment',
                                secondaryLabel: null
                              })
                              setSelectedLeadId(null)
                              setSelectedJobId(null)
                              setAssociationView('payment_setup')
                              setTimeout(() => {
                                selectionCommitInProgressRef.current = false
                              }, 0)
                            }}
                            className="text-sm text-green-600 dark:text-green-400 font-medium hover:underline"
                          >
                            Continue with Quick Payment
                          </button>
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto space-y-1">
                          {jobs.map((job) => (
                            <button
                              key={job.id}
                              onClick={() => {
                                if (paymentAssociation.type === 'job' && paymentAssociation.jobId === job.id) {
                                  return
                                }
                                if (selectionCommitInProgressRef.current) {
                                  return
                                }
                                selectionCommitInProgressRef.current = true
                                setPaymentAssociation({
                                  type: 'job',
                                  leadId: job.leadId ?? null,
                                  jobId: job.id,
                                  label: job.name || 'Unknown Job',
                                  secondaryLabel: job.description ?? null
                                })
                                setSelectedJobId(job.id)
                                if (job.leadId) {
                                  setSelectedLeadId(job.leadId)
                                }
                                setAssociationView('payment_setup')
                                setTimeout(() => {
                                  selectionCommitInProgressRef.current = false
                                }, 0)
                              }}
                              className="w-full p-4 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                                  <Briefcase className="w-5 h-5 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-foreground text-sm truncate">{job.name || 'Unknown Job'}</p>
                                  <p className="text-xs text-muted-foreground truncate">{job.description || ''}</p>
                                </div>
                                {paymentAssociation.type === 'job' && paymentAssociation.jobId === job.id && (
                                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Payment Progress Screen */
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  {visiblePhase === 'education_pending' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6" role="status" aria-live="polite">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-lg font-semibold text-foreground">Tap to Pay Guide</h2>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                          Before your first payment, please complete the quick setup guide to learn how to use Tap to Pay on your iPhone.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Opening guide…</span>
                      </div>
                    </div>
                  )}

                  {visiblePhase === 'education_waiting_for_confirmation' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6" role="status" aria-live="polite">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-green-600 dark:text-green-400" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-lg font-semibold text-foreground">Finishing setup…</h2>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
                          Please confirm to continue with Tap to Pay.
                        </p>
                      </div>
                    </div>
                  )}

                  {visiblePhase === 'preparing' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-green-600 dark:text-green-400" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Preparing Tap to Pay</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(amountCents / 100)}</p>
                      </div>
                      {/* Indeterminate preparation message for Apple configuration */}
                      {readerState.preparing && (
                        <p className="text-xs text-muted-foreground mt-2">
                          This may take a moment the first time.
                        </p>
                      )}
                    </div>
                  )}

                  {visiblePhase === 'waiting_for_card' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center animate-pulse">
                        <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground">Ready for payment</p>
                        <p className="text-xs text-muted-foreground">Hold the contactless card or device near the iPhone.</p>
                      </div>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(amountCents / 100)}</p>
                      {/* Software update error - highest priority */}
                      {readerState.softwareUpdateError && (
                        <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">{readerState.softwareUpdateError}</p>
                        </div>
                      )}
                      {/* Software update progress bar - second priority */}
                      {!readerState.softwareUpdateError && readerState.softwareUpdateActive && readerState.softwareUpdateProgress !== null && (
                        <div className="mt-3 w-full max-w-xs mx-auto">
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${readerState.softwareUpdateProgress * 100}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Updating reader… {Math.round(readerState.softwareUpdateProgress * 100)}%
                          </p>
                        </div>
                      )}
                      {/* Normalized reader display message - third priority */}
                      {!readerState.softwareUpdateError && !readerState.softwareUpdateActive && normalizedReaderMessage && (
                        <div className="mt-3 p-3 bg-muted border border-muted-foreground/20 rounded-lg">
                          <p className="text-sm text-foreground">{normalizedReaderMessage}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {visiblePhase === 'processing' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Processing payment</p>
                    </div>
                  )}

                  {visiblePhase === 'confirming' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Confirming payment</p>
                    </div>
                  )}

                  {visiblePhase === 'success' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center animate-in zoom-in duration-300">
                        <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-foreground">Payment complete</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatCurrency(amountCents / 100)}</p>
                      </div>
                      <button
                        onClick={handleSendReceipt}
                        className="mt-4 px-6 py-3 h-11 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors active:scale-95"
                        aria-label="Send receipt to customer"
                      >
                        Send Receipt
                      </button>
                    </div>
                  )}

                  {visiblePhase === 'declined' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-foreground">Payment declined</p>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{mappedError?.message || 'The payment was declined by the card issuer.'}</p>
                      </div>
                    </div>
                  )}

                  {visiblePhase === 'canceled' && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-slate-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-slate-600 dark:text-slate-400" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-foreground">Payment canceled</p>
                        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">No charge was made. You can try again whenever you're ready.</p>
                      </div>
                    </div>
                  )}

                  {(visiblePhase === 'recoverable_error' || visiblePhase === 'uncertain') && (
                    <div className="flex flex-col items-center justify-center space-y-5 text-center px-6">
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-lg font-semibold text-foreground">
                          {visiblePhase === 'uncertain' ? 'Payment status uncertain' : (mappedError?.title || 'Payment failed')}
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400 max-w-xs leading-relaxed">
                          {visiblePhase === 'uncertain'
                            ? 'We couldn\'t confirm the final payment status. Please check your payment history before trying again.'
                            : (mappedError?.message || error || 'An error occurred')}
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Defensive fallback for unhandled states */}
                  {(!['ready', 'preparing', 'connecting_reader', 'creating_payment_intent', 'waiting_for_card', 'processing', 'success', 'failure', 'canceled', 'pending', 'ambiguous', 'education_pending', 'education_waiting_for_confirmation'].includes(paymentState)) && (
                    <>
                      <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                      <p className="text-sm font-medium text-foreground text-center">Something went wrong</p>
                      <p className="text-xs text-muted-foreground text-center">Please close and try again</p>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Embedded Diagnostics - Debug builds only */}
            <QuickTapToPayDiagnostics
              paymentState={paymentState}
              lastSuccessfulStage={lastSuccessfulStage}
              mappedError={mappedError || undefined}
              lastCompletedAttempt={lastCompletedAttempt}
            />

            {/* Footer */}
            <div className="px-4 py-3 border-t border-border/50 flex gap-3 shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
              {showPaymentSetup ? (
                <>
                  {disabledReason && (
                    <div className="col-span-2 p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-2">
                      <p className="text-xs text-amber-800 dark:text-amber-200">{disabledReason}</p>
                    </div>
                  )}
                  <button
                    onClick={onClose}
                    className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleStartPayment}
                    disabled={amountCents <= 0 || !isAmountValid || !isNativeSupported || isPaymentInProgress || showLocationPermissionCard || showLocationServicesCard || showLocationBlockedCard}
                    className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Smartphone className="w-4 h-4" />
                    {showLocationPermissionCard || showLocationServicesCard || showLocationBlockedCard ? 'Complete Location Setup' : isAmountBelowMinimum ? 'Minimum $0.50 Required' : 'Start Tap to Pay'}
                  </button>
                </>
              ) : (
                <>
                  {paymentState === 'canceled' ? (
                    <>
                      <button
                        onClick={() => {
                          onClose()
                        }}
                        className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                        style={{ minHeight: '44px' }}
                      >
                        Done
                      </button>
                      <button
                        onClick={retryAfterCancellation}
                        className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2 active:scale-95"
                        style={{ minHeight: '44px' }}
                      >
                        <Smartphone className="w-4 h-4" />
                        Try Again
                      </button>
                    </>
                  ) : paymentState === 'failure' ? (
                    <>
                      {mappedError?.action === 'open_app_settings' ? (
                        <button
                          onClick={() => cancelPayment('user_back')}
                          className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                        >
                          Back
                        </button>
                      ) : mappedError?.action === 'open_location_settings' ? (
                        <button
                          onClick={() => cancelPayment('user_back')}
                          className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                        >
                          Back
                        </button>
                      ) : mappedError?.action === 'back' ? (
                        <button
                          onClick={() => cancelPayment('user_back')}
                          className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                        >
                          Back
                        </button>
                      ) : mappedError?.action === 'configure' ? (
                        <>
                          <button
                            onClick={() => cancelPayment('user_back')}
                            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                          >
                            Back
                          </button>
                          <button
                            onClick={() => {
                              // Check if this is an address configuration error
                              const isAddressError =
                                mappedError?.technicalCode === 'terminal_location_address_required' ||
                                mappedError?.technicalCode === 'terminal_location_address_invalid'

                              if (isAddressError) {
                                // Navigate to Business Settings address section
                                window.location.href = '/dashboard/settings#business-address'
                              } else {
                                // Stripe management for other configuration errors
                                handleOpenStripeManagement()
                              }
                            }}
                            className="flex-1 px-4 py-3 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors active:scale-95"
                          >
                            {mappedError?.technicalCode === 'terminal_location_address_required' ||
                             mappedError?.technicalCode === 'terminal_location_address_invalid'
                              ? 'Add Business Address'
                              : 'Complete Business Profile'}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => cancelPayment('user_back')}
                            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                          >
                            Back
                          </button>
                          <button
                            onClick={retryPayment}
                            disabled={isPaymentInProgress}
                            className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95"
                          >
                            <Loader2 className={`w-4 h-4 ${isPaymentInProgress ? 'animate-spin' : ''}`} />
                            Try Again
                          </button>
                        </>
                      )}
                      {/* Reset button for unknown states */}
                      {(!['preparing', 'connecting_reader', 'creating_payment_intent', 'waiting_for_card', 'processing', 'success', 'failure', 'canceled', 'pending', 'ambiguous'].includes(paymentState)) && (
                        <>
                          <button
                            onClick={onClose}
                            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                          >
                            Close
                          </button>
                          <button
                            onClick={() => {
                              emergencyCleanup()
                            }}
                            className="flex-1 px-4 py-3 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors active:scale-95"
                          >
                            Reset
                          </button>
                        </>
                      )}
                    </>
                  ) : paymentState === 'success' ? (
                    <button
                      onClick={handlePaymentComplete}
                      className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors active:scale-95"
                    >
                      Done
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        // Hide location cards if visible, otherwise cancel payment
                        const locationCardVisible = showLocationPermissionCard || showLocationServicesCard || showLocationBlockedCard
                        if (locationCardVisible) {
                          setShowLocationPermissionCard(false)
                          setShowLocationServicesCard(false)
                          setShowLocationBlockedCard(false)
                        } else {
                          cancelPayment('user_canceled')
                        }
                      }}
                      disabled={isPaymentInProgress}
                      className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                      Cancel
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Education Confirmation UI (iOS 18+ after native education) */}
      {educationWaitingForConfirmation && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-in fade-in duration-200">
          <div className="bg-background rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">Tap to Pay Guide</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Have you completed the Tap to Pay setup guide? You can continue to payment once you've reviewed the instructions.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleConfirmationCancel}
                className="flex-1 px-4 py-3 h-12 rounded-xl border border-border text-foreground font-medium hover:bg-muted transition-colors active:scale-[0.98] duration-150"
              >
                Not Yet
              </button>
              <button
                onClick={handleConfirmationContinue}
                className="flex-1 px-4 py-3 h-12 rounded-xl bg-green-600 text-white font-medium hover:bg-green-700 transition-colors active:scale-[0.98] duration-150"
              >
                Yes, Continue
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Custom Education Modal (iOS < 18) */}
      {showEducationModal && (
        <TapToPayEducationModal
          isOpen={showEducationModal}
          onComplete={handleEducationComplete}
          onDismiss={handleEducationCancel}
        />
      )}
      
      {/* Receipt Modal */}
      {showReceiptModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <div className="bg-background rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-32px)] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Send Receipt</h2>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="p-2 hover:bg-muted rounded-lg transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {!receiptSent ? (
              <>
                <div>
                  <label htmlFor="receipt-phone" className="block text-sm font-medium text-foreground mb-2">
                    Customer Phone Number
                  </label>
                  <input
                    id="receipt-phone"
                    type="tel"
                    value={receiptPhoneNumber}
                    onChange={(e) => setReceiptPhoneNumber(e.target.value)}
                    placeholder="(412) 555-3010"
                    className="w-full px-4 py-3 h-11 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-green-600"
                    disabled={isSendingReceipt}
                    aria-label="Customer phone number for receipt"
                  />
                </div>
                
                {receiptError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{receiptError}</p>
                )}
                
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowReceiptModal(false)}
                    disabled={isSendingReceipt}
                    className="flex-1 px-4 py-3 h-11 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendReceiptSubmit}
                    disabled={isSendingReceipt || !receiptPhoneNumber}
                    className="flex-1 px-4 py-3 h-11 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSendingReceipt ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      'Send Receipt'
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-4 space-y-4">
                <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">Receipt sent successfully!</p>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="w-full px-4 py-3 h-11 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
