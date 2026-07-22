'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { CreditCard, Copy, ExternalLink, User, X, Smartphone, AlertCircle, Info } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'
import QuickTapToPayModal from '@/components/payments/QuickTapToPayModal'
import TapToPaySetupModal from '@/components/payments/TapToPaySetupModal'
import { isNativeCapacitor } from '@/lib/terminal'
import type { JobPrefill } from '@/components/jobs/JobComposer'

interface PaymentRequest {
  id: string
  amount_cents: number
  description: string
  status: string
  created_at: string
  paid_at: string | null
  checkout_url: string | null
  expires_at: string | null
  payment_provider: string | null
  leads: {
    id: string
    caller_phone: string
    raw_metadata: any
  }
}

interface PaymentStats {
  pendingAmount: number
  paidThisMonth: number
  pendingRequests: number
  collectionRate: number
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-yellow-900 text-yellow-200'
    case 'paid':
      return 'bg-green-900 text-green-200'
    case 'cancelled':
      return 'bg-gray-900 text-gray-200'
    case 'expired':
      return 'bg-red-900 text-red-200'
    case 'failed':
      return 'bg-red-900 text-red-200'
    default:
      return 'bg-gray-900 text-gray-200'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'paid':
      return 'Paid'
    case 'cancelled':
      return 'Cancelled'
    case 'expired':
      return 'Expired'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}


