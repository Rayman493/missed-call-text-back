'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Smartphone, User, Briefcase, Loader2, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { isNativeCapacitor } from '@/lib/terminal'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { TerminalBridgeService } from '@/lib/terminal/service'
import { logTapToPayEvent } from '@/lib/tap-to-pay-diagnostics'
import { SHOW_TAP_TO_PAY_DIAGNOSTICS, SHOW_TTP_TEST_STATUS } from './tapToPayUiConfig'
import { useTapToPayOrchestration } from '@/hooks/useTapToPayOrchestration'
import { Capacitor } from '@capacitor/core'

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
  const [showCustomerSelector, setShowCustomerSelector] = useState(false)
  const [modalSessionId, setModalSessionId] = useState<string>(`modal_${Date.now()}`)
  const [connectingElapsedTime, setConnectingElapsedTime] = useState(0)
  const [eventTimeline, setEventTimeline] = useState<Array<{ timestamp: string; event: string; sessionId?: string; attemptId?: string; paymentState?: string; stage?: string }>>([])
  const WEB_BUILD_MARKER = 'TTP_WEB_2026_08_03_CANCELED_ATTEMPT_CLEANUP_FIX'

  // Ref for modal title for accessibility focus
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Log web build marker on mount
  useEffect(() => {
    console.log('[QuickTTP UI] WEB_BUILD_MARKER: ' + WEB_BUILD_MARKER)
    console.log('[QuickTTP UI] MODAL_MOUNTED', { modalSessionId })
    dispatchTTPEvent('MODAL_MOUNTED')
    return () => {
      console.log('[QuickTTP UI] MODAL_UNMOUNTED', { modalSessionId })
      dispatchTTPEvent('MODAL_UNMOUNTED')
    }
  }, [])

  // Helper to dispatch events
  const dispatchTTPEvent = (event: string, detail?: any) => {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
    setEventTimeline(prev => {
      const updated = [...prev, { timestamp, event, ...detail }]
      // Keep last 200 events
      return updated.slice(-200)
    })
  }

  // Helper to determine rendered branch
  const getRenderedBranch = (state: string, showSetup: boolean): string => {
    if (showSetup) return 'SETUP'
    switch (state) {
      case 'preparing': return 'PREPARING'
      case 'connecting_reader': return 'CONNECTING_READER'
      case 'creating_payment_intent': return 'CREATING_PAYMENT_INTENT'
      case 'waiting_for_card': return 'WAITING_FOR_CARD'
      case 'processing': return 'PROCESSING'
      case 'success': return 'SUCCESS'
      case 'failure': return 'FAILURE'
      case 'canceled': return 'CANCELED'
      case 'pending': return 'PENDING'
      case 'ambiguous': return 'AMBIGUOUS'
      default: return 'UNKNOWN_FALLBACK'
    }
  }

  // Listen for TTP events from orchestration hook
  useEffect(() => {
    const handleTTPEvent = (event: CustomEvent) => {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
      const eventData = {
        timestamp,
        event: event.detail.event,
        sessionId: event.detail.sessionId,
        attemptId: event.detail.attemptId,
        paymentState: event.detail.paymentState,
        stage: event.detail.stage
      }
      setEventTimeline(prev => {
        const updated = [...prev, eventData]
        // Keep last 200 events - silently trim without dispatching to prevent recursion
        return updated.slice(-200)
      })
    }

    window.addEventListener('ttp:event', handleTTPEvent as EventListener)
    return () => {
      window.removeEventListener('ttp:event', handleTTPEvent as EventListener)
    }
  }, [])

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

  // Ref to store resetToSetup for modal-open effect (avoid unstable dependency)
  const resetToSetupRef = useRef(resetToSetup)
  resetToSetupRef.current = resetToSetup

  // Ref to track previous payment state for accurate reset reasons
  const prevPaymentStateRef = useRef<string>('ready')
  const prevIsOpenRef = useRef(false)

  // Ref to prevent duplicate close handlers
  const closeHandledRef = useRef(false)

  // Derive showPaymentSetup from paymentState to ensure UI is always in sync
  const showPaymentSetup = paymentState === 'ready'

  // Render-level diagnostics - track what's actually being rendered
  useEffect(() => {
    const renderedBranch = getRenderedBranch(paymentState, showPaymentSetup)
    dispatchTTPEvent('PAYMENT_STATE_RENDER', {
      paymentState,
      previousPaymentState: lastSuccessfulStage,
      renderedBranch,
      showPaymentSetup,
      isPaymentInProgress,
      timestamp: new Date().toISOString()
    })
  }, [paymentState, showPaymentSetup, isPaymentInProgress, lastSuccessfulStage, lastResetReason, platform, hookIsNativeSupported])

  // Emergency cleanup function to reset UI state
  const emergencyCleanup = useCallback(() => {
    console.log('[QuickTTP UI] EMERGENCY_CLEANUP')
    
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
      return
    }

    // Modal is opening
    const wasClosed = !prevIsOpenRef.current
    const previousState = prevPaymentStateRef.current

    // Only reset if modal was previously closed (fresh open, not state change within open modal)
    if (wasClosed) {
      console.log('[QuickTTP UI] MODAL_OPENED', { previousState, currentPaymentState: paymentState })
      
      // Reset close guard for fresh modal session
      closeHandledRef.current = false
      
      // Use accurate reset reason based on previous state
      let resetReason = 'modal_reopened'
      if (previousState === 'success') {
        resetReason = 'reset_prepared_for_next_open'
        dispatchTTPEvent('RESET_PREPARED_FOR_NEXT_OPEN')
      } else if (previousState === 'ready') {
        resetReason = 'setup_initialized'
      }
      
      // Call resetToSetup via ref to avoid unstable dependency
      resetToSetupRef.current(resetReason)
      
      // Generate new session ID for fresh modal session
      const newSessionId = `modal_${Date.now()}`

      console.log('[QuickTTP UI] NEW_SESSION_ID', {
        oldSessionId: modalSessionId,
        newSessionId,
        currentPaymentState: paymentState 
      })
      setModalSessionId(newSessionId)
    }

    prevIsOpenRef.current = true
  }, [isOpen, paymentState, modalSessionId])

  // Render logging for debugging
  useEffect(() => {
    if (isOpen) {
      const stateSnapshot = {
        paymentState,
        isPaymentInProgress,
        lastSuccessfulStage,
        lastResetReason,
        platform,
        renderedBranch: showPaymentSetup ? 'SETUP' : paymentState === 'failure' ? 'FAILURE' : paymentState === 'canceled' ? 'CANCELED' : paymentState.toUpperCase()
      }
      console.log('[QuickTTP UI] PAYMENT_STATE_RENDER', stateSnapshot)
      
      // State invariants
      const invariants = [
        { check: paymentState === 'canceled' && isPaymentInProgress, error: 'canceled + isPaymentInProgress' },
        { check: paymentState === 'ready' && isPaymentInProgress, error: 'ready + isPaymentInProgress' },
        { check: paymentState === 'canceled' && lastSuccessfulStage === 'initializing', error: 'canceled + lastSuccessfulStage=initializing' },
        { check: paymentState === 'canceled' && lastSuccessfulStage === 'preparing', error: 'canceled + lastSuccessfulStage=preparing' },
        { check: paymentState === 'canceled' && lastSuccessfulStage === 'initializing_terminal', error: 'canceled + lastSuccessfulStage=initializing_terminal' },
        { check: !['preparing', 'connecting_reader', 'creating_payment_intent', 'waiting_for_card', 'processing', 'success', 'failure', 'canceled', 'pending', 'ambiguous'].includes(paymentState) && !showPaymentSetup, error: 'unhandled state without setup' }
      ]
      
      const violations = invariants.filter(i => i.check)
      if (violations.length > 0) {
        console.error('[QuickTTP UI] STATE_INVOLATION', violations.map(v => v.error), stateSnapshot)
      }
    }
  }, [isOpen, showPaymentSetup, paymentState, isPaymentInProgress, lastSuccessfulStage, lastResetReason, platform])

  // Focus modal title on open for accessibility (prevents keyboard from opening on amount input)
  useEffect(() => {
    if (isOpen && titleRef.current) {
      titleRef.current.focus()
    }
  }, [isOpen])

  // Debug instrumentation for scroll behavior (development only)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    const el = scrollRef.current
    if (!el) return
    const logDims = () => {
      try {
        const cs = getComputedStyle(el)
        // Development-only scroll debugging
      } catch {}
    }
    logDims()
    const onWheel = (e: WheelEvent) => { /* wheel event */ }
    const onTs = (e: TouchEvent) => { /* touchstart event */ }
    const onTm = (e: TouchEvent) => { /* touchmove event */ }
    el.addEventListener('wheel', onWheel as any, { passive: true })
    el.addEventListener('touchstart', onTs as any, { passive: true })
    el.addEventListener('touchmove', onTm as any, { passive: true })
    window.addEventListener('resize', logDims)
    return () => {
      el.removeEventListener('wheel', onWheel as any)
      el.removeEventListener('touchstart', onTs as any)
      el.removeEventListener('touchmove', onTm as any)
      window.removeEventListener('resize', logDims)
    }
  }, [showPaymentSetup])

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
            console.log('[QuickTTP UI] START_BUTTON_DISABLED', {
              reasons: [
                amountCents <= 0 ? 'invalid_amount' : null,
                !result.isNativeSupported ? 'native_not_supported' : null,
                isPaymentInProgress ? 'payment_in_progress' : null
              ].filter(Boolean)
            })
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
      logTapToPayEvent('MODAL_OPENED', { phase: 'startup', sessionId: terminalService.getSessionId(), meta: { modal: 'QuickTapToPay' } }).catch(() => {})

      // Reset state only on actual modal open, not on dependency changes
      setAmountCents(0)
      setAmountDisplay('')
      setSelectedLeadId(null)
      setSelectedJobId(null)
      setDescription('')
      setShowCustomerSelector(false)
    }
    return () => {
      if (isOpen) {
        logTapToPayEvent('MODAL_CLOSED', { phase: 'startup', sessionId: terminalService.getSessionId(), meta: { modal: 'QuickTapToPay' } }).catch(() => {})
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Load leads when customer selector is opened
  useEffect(() => {
    if (showCustomerSelector && !isLoadingLeads && leads.length === 0) {
      loadLeads()
    }
  }, [showCustomerSelector, isLoadingLeads, leads.length])

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
    logTapToPayEvent('AMOUNT_CHANGED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents: Math.round(dollars * 100) } }).catch(() => {})
    if (hasAmount && !prevHadAmountRef.current) {
      logTapToPayEvent('AMOUNT_ENTERED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents: Math.round(dollars * 100) } }).catch(() => {})
    }
    prevHadAmountRef.current = hasAmount
  }

  const handleQuickAmount = (dollars: number) => {
    setAmountDisplay(dollars.toString())
    setAmountCents(dollars * 100)
    logTapToPayEvent('AMOUNT_ENTERED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents: dollars * 100 } }).catch(() => {})
  }

  const handleStartPayment = async () => {
    // Defensive validation: block payments below minimum amount
    if (amountCents < MINIMUM_AMOUNT_CENTS) {
      console.log('[QuickTTP UI] INVALID_PAYMENT_AMOUNT_BLOCKED', { amountCents, minimumAmountCents: MINIMUM_AMOUNT_CENTS })
      return
    }
    logTapToPayEvent('PAY_BUTTON_PRESSED', { phase: 'payment_intent', sessionId: terminalService.getSessionId(), meta: { amountCents } }).catch(() => {})
    // Don't switch UI state yet - let the hook's state change trigger the UI update
    await startPayment()
  }

  const handleOpenAppSettings = async () => {
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: 'app-settings:' })
    } catch (error) {
      console.error('[QuickTTP UI] Failed to open app settings:', error)
    }
  }

  const handleOpenLocationSettings = async () => {
    try {
      // For Android, open location settings
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: 'android.settings.LOCATION_SOURCE_SETTINGS' })
    } catch (error) {
      console.error('[QuickTTP UI] Failed to open location settings:', error)
      // Fallback to general settings
      await handleOpenAppSettings()
    }
  }

  const handlePaymentComplete = async () => {
    // Prevent duplicate close handlers
    if (closeHandledRef.current) {
      console.log('[QuickTTP UI] MODAL_CLOSE_IGNORED_ALREADY_HANDLED')
      dispatchTTPEvent('MODAL_CLOSE_IGNORED_ALREADY_HANDLED')
      return
    }
    closeHandledRef.current = true

    // Dispatch event for Recent Payments refresh before closing modal
    const paymentIntentId = terminalService.getPaymentIntentId()
    if (paymentIntentId) {
      window.dispatchEvent(new CustomEvent('replyflow:payment-completed', {
        detail: { paymentIntentId }
      }))
      console.log('[QuickTTP UI] PAYMENTS_LIST_REFRESH_DISPATCHED_ON_MODAL_CLOSE', { paymentIntentId })
      dispatchTTPEvent('PAYMENTS_REFRESH_DISPATCHED')
    }
    dispatchTTPEvent('MODAL_CLOSED')
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
      if (paymentState === 'failure') {
        // On back from failure, go to setup
        // handled by cancelPayment which resets state
        cancelPayment()
      } else if (paymentState === 'success') {
        console.log('[QuickTTP UI] BACK_PRESSED_IN_SUCCESS_STATE')
        dispatchTTPEvent('SUCCESSFUL_DONE')
        handlePaymentComplete()
      } else if (paymentState === 'canceled') {
        console.log('[QuickTTP UI] BACK_PRESSED_IN_CANCELED_STATE')
        dispatchTTPEvent('CANCELED_DONE')
        dispatchTTPEvent('CANCELLATION_PAYMENT_REFRESH_SKIPPED')
        onClose()
      } else if (paymentState === 'ready') {
        console.log('[QuickTTP UI] BACK_PRESSED_IN_SETUP_STATE')
        dispatchTTPEvent('SETUP_CLOSED')
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
          if (paymentState === 'failure') {
            cancelPayment()
          } else if (paymentState === 'success') {
            console.log('[QuickTTP UI] ANDROID_BACK_PRESSED_IN_SUCCESS_STATE')
            dispatchTTPEvent('SUCCESSFUL_DONE')
            handlePaymentComplete()
          } else if (paymentState === 'canceled') {
            console.log('[QuickTTP UI] ANDROID_BACK_PRESSED_IN_CANCELED_STATE')
            dispatchTTPEvent('CANCELED_DONE')
            dispatchTTPEvent('CANCELLATION_PAYMENT_REFRESH_SKIPPED')
            onClose()
          } else if (paymentState === 'ready') {
            console.log('[QuickTTP UI] ANDROID_BACK_PRESSED_IN_SETUP_STATE')
            dispatchTTPEvent('SETUP_CLOSED')
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
  }, [isOpen, onClose, paymentState, cancelPayment])

  // Timer for connecting state to show elapsed time reassurance
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (paymentState === 'connecting_reader') {
      setConnectingElapsedTime(0)
      interval = setInterval(() => {
        setConnectingElapsedTime(prev => prev + 1)
      }, 1000)
    } else {
      setConnectingElapsedTime(0)
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [paymentState])

  if (!isOpen) return null

  const selectedLead = leads.find(l => l.id === selectedLeadId)
  const selectedJob = jobs.find(j => j.id === selectedJobId)

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
                   paymentState === 'preparing' ? 'Preparing Tap to Pay…' :
                   paymentState === 'connecting_reader' ? 'Connecting to Tap to Pay…' :
                   paymentState === 'creating_payment_intent' ? 'Preparing payment…' :
                   paymentState === 'waiting_for_card' ? 'Ready for card' :
                   paymentState === 'processing' ? 'Processing…' :
                   paymentState === 'success' ? 'Payment Complete' :
                   paymentState === 'canceled' ? 'Payment Canceled' :
                   paymentState === 'failure' ? 'Payment Failed' :
                   'Tap to Pay'}
                </h3>
              </div>
              <button
                onClick={() => {
                  if (showPaymentSetup) {
                    console.log('[QuickTTP UI] CLOSE_CLICKED_IN_SETUP_STATE')
                    dispatchTTPEvent('SETUP_CLOSED')
                    onClose()
                  } else if (paymentState === 'success') {
                    console.log('[QuickTTP UI] CLOSE_CLICKED_IN_SUCCESS_STATE')
                    dispatchTTPEvent('SUCCESSFUL_DONE')
                    handlePaymentComplete()
                  } else if (paymentState === 'canceled') {
                    console.log('[QuickTTP UI] CLOSE_CLICKED_IN_CANCELED_STATE')
                    dispatchTTPEvent('CANCELED_DONE')
                    dispatchTTPEvent('CANCELLATION_PAYMENT_REFRESH_SKIPPED')
                    onClose()
                  } else if (paymentState === 'failure') {
                    console.log('[QuickTTP UI] CLOSE_CLICKED_IN_ERROR_STATE', { paymentState })
                    dispatchTTPEvent('FAILURE_CLOSED')
                    onClose()
                  } else {
                    // During active payment states, allow cancellation
                    cancelPayment('user_canceled')
                  }
                }}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                style={{ minWidth: '44px', minHeight: '44px' }}
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
              {/* Visible Diagnostics Panel - unconditional */}
              {SHOW_TAP_TO_PAY_DIAGNOSTICS && (
                <div className="space-y-3 mb-4">
                  {/* Unmistakable Banner */}
                  <div className="p-3 rounded-lg border-2 border-purple-700 bg-purple-900/30 text-center">
                    <div className="text-purple-300 font-extrabold text-lg tracking-wide">TTP DIAGNOSTICS BUILD 2026-08-03-OWNERSHIP</div>
                    <div className="text-xs text-purple-200/80">WEB BUILD: {WEB_BUILD_MARKER}</div>
                  </div>
                  
                  {/* Diagnostics Panel */}
                  <div className="p-3 rounded-lg border-2 border-red-700 bg-red-900/30">
                    <div className="text-red-300 font-bold text-sm mb-2">Tap to Pay Diagnostics</div>
                    
                    {/* Current State */}
                    <div className="text-xs font-mono space-y-1 mb-3">
                      <div className="text-gray-300">
                        <span className="text-gray-500">State:</span>
                        <span className="text-blue-300 ml-2">{paymentState}</span>
                      </div>
                      <div className="text-gray-300">
                        <span className="text-gray-500">Rendered branch:</span>
                        <span className="text-blue-300 ml-2">{getRenderedBranch(paymentState, showPaymentSetup)}</span>
                      </div>
                      <div className="text-gray-300">
                        <span className="text-gray-500">Session ID:</span>
                        <span className="text-blue-300 ml-2">{modalSessionId.slice(0, 8)}...</span>
                      </div>
                      <div className="text-gray-300">
                        <span className="text-gray-500">Events:</span>
                        <span className="text-blue-300 ml-2">{eventTimeline.length}</span>
                      </div>
                    </div>
                    
                    {/* Controls */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => {
                          const diagnosticsOutput = {
                            webBuildMarker: WEB_BUILD_MARKER,
                            paymentState,
                            renderedBranch: getRenderedBranch(paymentState, showPaymentSetup),
                            showPaymentSetup,
                            sessionId: modalSessionId,
                            eventCount: eventTimeline.length,
                            captureTimestamp: new Date().toISOString(),
                            timeline: eventTimeline
                          }
                          const json = JSON.stringify(diagnosticsOutput, null, 2)
                          try {
                            navigator.clipboard.writeText(json)
                            dispatchTTPEvent('DIAGNOSTICS_COPIED')
                            alert('Copied to clipboard')
                          } catch (e) {
                            alert('Clipboard failed. Displaying JSON:')
                            console.log(json)
                          }
                        }}
                        className="flex-1 px-3 py-2 text-xs font-semibold rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      >
                        Copy Diagnostics
                      </button>
                      <button
                        onClick={() => {
                          setEventTimeline([])
                          dispatchTTPEvent('DIAGNOSTICS_CLEARED')
                        }}
                        className="flex-1 px-3 py-2 text-xs font-semibold rounded bg-gray-600 hover:bg-gray-700 text-white transition-colors"
                      >
                        Clear Diagnostics
                      </button>
                      <button
                        onClick={() => {
                          dispatchTTPEvent('MANUAL_DIAGNOSTIC_TEST')
                        }}
                        className="flex-1 px-3 py-2 text-xs font-semibold rounded bg-purple-600 hover:bg-purple-700 text-white transition-colors"
                      >
                        Add Test Event
                      </button>
                    </div>
                    
                    {/* Event Timeline */}
                    <div className="text-xs font-bold text-gray-300 mb-2">Event Timeline (last 200)</div>
                    <div 
                      ref={(el) => {
                        if (el) {
                          el.scrollTop = el.scrollHeight
                        }
                      }}
                      className="max-h-40 overflow-y-auto text-xs font-mono space-y-1 bg-gray-900/50 p-2 rounded border border-gray-600/50"
                    >
                      {eventTimeline.length === 0 && <div className="text-gray-500">No events yet</div>}
                      {eventTimeline.map((evt, idx) => (
                        <div key={idx} className="text-gray-300">
                          <span className="text-gray-500">{evt.timestamp}</span>
                          <span className="text-blue-300 ml-2">{evt.event}</span>
                          {(evt.sessionId || evt.attemptId || evt.paymentState || evt.stage) && (
                            <span className="text-gray-500 ml-2">
                              {evt.sessionId && `sid:${evt.sessionId.slice(0,8)} `}
                              {evt.attemptId && `att:${evt.attemptId.slice(0,8)} `}
                              {evt.paymentState && `state:${evt.paymentState} `}
                              {evt.stage && `stage:${evt.stage}`}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {showPaymentSetup ? (
                /* Payment Setup Screen */
                <div className="space-y-4">
                  {/* Test Status - hidden in production */}
                  {SHOW_TTP_TEST_STATUS && (
                    <div className="p-2 rounded bg-blue-900/20 border border-blue-500/30 text-xs font-mono space-y-1">
                      <div className="text-blue-300">TTP Build: {WEB_BUILD_MARKER}</div>
                      <div className="text-blue-200">State: {paymentState}</div>
                      <div className="text-blue-200">Stage: {lastSuccessfulStage}</div>
                      {error && <div className="text-red-300">Error: {error}</div>}
                      <div className="text-blue-200">Reset Reason: {lastResetReason}</div>
                      <div className="text-blue-200">Native: {isNativeSupported ? 'Yes' : 'No'}</div>
                      <div className="text-blue-200">Platform: {platform}</div>
                      {disabledReason && <div className="text-amber-300">Disabled: {disabledReason}</div>}
                      {mappedError && (
                        <>
                          <div className="text-blue-200">Mapped Title: {mappedError?.title}</div>
                          <div className="text-blue-200">Mapped Action: {mappedError?.action}</div>
                        </>
                      )}
                    </div>
                  )}

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
                      onClick={() => setShowCustomerSelector(!showCustomerSelector)}
                      className="w-full p-3 rounded-lg border border-border hover:border-border/80 transition-colors text-left active:scale-[0.99]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                            {selectedLead ? (
                              <User className="w-4.5 h-4.5 text-foreground" />
                            ) : (
                              <User className="w-4.5 h-4.5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="text-left">
                            <p className="font-medium text-foreground text-sm">
                              {selectedLead ? (selectedLead.name && selectedLead.name !== 'Not collected' ? selectedLead.name : 'Unknown') : 'Quick Payment'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedLead ? selectedLead.caller_phone : 'No customer or job'}
                            </p>
                          </div>
                        </div>
                        {showCustomerSelector ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </button>

                    {/* Customer Selector */}
                    {showCustomerSelector && (
                      <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <button
                          onClick={() => {
                            setSelectedLeadId(null)
                            setSelectedJobId(null)
                          }}
                          className={`w-full p-2.5 rounded-lg border transition-colors text-left active:scale-[0.99] ${
                            selectedLeadId === null
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-border/80'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                              <Smartphone className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                              <p className="font-medium text-foreground text-sm">Quick Payment</p>
                              <p className="text-xs text-muted-foreground">No customer or job</p>
                            </div>
                          </div>
                        </button>

                        {isLoadingLeads ? (
                          <div className="flex items-center justify-center py-3">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : leads.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No customers found</p>
                        ) : (
                          <div className="max-h-40 overflow-y-auto space-y-1">
                            {leads.slice(0, 10).map((lead) => (
                              <button
                                key={lead.id}
                                onClick={() => setSelectedLeadId(lead.id)}
                                className={`w-full p-2.5 rounded-lg border transition-colors text-left active:scale-[0.99] ${
                                  selectedLeadId === lead.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-border/80'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                    <User className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground text-sm truncate">{(lead.name && lead.name !== 'Not collected') ? lead.name : 'Unknown'}</p>
                                    <p className="text-xs text-muted-foreground truncate">{lead.caller_phone || ''}</p>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Job Selection */}
                        {selectedLeadId && (
                          <div className="space-y-2 pt-2 border-t border-border min-h-[80px]">
                            <p className="text-xs text-muted-foreground uppercase tracking-wider">Select a job (optional)</p>
                            {isLoadingJobs ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                              </div>
                            ) : jobs.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-2">No jobs found for this customer</p>
                            ) : (
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {jobs.map((job) => (
                                  <button
                                    key={job.id}
                                    onClick={() => setSelectedJobId(job.id)}
                                    className={`w-full p-2.5 rounded-lg border transition-colors text-left active:scale-[0.99] ${
                                      selectedJobId === job.id
                                        ? 'border-primary bg-primary/10'
                                        : 'border-border hover:border-border/80'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                        <Briefcase className="w-4 h-4 text-muted-foreground" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-foreground text-sm truncate">{job.title || 'Untitled Job'}</p>
                                        <p className="text-xs text-muted-foreground truncate">{job.scheduled_date || 'No date'}</p>
                                      </div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
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
                </div>
              ) : (
                /* Payment Progress Screen */
                <div className="flex flex-col items-center justify-center py-8 space-y-4">
                  {paymentState === 'preparing' && (
                    <>
                      <Loader2 className="w-12 h-12 animate-spin text-green-600 dark:text-green-400" />
                      <p className="text-sm text-muted-foreground text-center">
                        {lastSuccessfulStage === 'checking_previous_payment' 
                          ? 'Checking previous payment…' 
                          : 'Initializing payment terminal…'}
                      </p>
                      <p className="text-xs text-muted-foreground/60 text-center">{formatCurrency(amountCents / 100)}</p>
                    </>
                  )}

                  {paymentState === 'connecting_reader' && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center animate-pulse">
                        <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground text-center">Connecting to Tap to Pay…</p>
                      <p className="text-sm text-muted-foreground text-center px-4">
                        {connectingElapsedTime >= 5
                          ? 'Still connecting securely… this can take a few seconds.'
                          : 'Preparing the secure payment reader. This may take a few seconds the first time.'}
                      </p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(amountCents / 100)}</p>
                    </>
                  )}

                  {paymentState === 'creating_payment_intent' && (
                    <>
                      <Loader2 className="w-12 h-12 animate-spin text-green-600 dark:text-green-400" />
                      <p className="text-sm text-muted-foreground text-center">Preparing payment…</p>
                      <p className="text-xs text-muted-foreground/60 text-center">{formatCurrency(amountCents / 100)}</p>
                    </>
                  )}

                  {paymentState === 'waiting_for_card' && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center animate-pulse">
                        <Smartphone className="w-8 h-8 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground text-center">Ready for card</p>
                      <p className="text-xs text-muted-foreground text-center">Tap or insert card</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(amountCents / 100)}</p>
                    </>
                  )}

                  {paymentState === 'processing' && (
                    <>
                      <Loader2 className="w-12 h-12 animate-spin text-green-600 dark:text-green-400" />
                      <p className="text-sm text-muted-foreground text-center">Processing payment…</p>
                    </>
                  )}

                  {paymentState === 'success' && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground text-center">Payment successful!</p>
                      <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(amountCents / 100)}</p>
                    </>
                  )}

                  {paymentState === 'canceled' && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground text-center">Payment canceled</p>
                      <p className="text-sm text-muted-foreground text-center">No charge was made. You can try again whenever you're ready.</p>
                    </>
                  )}

                  {paymentState === 'failure' && (
                    <>
                      <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground text-center">{mappedError?.title || 'Payment Failed'}</p>
                      <p className="text-sm text-red-500 text-center">{mappedError?.message || error || 'An error occurred'}</p>
                    </>
                  )}
                  {/* Defensive fallback for unhandled states */}
                  {(!['ready', 'preparing', 'connecting_reader', 'creating_payment_intent', 'waiting_for_card', 'processing', 'success', 'failure', 'canceled', 'pending', 'ambiguous'].includes(paymentState)) && (
                    <>
                      {console.log('[QuickTTP UI] UNKNOWN_STATE_FALLBACK_RENDERED', {
                        paymentState,
                        previousPaymentState: lastSuccessfulStage,
                        lastSuccessfulStage,
                        isPaymentInProgress,
                        timestamp: new Date().toISOString()
                      })}
                      <AlertCircle className="w-12 h-12 text-red-600 dark:text-red-400" />
                      <p className="text-sm font-medium text-foreground text-center">Tap to Pay needs to be restarted</p>
                      <p className="text-xs text-muted-foreground text-center">Unknown state: {paymentState}</p>
                    </>
                  )}
                </div>
              )}
            </div>

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
                    disabled={amountCents <= 0 || !isAmountValid || !isNativeSupported || isPaymentInProgress}
                    className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Smartphone className="w-4 h-4" />
                    {isAmountBelowMinimum ? 'Minimum $0.50 Required' : 'Start Tap to Pay'}
                  </button>
                </>
              ) : (
                <>
                  {paymentState === 'canceled' ? (
                    <>
                      <button
                        onClick={() => {
                          console.log('[QuickTTP UI] CANCELED_DONE_CLICKED')
                          dispatchTTPEvent('CANCELED_DONE')
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
                        <>
                          <button
                            onClick={() => cancelPayment('user_back')}
                            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleOpenAppSettings}
                            className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors active:scale-95"
                          >
                            Open Settings
                          </button>
                        </>
                      ) : mappedError?.action === 'open_location_settings' ? (
                        <>
                          <button
                            onClick={() => cancelPayment('user_back')}
                            className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                          >
                            Back
                          </button>
                          <button
                            onClick={handleOpenLocationSettings}
                            className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors active:scale-95"
                          >
                            Open Location Settings
                          </button>
                        </>
                      ) : mappedError?.action === 'back' ? (
                        <button
                          onClick={() => cancelPayment('user_back')}
                          className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors active:scale-95"
                        >
                          Back
                        </button>
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
                              console.log('[QuickTTP UI] RESET_CLICKED')
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
                      onClick={() => cancelPayment('user_canceled')}
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
    </>
  )
}
