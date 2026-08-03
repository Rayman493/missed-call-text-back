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
  const WEB_BUILD_MARKER = 'TTP_WEB_2026_08_03_PROGRESS_RENDER_FIX'

  // Ref for modal title for accessibility focus
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Log web build marker on mount
  useEffect(() => {
    console.log('[QuickTTP UI] WEB_BUILD_MARKER: ' + WEB_BUILD_MARKER)
  }, [])

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
    resetTapToPayUiState,
    resetToSetup,
    checkPlatformSupport,
  } = useTapToPayOrchestration({
    amountCents,
    leadId: selectedLeadId || undefined,
    jobId: selectedJobId || undefined,
    description,
    onPaymentComplete: async () => {
      // Wait a moment for reconciliation to complete before refreshing
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    },
    onPaymentError: () => {},
  })

  // Derive showPaymentSetup from paymentState to ensure UI is always in sync
  const showPaymentSetup = paymentState === 'ready'

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

  // Modal-session initialization
  useEffect(() => {
    if (isOpen) {
      const newSessionId = `modal_${Date.now()}`
      console.log('[QuickTTP UI] MODAL_OPEN', { 
        previousSessionId: modalSessionId, 
        newSessionId,
        currentPaymentState: paymentState 
      })
      setModalSessionId(newSessionId)
      
      // Clear transient UI state on modal open
      resetToSetup('modal_opened')
    }
  }, [isOpen, paymentState, resetToSetup])

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
      cancelPayment('modal_opened')
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
    if (amountCents <= 0) return
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
      } else if (paymentState === 'ready') {
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
          } else if (paymentState === 'ready') {
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
                    onClose()
                  } else if (paymentState === 'canceled' || paymentState === 'failure') {
                    console.log('[QuickTTP UI] CLOSE_CLICKED_IN_ERROR_STATE', { paymentState })
                    emergencyCleanup()
                    onClose()
                  } else {
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
              {showPaymentSetup ? (
                /* Payment Setup Screen */
                <div className="space-y-4">
                  {/* Test Status - hidden in production */}
                  {false && SHOW_TTP_TEST_STATUS && (
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

                  {/* Debug UI - hidden in production */}
                  {false && SHOW_TAP_TO_PAY_DIAGNOSTICS && (
                    <>
                      <div className="p-3 rounded-lg border-2 border-red-700 bg-red-900/30 text-center">
                        <div className="text-red-300 font-extrabold text-lg tracking-wide">DEBUG PANEL BUILD 2026-07-23</div>
                        <div className="text-xs text-red-200/80">This banner proves this QuickTapToPayModal is rendering from src/components/payments/QuickTapToPayModal.tsx</div>
                      </div>
                    </>
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
                      <div className="w-16 h-16 rounded-full bg-gray-500/10 flex items-center justify-center">
                        <XCircle className="w-8 h-8 text-gray-600 dark:text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-foreground text-center">Payment canceled</p>
                      <p className="text-sm text-muted-foreground text-center">No payment was taken.</p>
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
                    disabled={amountCents <= 0 || !isNativeSupported || isPaymentInProgress}
                    className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Smartphone className="w-4 h-4" />
                    Start Tap to Pay
                  </button>
                </>
              ) : (
                <>
                  {paymentState === 'canceled' ? (
                    <>
                      <button
                        onClick={() => {
                          console.log('[QuickTTP UI] CANCELED_BACK_CLICKED')
                          emergencyCleanup()
                          resetToSetup('back_from_canceled')
                        }}
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
