'use client'

import { useState, useEffect } from 'react'
import { X, Smartphone, User, Briefcase, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { isNativeCapacitor } from '@/lib/terminal'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import TapToPayModal from './TapToPayModal'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { TerminalBridgeService } from '@/lib/terminal/service'

interface QuickTapToPayModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function QuickTapToPayModal({
  isOpen,
  onClose,
}: QuickTapToPayModalProps) {
  const { business } = useBusiness()
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
  const [showTapToPay, setShowTapToPay] = useState(false)
  const [showCustomerSelector, setShowCustomerSelector] = useState(false)

  useBodyScrollLock(isOpen)

  // Check native support when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsNativeSupported(isNativeCapacitor())

      // Development diagnostics
      if (process.env.NODE_ENV === 'development') {
        const terminalService = TerminalBridgeService.getInstance()
        const diagnostics = terminalService.getDiagnostics()
        console.log('[QuickTapToPayModal] Terminal diagnostics:', diagnostics)
      }

      setAmountCents(0)
      setAmountDisplay('')
      setSelectedLeadId(null)
      setSelectedJobId(null)
      setDescription('')
      setShowCustomerSelector(false)
    }
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
  }

  const handleQuickAmount = (dollars: number) => {
    setAmountDisplay(dollars.toString())
    setAmountCents(dollars * 100)
  }

  const handleStartPayment = () => {
    if (amountCents <= 0) return
    setShowTapToPay(true)
  }

  const handlePaymentComplete = async () => {
    setShowTapToPay(false)
    onClose()
    // Wait a moment for reconciliation to complete before refreshing
    // This ensures the payment is marked as paid before the UI refreshes
    await new Promise(resolve => setTimeout(resolve, 2000))
    // Trigger a page refresh to update Payments UI
    // This ensures the newly paid payment appears as paid
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  // Handle Android back and browser back
  useEffect(() => {
    if (!isOpen) return

    try {
      window.history.pushState({ rfQuickTapToPay: true }, '')
    } catch {}

    const onPopState = () => {
      if (showTapToPay) {
        setShowTapToPay(false)
      } else {
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
          if (showTapToPay) {
            setShowTapToPay(false)
          } else {
            onClose()
          }
        })
      } catch {}
    })()

    return () => {
      window.removeEventListener('popstate', onPopState)
      capListener?.remove?.()
    }
  }, [isOpen, onClose, showTapToPay])

  if (!isOpen) return null

  const selectedLead = leads.find(l => l.id === selectedLeadId)
  const selectedJob = jobs.find(j => j.id === selectedJobId)

  return (
    <>
      {/* Quick Tap to Pay Modal */}
      {!showTapToPay && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Tap to Pay</h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
              {/* Amount Input */}
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground mb-2">Enter amount</p>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-4xl font-bold text-muted-foreground">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amountDisplay}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-48 text-5xl font-bold text-foreground bg-transparent border-none outline-none text-center placeholder:text-muted-foreground/30"
                    autoFocus
                  />
                </div>
              </div>

              {/* Quick Amount Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[10, 25, 50, 100].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => handleQuickAmount(amount)}
                    className="py-3 px-4 text-sm font-medium bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                  >
                    ${amount}
                  </button>
                ))}
              </div>

              {/* Optional Customer/Job */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowCustomerSelector(!showCustomerSelector)}
                  className="w-full p-4 rounded-lg border border-border hover:border-border/80 transition-colors text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        {selectedLead ? (
                          <User className="w-5 h-5 text-foreground" />
                        ) : (
                          <User className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-left">
                        <p className="font-medium text-foreground">
                          {selectedLead ? selectedLead.name || 'Unknown' : 'Quick Payment'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {selectedLead ? selectedLead.caller_phone : 'No customer or job'}
                        </p>
                      </div>
                    </div>
                    {showCustomerSelector ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
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
                      className={`w-full p-3 rounded-lg border transition-colors text-left ${
                        selectedLeadId === null
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-border/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          <Smartphone className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">Quick Payment</p>
                          <p className="text-xs text-muted-foreground">No customer or job</p>
                        </div>
                      </div>
                    </button>

                    {isLoadingLeads ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : leads.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">No customers found</p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {leads.slice(0, 10).map((lead) => (
                          <button
                            key={lead.id}
                            onClick={() => setSelectedLeadId(lead.id)}
                            className={`w-full p-3 rounded-lg border transition-colors text-left ${
                              selectedLeadId === lead.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:border-border/80'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                <User className="w-4 h-4 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-foreground truncate">{lead.name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground truncate">{lead.caller_phone || ''}</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Job Selection */}
                    {selectedLeadId && (
                      <div className="space-y-2 pt-2 border-t border-border">
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
                                className={`w-full p-3 rounded-lg border transition-colors text-left ${
                                  selectedJobId === job.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border hover:border-border/80'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                    <Briefcase className="w-4 h-4 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground truncate">{job.title || 'Untitled Job'}</p>
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

              {!isNativeSupported && (
                <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
                  Tap to Pay is only available on the mobile app
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-border/50 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStartPayment}
                disabled={amountCents <= 0 || !isNativeSupported}
                className="flex-1 px-4 py-3 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Smartphone className="w-4 h-4" />
                Start Tap to Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tap to Pay Modal */}
      {showTapToPay && (
        <TapToPayModal
          isOpen={showTapToPay}
          onClose={() => setShowTapToPay(false)}
          amountCents={amountCents}
          leadId={selectedLeadId || undefined}
          jobId={selectedJobId || undefined}
          description={description || undefined}
          customerName={selectedLead?.name || undefined}
          onPaymentComplete={handlePaymentComplete}
        />
      )}
    </>
  )
}