export default function PaymentsPage() {
  const router = useRouter()
  const { business } = useBusiness()
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [stats, setStats] = useState<PaymentStats>({
    pendingAmount: 0,
    paidThisMonth: 0,
    pendingRequests: 0,
    collectionRate: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false)
  const [isAddCustomerModalOpen, setIsAddCustomerModalOpen] = useState(false)
  const [paymentPrefill, setPaymentPrefill] = useState<JobPrefill | undefined>(undefined)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDescription, setPaymentDescription] = useState('')
  const [paymentProvider, setPaymentProvider] = useState<'stripe' | 'venmo' | 'paypal'>('stripe')
  const [isCreatingPayment, setIsCreatingPayment] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [showMarkPaidConfirm, setShowMarkPaidConfirm] = useState(false)
  const [showQuickTapToPay, setShowQuickTapToPay] = useState(false)
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [showTapToPaySetup, setShowTapToPaySetup] = useState(false)
  const [paymentToMarkPaid, setPaymentToMarkPaid] = useState<PaymentRequest | null>(null)
  useBodyScrollLock(showPaymentModal)

  // Lock background scroll when mark-paid confirm is open as well
  useBodyScrollLock(showMarkPaidConfirm)
  useBodyScrollLock(showQuickTapToPay)
  useBodyScrollLock(showTapToPaySetup)

  // Check native support on mount
  useEffect(() => {
    setIsNativeSupported(isNativeCapacitor())
  }, [])

  // Intercept Android Back/browser Back to close mark-paid confirm first
  useEffect(() => {
    if (!showMarkPaidConfirm) return
    try { window.history.pushState({ rfMarkPaidConfirm: true }, '') } catch {}
    const onPopState = () => setShowMarkPaidConfirm(false)
    window.addEventListener('popstate', onPopState)
    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => setShowMarkPaidConfirm(false))
      } catch {}
    })()
    return () => {
      window.removeEventListener('popstate', onPopState)
      capListener?.remove?.()
    }
  }, [showMarkPaidConfirm])

  // Determine which payment methods are configured
  const isStripeConfigured = business?.stripe_connect_status === 'connected' && business?.stripe_charges_enabled === true
  const isVenmoConfigured = business?.venmo_username && business.venmo_username.length > 0
  const isPaypalConfigured = business?.paypal_payment_link && business.paypal_payment_link.length > 0

  const configuredPaymentMethods = useMemo<Array<'stripe' | 'venmo' | 'paypal'>>(() => {
    const methods: Array<'stripe' | 'venmo' | 'paypal'> = []
    if (isStripeConfigured) methods.push('stripe')
    if (isVenmoConfigured) methods.push('venmo')
    if (isPaypalConfigured) methods.push('paypal')
    return methods
  }, [isStripeConfigured, isVenmoConfigured, isPaypalConfigured])

  const hasAnyPaymentMethod = configuredPaymentMethods.length > 0

  // Auto-switch to first configured method if current selection is unavailable
  // Auto-select first available method when modal opens
  useEffect(() => {
    if (showPaymentModal && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    }
  }, [showPaymentModal, configuredPaymentMethods])

  // Auto-switch if current selection becomes unavailable
  useEffect(() => {
    if (paymentProvider === 'stripe' && !isStripeConfigured && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    } else if (paymentProvider === 'venmo' && !isVenmoConfigured && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    } else if (paymentProvider === 'paypal' && !isPaypalConfigured && configuredPaymentMethods.length > 0) {
      setPaymentProvider(configuredPaymentMethods[0])
    }
  }, [isStripeConfigured, isVenmoConfigured, isPaypalConfigured, configuredPaymentMethods, paymentProvider])

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/payments', { headers })
      if (!response.ok) {
        throw new Error('Failed to fetch payments')
      }
      const data = await response.json()
      setPaymentRequests(data.paymentRequests || [])
      setStats(data.stats || {
        pendingAmount: 0,
        paidThisMonth: 0,
        pendingRequests: 0,
        collectionRate: 0,
      })
    } catch (err) {
      console.error('Error fetching payments:', err)
      setError('We couldn\'t load your payments. Please try refreshing the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleStartPaymentRequest = () => {
    setPaymentPrefill(undefined)
    setPaymentAmount('')
    setPaymentDescription('')
    setPaymentProvider('stripe')
    setError('')
    setIsLeadPickerOpen(true)
  }

  const handleLeadSelected = (prefill: JobPrefill) => {
    setPaymentPrefill(prefill)
    setIsLeadPickerOpen(false)
    setIsAddCustomerModalOpen(false)
    setShowPaymentModal(true)
  }

  const handleLeadCreated = async (leadId: string) => {
    try {
      const response = await fetch(`/api/lead-details?id=${leadId}`, { credentials: 'include' })
      const data = await response.json()
      if (!data.ok || !data.lead) {
        throw new Error(data.error || 'Failed to load customer details')
      }
      const lead = data.lead
      const conversationId = data.conversation?.id || lead.conversation_id || null
      const intake = getLeadAIIntake(lead)
      const noteParts = [
        intake.additionalDetails,
        intake.desiredCompletion ? `Desired completion: ${intake.desiredCompletion}` : null,
        intake.callbackTime ? `Best callback time: ${intake.callbackTime}` : null,
      ].filter(Boolean)

      const prefill: JobPrefill = {
        customer_name: intake.customerName || undefined,
        customer_phone: intake.customerPhone || lead.caller_phone || undefined,
        service_address: intake.serviceAddress || undefined,
        title: intake.serviceRequested || undefined,
        notes: noteParts.length > 0 ? noteParts.join('\n\n') : undefined,
        lead_id: lead.id,
        conversation_id: conversationId || undefined,
      }
      setPaymentPrefill(prefill)
      setIsAddCustomerModalOpen(false)
      setIsLeadPickerOpen(false)
      setShowPaymentModal(true)
    } catch (error) {
      console.error('Error loading lead details after creation:', error)
      setError('Failed to load customer details. Please try again.')
    }
  }

  const handleCreatePayment = async () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    if (!paymentPrefill?.lead_id) {
      setError('Please select a customer')
      return
    }

    // Client-side validation for payment method configuration
    if (paymentProvider === 'venmo' && !business?.venmo_username) {
      setError('Venmo hasn\'t been connected yet. Connect Venmo in Settings → Payments before sending Venmo payment requests.')
      return
    }

    if (paymentProvider === 'paypal' && !business?.paypal_payment_link) {
      setError('PayPal hasn\'t been connected yet. Connect PayPal in Settings → Payments before sending PayPal payment requests.')
      return
    }

    if (paymentProvider === 'stripe' && (!business?.stripe_connect_account_id || business.stripe_connect_status !== 'connected' || !business.stripe_charges_enabled)) {
      setError('Stripe hasn\'t been connected yet. Connect Stripe in Settings → Payments before sending Stripe payment requests.')
      return
    }

    setIsCreatingPayment(true)
    setError('')
    setSuccessMessage('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const leadId = paymentPrefill.lead_id
      const conversationId = paymentPrefill.conversation_id

      const payload = {
        business_id: business?.id,
        lead_id: leadId,
        conversation_id: conversationId,
        amount_cents: Math.round(parseFloat(paymentAmount) * 100),
        description: paymentDescription || undefined,
        payment_provider: paymentProvider,
      }

      const response = await fetch('/api/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create payment request')
      }

      setShowPaymentModal(false)
      setPaymentPrefill(undefined)
      setPaymentAmount('')
      setPaymentDescription('')
      setPaymentProvider('stripe')
      setSuccessMessage('Payment request sent successfully')
      
      // Refresh payments
      await fetchPayments()
    } catch (err) {
      console.error('Error creating payment request:', err)
      setError(err instanceof Error ? err.message : 'Failed to create payment request')
    } finally {
      setIsCreatingPayment(false)
    }
  }

  const getCustomerName = (lead: PaymentRequest['leads']) => {
    const intake = getLeadAIIntake(lead)
    return intake.customerName || 'Customer'
  }

  const copyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const handleCancelPayment = async (payment: PaymentRequest) => {
    setIsCancelling(true)
    setError('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/payments/${payment.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to cancel payment request')
      }

      setSuccessMessage('Payment request canceled successfully')
      
      // Refresh payments
      await fetchPayments()
    } catch (err) {
      console.error('Error canceling payment request:', err)
      setError(err instanceof Error ? err.message : 'Failed to cancel payment request')
    } finally {
      setIsCancelling(false)
    }
  }

  const handleMarkPaid = async (payment: PaymentRequest) => {
    setIsMarkingPaid(true)
    setError('')
    setShowMarkPaidConfirm(false)
    setPaymentToMarkPaid(null)

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/payments/${payment.id}/mark-paid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to mark payment as paid')
      }

      setSuccessMessage('Payment marked as paid successfully')
      
      // Refresh payments
      await fetchPayments()
    } catch (err) {
      console.error('Error marking payment as paid:', err)
      setError(err instanceof Error ? err.message : 'Failed to mark payment as paid')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  return (
    <DashboardShell
      title="Payments"
      maxWidthClassName="max-w-7xl mx-auto"
      contentClassName="flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8 relative z-10"
      contentStyle={{ paddingBottom: 'max(80px, calc(80px + env(safe-area-inset-bottom)))' }}
      innerClassName="space-y-5 sm:space-y-6"
    >
        <PageHeader
          title="Payments"
          description="Request and track customer payments."
        />

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Tap to Pay Card */}
          {(() => {
            const isStripeReady = business?.stripe_connect_status === 'connected' && business?.stripe_charges_enabled
            const isStripeIncomplete = business?.stripe_connect_account_id && !isStripeReady
            const isStripeNotConnected = !business?.stripe_connect_account_id

            // State 4: Stripe ready + device supported
            if (isNativeSupported && isStripeReady) {
              return (
                <button
                  onClick={() => setShowQuickTapToPay(true)}
                  className="bg-gradient-to-br from-green-900/30 to-green-800/20 dark:from-green-900/30 dark:to-green-800/20 rounded-lg p-4 sm:p-5 border border-green-700/50 hover:border-green-600/50 transition-all hover:scale-[1.02] text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm sm:text-base">Tap to Pay</h3>
                      <p className="text-green-300/80 text-xs">Collect in-person</p>
                    </div>
                  </div>
                  <p className="text-green-200/70 text-xs sm:text-sm">Accept contactless payments now with your phone</p>
                </button>
              )
            }

            // State 3: Stripe ready + device unsupported (web)
            if (!isNativeSupported && isStripeReady) {
              return (
                <div className="bg-slate-800/50 rounded-lg p-4 sm:p-5 border border-slate-700/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-slate-700/50 rounded-lg flex items-center justify-center">
                      <Smartphone className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-slate-300 font-semibold text-sm sm:text-base">Tap to Pay</h3>
                      <p className="text-slate-500 text-xs">Mobile app required</p>
                    </div>
                  </div>
                  <p className="text-slate-400 text-xs sm:text-sm">Accept contactless payments from the ReplyFlow mobile app</p>
                </div>
              )
            }

            // State 2: Stripe setup incomplete
            if (isStripeIncomplete) {
              return (
                <button
                  onClick={() => setShowTapToPaySetup(true)}
                  className="bg-gradient-to-br from-amber-900/30 to-amber-800/20 dark:from-amber-900/30 dark:to-amber-800/20 rounded-lg p-4 sm:p-5 border border-amber-700/50 hover:border-amber-600/50 transition-all hover:scale-[1.02] text-left"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold text-sm sm:text-base">Tap to Pay</h3>
                      <p className="text-amber-300/80 text-xs">Finish setup</p>
                    </div>
                  </div>
                  <p className="text-amber-200/70 text-xs sm:text-sm">Complete Stripe setup to accept contactless payments</p>
                </button>
              )
            }

            // State 1: Stripe not connected
            return (
              <button
                onClick={() => setShowTapToPaySetup(true)}
                className="bg-gradient-to-br from-green-900/30 to-green-800/20 dark:from-green-900/30 dark:to-green-800/20 rounded-lg p-4 sm:p-5 border border-green-700/50 hover:border-green-600/50 transition-all hover:scale-[1.02] text-left"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm sm:text-base">Tap to Pay</h3>
                    <p className="text-green-300/80 text-xs">Setup required</p>
                  </div>
                </div>
                <p className="text-green-200/70 text-xs sm:text-sm">Accept contactless payments directly from your phone</p>
              </button>
            )
          })()}

          {/* Request Payment Card */}
          <button
            onClick={handleStartPaymentRequest}
            className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 dark:from-blue-900/30 dark:to-blue-800/20 rounded-lg p-4 sm:p-5 border border-blue-700/50 hover:border-blue-600/50 transition-all hover:scale-[1.02] text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm sm:text-base">Request Payment</h3>
                <p className="text-blue-300/80 text-xs">Send payment link</p>
              </div>
            </div>
            <p className="text-blue-200/70 text-xs sm:text-sm">Send a payment request via SMS to your customer</p>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 border border-red-800 text-red-400 px-4 py-3 rounded-md">
            {error}
          </div>
        ) : (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-4 sm:p-5 border border-slate-700/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Pending Amount</span>
                  <CreditCard className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {formatCurrency(stats.pendingAmount / 100)}
                </div>
              </div>

              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-4 sm:p-5 border border-slate-700/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Paid This Month</span>
                  <CreditCard className="h-4 w-4 text-green-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {formatCurrency(stats.paidThisMonth / 100)}
                </div>
              </div>

              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-4 sm:p-5 border border-slate-700/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Pending Requests</span>
                  <CreditCard className="h-4 w-4 text-yellow-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {stats.pendingRequests}
                </div>
              </div>

              <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg p-4 sm:p-5 border border-slate-700/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm font-medium">Collection Rate</span>
                  <CreditCard className="h-4 w-4 text-purple-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white">
                  {stats.collectionRate}%
                </div>
              </div>
            </div>

            {/* Payment Requests Table - Mobile cards, Desktop table */}
            <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-lg border border-slate-700 overflow-hidden">
              {/* Mobile card view */}
              <div className="md:hidden space-y-2.5 p-3">
                {paymentRequests.length === 0 ? (
                  <div className="text-center py-8 px-4 text-gray-400">
                    <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/80 border border-slate-700">
                      <CreditCard className="h-5 w-5 text-blue-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">No payment requests yet.</h3>
                    <p className="text-xs text-gray-400 max-w-xs mx-auto mb-4">Payment requests you send will appear here.</p>
                    <Button onClick={handleStartPaymentRequest} size="sm">
                      <CreditCard className="h-4 w-4" />
                      New Payment Request
                    </Button>
                  </div>
                ) : (
                  paymentRequests.map((payment) => (
                    <div key={payment.id} className="bg-[#0f172a] dark:bg-[#0f172a] rounded-lg p-3 border border-slate-700">
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-400" />
                          <span className="text-white font-medium text-sm">
                            {getCustomerName(payment.leads)}
                          </span>
                        </div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(payment.status)}`}>
                          {getStatusLabel(payment.status)}
                        </span>
                      </div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Phone</span>
                          <span className="text-gray-300">{formatPhoneNumber(payment.leads.caller_phone)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Amount</span>
                          <span className="text-white font-semibold">{formatCurrency(payment.amount_cents / 100)}</span>
                        </div>
                        {payment.description && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Description</span>
                            <span className="text-gray-300 truncate max-w-[150px]">{payment.description}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-400">Requested</span>
                          <span className="text-gray-300">{new Date(payment.created_at).toLocaleDateString()}</span>
                        </div>
                        {payment.paid_at && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Paid</span>
                            <span className="text-gray-300">{new Date(payment.paid_at).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-slate-700">
                        <button
                          onClick={() => router.push(`/dashboard/leads/${payment.leads.id}`)}
                          className="flex-1 text-blue-400 hover:text-blue-300 text-xs font-medium text-center py-1.5"
                        >
                          View Customer
                        </button>
                        {payment.status === 'pending' && payment.checkout_url && (
                          <>
                            <button
                              onClick={() => copyPaymentLink(payment.checkout_url!)}
                              className="p-1.5 text-blue-400 hover:text-blue-300"
                              title="Copy payment link"
                            >
                              <Copy className="h-4 w-4" />
                            </button>
                            <a
                              href={payment.checkout_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-blue-400 hover:text-blue-300"
                              title="Open payment link"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </>
                        )}
                        {payment.status === 'pending' && (payment.payment_provider === 'paypal' || payment.payment_provider === 'venmo') && (
                          <button
                            onClick={() => {
                              setPaymentToMarkPaid(payment)
                              setShowMarkPaidConfirm(true)
                            }}
                            disabled={isMarkingPaid}
                            className="p-1.5 text-green-400 hover:text-green-300 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
                            title="Mark as paid"
                          >
                            <CreditCard className="h-4 w-4" />
                            Mark Paid
                          </button>
                        )}
                        {payment.status === 'pending' && (
                          <button
                            onClick={() => handleCancelPayment(payment)}
                            disabled={isCancelling}
                            className="p-1.5 text-red-400 hover:text-red-300 disabled:opacity-50"
                            title="Cancel payment request"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#0f172a] dark:bg-[#0f172a]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Phone Number
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Requested
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {paymentRequests.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 border border-slate-700">
                              <CreditCard className="h-5 w-5 text-blue-400" />
                            </div>
                            <div>
                              <h3 className="text-sm font-semibold text-white mb-1">No payment requests yet.</h3>
                              <p className="text-xs text-gray-400">Send your first payment request to start tracking customer payments.</p>
                            </div>
                            <Button onClick={() => setShowPaymentModal(true)} size="sm">
                              <CreditCard className="h-4 w-4" />
                              New Payment Request
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      paymentRequests.map((payment) => (
                        <tr key={payment.id} className="hover:bg-[#1a2235] dark:hover:bg-[#1a2235] transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <User className="h-4 w-4 text-gray-400 mr-2" />
                              <span className="text-white font-medium text-sm">
                                {getCustomerName(payment.leads)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-sm">
                            {formatPhoneNumber(payment.leads.caller_phone)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-white font-semibold text-sm">
                            {formatCurrency(payment.amount_cents / 100)}
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-sm max-w-[220px] truncate">
                            {payment.description}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(payment.status)}`}>
                              {getStatusLabel(payment.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-sm">
                            {new Date(payment.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-sm">
                            {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <button
                                onClick={() => router.push(`/dashboard/leads/${payment.leads.id}`)}
                                className="text-gray-400 hover:text-white text-xs font-medium"
                              >
                                View Customer
                              </button>
                              {payment.status === 'pending' && payment.checkout_url && (
                                <>
                                  <button
                                    onClick={() => copyPaymentLink(payment.checkout_url!)}
                                    className="text-blue-400 hover:text-blue-300 p-1"
                                    title="Copy payment link"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <a
                                    href={payment.checkout_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 p-1"
                                    title="Open payment link"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </>
                              )}
                              {payment.status === 'pending' && (payment.payment_provider === 'paypal' || payment.payment_provider === 'venmo') && (
                                <button
                                  onClick={() => {
                                    setPaymentToMarkPaid(payment)
                                    setShowMarkPaidConfirm(true)
                                  }}
                                  disabled={isMarkingPaid}
                                  className="text-green-400 hover:text-green-300 text-xs font-medium p-1 disabled:opacity-50 flex items-center gap-1"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  Mark Paid
                                </button>
                              )}
                              {payment.status === 'pending' && (
                                <button
                                  onClick={() => handleCancelPayment(payment)}
                                  disabled={isCancelling}
                                  className="text-red-400 hover:text-red-300 p-1 disabled:opacity-50"
                                  title="Cancel payment request"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* New Payment Request Modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm md:items-center md:justify-center">
            <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col border border-slate-700">
              {/* Header - shrink-0 */}
              <div className="flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-slate-700 shrink-0">
                <div className="min-w-0 pr-3">
                  <h3 className="text-lg font-semibold text-white leading-tight">
                    New Payment Request
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                    Send a secure payment link by text.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowPaymentModal(false)
                    setPaymentPrefill(undefined)
                    setPaymentAmount('')
                    setPaymentDescription('')
                    setPaymentProvider('stripe')
                    setError('')
                  }}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content - flex-1 overflow-y-auto */}
              <div data-scroll-lock-allow className="overflow-y-auto flex-1 overscroll-contain px-4 py-3 md:px-5 md:py-4 space-y-2.5 md:space-y-3" style={{ maxHeight: 'calc(100dvh-10rem)', WebkitOverflowScrolling: 'touch' }}>
                {paymentPrefill && (
                  <div className="p-3 bg-[#0f172a] border border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-400">Customer</p>
                        <p className="text-sm font-medium text-white">
                          {paymentPrefill.customer_name || 'Customer'}
                        </p>
                        {paymentPrefill.customer_phone && (
                          <p className="text-xs text-gray-400">
                            {formatPhoneNumber(paymentPrefill.customer_phone)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPaymentModal(false)
                          setIsLeadPickerOpen(true)
                        }}
                        disabled={isCreatingPayment}
                        className="text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5 md:mb-2">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                      disabled={isCreatingPayment}
                      className="w-full pl-8 pr-3 py-2 border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5 md:mb-2">
                    Payment Method
                  </label>
                  {hasAnyPaymentMethod ? (
                    <div className="grid grid-cols-3 gap-2.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setPaymentProvider('stripe')}
                        disabled={!isStripeConfigured || isCreatingPayment}
                        className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                          paymentProvider === 'stripe' && isStripeConfigured
                            ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                            : !isStripeConfigured
                            ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                            : 'bg-[#0f172a] border-slate-600 text-gray-300 hover:border-slate-500'
                        }`}
                      >
                        Stripe
                        {!isStripeConfigured && (
                          <div className="text-[10px] md:text-xs text-slate-500 mt-0.5">Configure first</div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentProvider('venmo')}
                        disabled={!isVenmoConfigured || isCreatingPayment}
                        className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                          paymentProvider === 'venmo' && isVenmoConfigured
                            ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                            : !isVenmoConfigured
                            ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                            : 'bg-[#0f172a] border-slate-600 text-gray-300 hover:border-slate-500'
                        }`}
                      >
                        Venmo
                        {!isVenmoConfigured && (
                          <div className="text-[10px] md:text-xs text-slate-500 mt-0.5">Configure first</div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentProvider('paypal')}
                        disabled={!isPaypalConfigured || isCreatingPayment}
                        className={`min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                          paymentProvider === 'paypal' && isPaypalConfigured
                            ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                            : !isPaypalConfigured
                            ? 'bg-slate-800/60 border-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                            : 'bg-[#0f172a] border-slate-600 text-gray-300 hover:border-slate-500'
                        }`}
                      >
                        PayPal
                        {!isPaypalConfigured && (
                          <div className="text-[10px] md:text-xs text-slate-500 mt-0.5">Configure first</div>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 md:p-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
                      <p className="text-sm text-yellow-200 mb-2 md:mb-3">
                        No payment methods have been configured yet.
                      </p>
                      <p className="text-sm text-yellow-200 mb-2 md:mb-3">
                        Connect Stripe, Venmo, or PayPal in your account settings to start accepting payments.
                      </p>
                      <button
                        onClick={() => {
                          router.push('/dashboard/settings#payments')
                          setShowPaymentModal(false)
                        }}
                        className="px-3 py-1.5 md:px-4 md:py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                      >
                        Configure Payment Methods
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5 md:mb-2">
                    Description
                  </label>
                  <textarea
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    placeholder="Service payment"
                    rows={2}
                    disabled={isCreatingPayment}
                    className="w-full px-3 py-2 min-h-[76px] border border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-[#0f172a] text-white resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                )}
              </div>

              {/* Footer/Actions - shrink-0 */}
              <div className="flex gap-2.5 justify-end px-4 py-3 md:px-5 md:py-4 border-t border-slate-700 shrink-0 pb-safe bg-[#1e293b]">
                <button
                  onClick={() => {
                    setShowPaymentModal(false)
                    setPaymentPrefill(undefined)
                    setPaymentAmount('')
                    setPaymentDescription('')
                    setPaymentProvider('stripe')
                    setError('')
                  }}
                  disabled={isCreatingPayment}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePayment}
                  disabled={isCreatingPayment || !paymentAmount || parseFloat(paymentAmount) <= 0 || !paymentPrefill?.lead_id || !hasAnyPaymentMethod}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingPayment ? 'Sending Request...' : 'Send Payment Request'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lead Picker Modal */}
        <LeadPickerModal
          title="New Payment Request"
          subtitle="Select a customer to send a payment request to"
          isOpen={isLeadPickerOpen}
          onClose={() => setIsLeadPickerOpen(false)}
          onSelect={handleLeadSelected}
          onAddNew={() => setIsAddCustomerModalOpen(true)}
        />

        {/* Add Customer Modal */}
        <AddCustomerModal
          isOpen={isAddCustomerModalOpen}
          onClose={() => setIsAddCustomerModalOpen(false)}
          onLeadCreated={handleLeadCreated}
        />

        {/* Mark as Paid Confirmation Modal */}
        {showMarkPaidConfirm && paymentToMarkPaid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowMarkPaidConfirm(false)}>
            <div className="bg-[#1e293b] dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-700" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-white mb-2">Confirm Payment Received</h3>
              <p className="text-gray-400 text-sm mb-4">
                Confirm that you received this payment through {paymentToMarkPaid.payment_provider === 'paypal' ? 'PayPal' : 'Venmo'}.
              </p>
              <div className="bg-[#0f172a] rounded-lg p-4 mb-4 border border-slate-700">
                <div className="flex justify-between mb-2">
                  <span className="text-gray-400 text-sm">Amount</span>
                  <span className="text-white font-semibold">{formatCurrency(paymentToMarkPaid.amount_cents / 100)}</span>
                </div>
                {paymentToMarkPaid.description && (
                  <div className="flex justify-between">
                    <span className="text-gray-400 text-sm">Description</span>
                    <span className="text-gray-300 text-sm">{paymentToMarkPaid.description}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowMarkPaidConfirm(false)
                    setPaymentToMarkPaid(null)
                  }}
                  disabled={isMarkingPaid}
                  className="px-4 py-2 text-sm font-medium text-gray-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleMarkPaid(paymentToMarkPaid)}
                  disabled={isMarkingPaid}
                  className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isMarkingPaid ? 'Marking...' : 'Confirm Payment Received'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quick Tap to Pay Modal */}
        <QuickTapToPayModal
          isOpen={showQuickTapToPay}
          onClose={() => setShowQuickTapToPay(false)}
        />

        {/* Tap to Pay Setup Modal */}
        <TapToPaySetupModal
          isOpen={showTapToPaySetup}
          onClose={() => setShowTapToPaySetup(false)}
          setupState={
            business?.stripe_connect_status === 'connected' && business?.stripe_charges_enabled
              ? 'ready'
              : business?.stripe_connect_account_id
                ? 'incomplete'
                : 'not_connected'
          }
        />
    </DashboardShell>
  )
}
