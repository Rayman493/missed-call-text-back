'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { CreditCard, Copy, ExternalLink, User, X, AlertCircle, Info, ChevronDown, MessageSquare, Link, Filter, Edit, RefreshCw } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'
import AppleTapToPayIcon from '@/components/icons/AppleTapToPayIcon'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { getPaymentStatusStyle } from '@/lib/payment-status'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'
import QuickTapToPayModal from '@/components/payments/QuickTapToPayModal'
import FocusSection from '@/components/FocusSection'
import TapToPaySetupModal from '@/components/payments/TapToPaySetupModal'
import { isNativeCapacitor } from '@/lib/terminal'
import { invalidateIntelligence } from '@/lib/intelligence-invalidation/intelligence-invalidation-service'
import { analyticsService } from '@/lib/analytics/analytics-service'
import type { JobPrefill } from '@/components/jobs/JobComposer'
import EmptyState from '@/components/ui/EmptyState'
import { CardSkeleton } from '@/components/ui/Skeleton'
import Dropdown from '@/components/ui/Dropdown'
import type { DropdownOption } from '@/components/ui/Dropdown'
import PaymentEditModal from '@/components/payments/PaymentEditModal'

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
  payment_method_type: string | null
  job_id: string | null
  display_name: string | null
  leads: {
    id: string
    caller_phone: string
    raw_metadata: any
    ai_call_records?: Array<{
      id: string
      created_at: string
      extracted_info: any
    }>
  } | null
  jobs: {
    id: string
    title: string
  } | null
}

interface PaymentStats {
  pendingAmount: number
  paidThisMonth: number
  pendingRequests: number
  collectionRate: number
}

function getStatusColor(status: string): string {
  const style = getPaymentStatusStyle(status)
  return style.badgeClass
}

function getPaymentMethodBadge(methodType: string | null, provider: string | null) {
  // Tap to Pay (Terminal)
  if (methodType === 'card_present') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
        <AppleTapToPayIcon size={12} className="h-3 w-3" />
        Tap to Pay
      </span>
    )
  }
  // Venmo
  if (provider === 'venmo') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
        <Link className="h-3 w-3" />
        Venmo
      </span>
    )
  }
  // PayPal
  if (provider === 'paypal') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50">
        <Link className="h-3 w-3" />
        PayPal
      </span>
    )
  }
  // SMS Link (Stripe card)
  if (methodType === 'card') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50">
        <MessageSquare className="h-3 w-3" />
        SMS Link
      </span>
    )
  }
  // Unknown
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700/50">
      —
    </span>
  )
}

const getStatusLabel = (status: string) => {
  const style = getPaymentStatusStyle(status)
  return style.label
}

// Payment filter options
const paymentFilterOptions: DropdownOption[] = [
  { value: 'all', label: 'All Payments' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
  { value: 'failed', label: 'Failed' },
]


export default function PaymentsPage() {
  const router = useRouter()
  const { business } = useBusiness()
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([])
  const [paymentFilter, setPaymentFilter] = useState('all')
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
  const [showOlderPayments, setShowOlderPayments] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [paymentToEdit, setPaymentToEdit] = useState<PaymentRequest | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editError, setEditError] = useState('')
  const [isReconciling, setIsReconciling] = useState(false)
  const [scrollPositionBeforeEdit, setScrollPositionBeforeEdit] = useState<number | null>(null)
  useBodyScrollLock(showPaymentModal)

  // Lock background scroll when mark-paid confirm is open as well
  useBodyScrollLock(showMarkPaidConfirm)
  useBodyScrollLock(showQuickTapToPay)
  useBodyScrollLock(showTapToPaySetup)
  useBodyScrollLock(showEditModal)

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

  // Filter payments based on selected filter
  const filteredPayments = useMemo(() => {
    if (paymentFilter === 'all') {
      return paymentRequests
    }
    return paymentRequests.filter(payment => payment.status === paymentFilter)
  }, [paymentRequests, paymentFilter])

  // Split payments into visible (first 20) and older (rest)
  const { visiblePayments, olderPayments } = useMemo(() => {
    const VISIBLE_COUNT = 20
    if (filteredPayments.length <= VISIBLE_COUNT) {
      return { visiblePayments: filteredPayments, olderPayments: [] }
    }
    return {
      visiblePayments: filteredPayments.slice(0, VISIBLE_COUNT),
      olderPayments: filteredPayments.slice(VISIBLE_COUNT),
    }
  }, [filteredPayments])

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

  // Listen for payment completion events to refresh the list
  useEffect(() => {
    const handlePaymentCompleted = (event: CustomEvent) => {
      console.log('[Payments Page] PAYMENT_COMPLETED_EVENT_RECEIVED', event.detail)
      fetchPayments()
    }

    window.addEventListener('replyflow:payment-completed', handlePaymentCompleted as EventListener)
    return () => {
      window.removeEventListener('replyflow:payment-completed', handlePaymentCompleted as EventListener)
    }
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
        title: getLeadRequestTitle(lead) || intake.serviceRequested || undefined,
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

      // Track payment requested event
      if (business?.id) {
        analyticsService.track('payment_requested', { 
          amount: paymentAmount ? parseFloat(paymentAmount) : undefined,
          provider: 'stripe'
        }, business.id).catch(error => {
          console.error('[Analytics] Failed to track payment_requested:', error)
        })
      }

      // Invalidate intelligence after successful payment request
      if (business?.id && paymentPrefill.lead_id) {
        invalidateIntelligence({
          businessId: business.id,
          customerId: paymentPrefill.lead_id,
          mutation: 'payment_requested'
        }).catch(error => {
          console.error('[IntelligenceInvalidation] Failed:', error)
        })
      }

      // Refresh payments
      await fetchPayments()
    } catch (err) {
      console.error('Error creating payment request:', err)
      setError(err instanceof Error ? err.message : 'Failed to create payment request')
    } finally {
      setIsCreatingPayment(false)
    }
  }

  const getCustomerName = (payment: PaymentRequest) => {
    // Terminal/card_present payments may not have a lead
    if (!payment.leads) {
      // If job exists, show job title
      if (payment.jobs) {
        return payment.jobs.title || 'Job Payment'
      }
      // Otherwise show Quick Payment
      return 'Quick Payment'
    }
    const intake = getLeadAIIntake(payment.leads)
    return intake.customerName || 'Customer'
  }

const getPaymentDescription = (payment: PaymentRequest) => {
    // If custom display_name exists, use it
    if (payment.display_name) {
      return payment.display_name
    }
    // Otherwise fall back to original description
    return payment.description
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

      // Invalidate intelligence after successful payment received
      if (business?.id && payment.leads?.id) {
        invalidateIntelligence({
          businessId: business.id,
          customerId: payment.leads.id,
          mutation: 'payment_received'
        }).catch(error => {
          console.error('[IntelligenceInvalidation] Failed:', error)
        })
      }

      // Refresh payments
      await fetchPayments()
    } catch (err) {
      console.error('Error marking payment as paid:', err)
      setError(err instanceof Error ? err.message : 'Failed to mark payment as paid')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  const handleOpenEditModal = (payment: PaymentRequest) => {
    // Capture scroll position before opening modal
    setScrollPositionBeforeEdit(window.pageYOffset)
    setPaymentToEdit(payment)
    setEditLabel(payment.display_name || '')
    setEditError('')
    setShowEditModal(true)
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setPaymentToEdit(null)
    setEditLabel('')
    setEditError('')
    // Restore scroll position after modal closes
    if (scrollPositionBeforeEdit !== null) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPositionBeforeEdit)
        setScrollPositionBeforeEdit(null)
      })
    }
  }

  const handleSaveLabel = async (label: string) => {
    if (!paymentToEdit) return

    setIsEditing(true)
    setEditError('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/payments/${paymentToEdit.id}/label`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: label }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update payment label')
      }

      // Optimistic update: update local state immediately to avoid layout shift
      setPaymentRequests(prev => prev.map(p =>
        p.id === paymentToEdit.id ? { ...p, display_name: label } : p
      ))

      setSuccessMessage('Payment label updated successfully')
    } catch (err) {
      console.error('Error updating payment label:', err)
      setEditError(err instanceof Error ? err.message : 'Failed to update payment label')
      throw err
    } finally {
      setIsEditing(false)
    }
  }

  const handleCheckStatus = async (payment: PaymentRequest) => {
    setIsReconciling(true)
    setError('')

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/payments/${payment.id}/reconcile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to check payment status')
      }

      const result = await response.json()
      console.log('[Payments] Reconciliation result:', result)

      setSuccessMessage('Payment status updated')

      // Refresh payments to show updated status
      await fetchPayments()
    } catch (err) {
      console.error('Error checking payment status:', err)
      setError(err instanceof Error ? err.message : 'Failed to check payment status')
    } finally {
      setIsReconciling(false)
    }
  }

  return (
    <DashboardShell
      title="Payments"
      maxWidthClassName="max-w-7xl mx-auto"
      contentClassName="flex-1 px-4 sm:px-5 lg:px-7 py-6 sm:py-8 lg:py-10 relative z-10 mobile-bottom-nav-safe-content-with-gap"
      innerClassName="space-y-6"
    >
        <PageHeader
          title="Payments"
          description="Request and track customer payments."
        />

        {/* Focus - Unified Intelligence for Payments */}
        <FocusSection business={business} view="payments" title="Collection Priorities" compact />

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                  className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.995]
                  bg-gradient-to-br from-green-100 dark:from-green-900/35 to-green-200 dark:to-green-800/25 border-green-300 dark:border-green-700/40 hover:border-green-400 dark:hover:border-green-600/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center gap-3.5 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 dark:bg-green-500/15 ring-1 ring-inset ring-green-600/40 dark:ring-green-600/30 shadow-[0_0_20px_rgba(34,197,94,0.18)] dark:shadow-[0_0_20px_rgba(34,197,94,0.18)] flex items-center justify-center">
                      <AppleTapToPayIcon size={20} className="text-green-700 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-foreground dark:text-white font-semibold text-base sm:text-lg leading-tight">Tap to Pay</h3>
                      <p className="text-green-800 dark:text-green-300/80 text-xs">Collect in-person</p>
                    </div>
                  </div>
                  <p className="text-green-900/95 dark:text-green-200/75 text-xs sm:text-sm">Accept contactless payments now with your phone</p>
                </button>
              )
            }

            // State 3: Stripe ready + device unsupported (web)
            if (!isNativeSupported && isStripeReady) {
              return (
                <div className="rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.18)]">
                  <div className="flex items-center gap-3.5 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-200/60 dark:bg-slate-700/60 ring-1 ring-inset ring-slate-300/40 dark:ring-slate-600/40 flex items-center justify-center">
                      <AppleTapToPayIcon size={20} className="text-slate-500 dark:text-slate-400" />
                    </div>
                    <div>
                      <h3 className="text-foreground dark:text-slate-200 font-semibold text-sm sm:text-base leading-tight">Tap to Pay</h3>
                      <p className="text-muted-foreground dark:text-slate-400 text-xs">Mobile app required</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground/80 dark:text-slate-300/85 text-xs sm:text-sm">Accept contactless payments from the ReplyFlow mobile app</p>
                </div>
              )
            }

            // State 2: Stripe setup incomplete
            if (isStripeIncomplete) {
              return (
                <button
                  onClick={() => setShowTapToPaySetup(true)}
                  className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.995]
                  bg-gradient-to-br from-amber-100 dark:from-amber-900/35 to-amber-200 dark:to-amber-800/25 border-amber-300 dark:border-amber-700/40 hover:border-amber-400 dark:hover:border-amber-600/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center gap-3.5 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 dark:bg-amber-500/15 ring-1 ring-inset ring-amber-600/40 dark:ring-amber-600/30 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-amber-700 dark:text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-foreground dark:text-white font-semibold text-sm sm:text-base leading-tight">Tap to Pay</h3>
                      <p className="text-amber-800 dark:text-amber-300/85 text-xs">Finish setup</p>
                    </div>
                  </div>
                  <p className="text-amber-900/90 dark:text-amber-200/80 text-xs sm:text-sm">Complete Stripe setup to accept contactless payments</p>
                </button>
              )
            }

            // State 1: Stripe not connected
            return (
              <button
                onClick={() => setShowTapToPaySetup(true)}
                className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.995]
                bg-gradient-to-br from-green-100 dark:from-green-900/35 to-green-200 dark:to-green-800/25 border-green-300 dark:border-green-700/40 hover:border-green-400 dark:hover:border-green-600/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
              >
                <div className="flex items-center gap-3.5 mb-2.5">
                  <div className="w-10 h-10 rounded-xl bg-green-500/20 dark:bg-green-500/15 ring-1 ring-inset ring-green-600/40 dark:ring-green-600/30 flex items-center justify-center">
                    <AppleTapToPayIcon size={20} className="text-green-700 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-foreground dark:text-white font-semibold text-sm sm:text-base leading-tight">Tap to Pay</h3>
                    <p className="text-green-800 dark:text-green-300/85 text-xs">Setup required</p>
                  </div>
                </div>
                <p className="text-green-900/90 dark:text-green-200/80 text-xs sm:text-sm">Accept contactless payments directly from your phone</p>
              </button>
            )
          })()}

          {/* Request Payment Card */}
          <button
            onClick={handleStartPaymentRequest}
            className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.01] active:scale-[0.995]
            bg-gradient-to-br from-blue-100 dark:from-blue-900/35 to-blue-200 dark:to-blue-800/25 border-blue-300 dark:border-blue-700/40 hover:border-blue-400 dark:hover:border-blue-600/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.22)]"
          >
            <div className="flex items-center gap-3.5 mb-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 dark:bg-blue-500/15 ring-1 ring-inset ring-blue-600/40 dark:ring-blue-600/30 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-700 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="text-foreground dark:text-white font-semibold text-sm sm:text-base leading-tight">Request Payment</h3>
                <p className="text-blue-800 dark:text-blue-300/85 text-xs">Send payment link</p>
              </div>
            </div>
            <p className="text-blue-900/95 dark:text-blue-200/80 text-xs sm:text-sm">Send a payment request via SMS to your customer</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
              <div className="rounded-xl p-3.5 sm:p-4 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-muted-foreground text-xs font-medium">Pending Amount</span>
                  <div className="h-8 w-8 rounded-lg bg-muted/60 ring-1 ring-inset ring-border/40 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-blue-500" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                  {formatCurrency(stats.pendingAmount / 100)}
                </div>
                {stats.pendingAmount === 0 ? (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">No outstanding payments</div>
                ) : null}
              </div>

              <div className="rounded-xl p-3.5 sm:p-4 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-muted-foreground text-xs font-medium">Paid This Month</span>
                  <div className="h-8 w-8 rounded-lg bg-muted/60 ring-1 ring-inset ring-border/40 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-green-500" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                  {formatCurrency(stats.paidThisMonth / 100)}
                </div>
              </div>

              <div className="rounded-xl p-3.5 sm:p-4 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-muted-foreground text-xs font-medium">Pending Requests</span>
                  <div className="h-8 w-8 rounded-lg bg-muted/60 ring-1 ring-inset ring-border/40 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-yellow-500" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                  {stats.pendingRequests}
                </div>
                {stats.pendingRequests > 0 ? (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">{stats.pendingRequests} pending</div>
                ) : (
                  <div className="mt-1.5 text-[11px] text-muted-foreground">No pending</div>
                )}
              </div>

              <div className="rounded-xl p-3.5 sm:p-4 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="text-muted-foreground text-xs font-medium">Payment Success Rate</span>
                  <div className="h-8 w-8 rounded-lg bg-muted/60 ring-1 ring-inset ring-border/40 flex items-center justify-center">
                    <CreditCard className="h-4 w-4 text-purple-500" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-foreground leading-tight">
                  {stats.collectionRate}%
                </div>
              </div>
            </div>

            {/* Table toolbar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex-1">
                {/* Optional: Add label if needed */}
              </div>
              <Dropdown
                options={paymentFilterOptions}
                value={paymentFilter}
                onChange={setPaymentFilter}
                size="sm"
                className="w-40"
              />
            </div>

            {/* Payment Requests Table - Mobile cards, Desktop table */}
            <div className="bg-card dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-700/80 overflow-hidden shadow-sm dark:shadow-[0_6px_18px_rgba(0,0,0,0.20)]">
              {/* Mobile card view */}
              <div className="md:hidden space-y-2.5 p-3">
                {paymentRequests.length === 0 && paymentFilter === 'all' ? (
                  <EmptyState
                    icon={<CreditCard className="w-6 h-6" strokeWidth={1.5} />}
                    title="No payment requests yet"
                    description="Send payment requests to customers to collect payments via text"
                    primaryAction={
                      <Button onClick={handleStartPaymentRequest} size="sm">
                        <CreditCard className="h-4 w-4" />
                        New Payment Request
                      </Button>
                    }
                    variant="payments"
                  />
                ) : paymentRequests.length > 0 && visiblePayments.length === 0 ? (
                  <EmptyState
                    icon={<CreditCard className="w-6 h-6" strokeWidth={1.5} />}
                    title="No payments match this filter"
                    description="Try a different filter to view other payments."
                    primaryAction={
                      <Button onClick={() => setPaymentFilter('all')} size="sm">
                        Clear Filter
                      </Button>
                    }
                    variant="payments"
                  />
                ) : (
                  <>
                    {visiblePayments.map((payment) => (
                      <div key={payment.id} className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-3 border border-border dark:border-slate-700">
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-foreground font-medium text-sm">
                              {getCustomerName(payment)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment.status)}`}>
                              {getStatusLabel(payment.status)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          {payment.leads && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Phone</span>
                              <span className="text-foreground">{formatPhoneNumber(payment.leads.caller_phone)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount</span>
                            <span className="text-foreground font-semibold">{formatCurrency(payment.amount_cents / 100)}</span>
                          </div>
                          {getPaymentDescription(payment) && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Description</span>
                              <span className="text-foreground truncate max-w-[150px]">{getPaymentDescription(payment)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Requested</span>
                            <span className="text-foreground">{new Date(payment.created_at).toLocaleDateString()}</span>
                          </div>
                          {payment.paid_at && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Paid</span>
                              <span className="text-foreground">{new Date(payment.paid_at).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center w-full mt-2.5 pt-2.5 border-t border-slate-700">
                          <div className="flex items-center gap-2 min-w-0">
                            {payment.leads && (
                              <button
                                onClick={() => router.push(`/dashboard/leads/${payment.leads!.id}`)}
                                className="flex-1 text-blue-400 hover:text-blue-300 text-xs font-medium text-center py-1.5"
                              >
                                View Customer
                              </button>
                            )}
                            {(payment.status === 'paid' || payment.status === 'pending') && (
                              <button
                                onClick={() => handleOpenEditModal(payment)}
                                className="p-1.5 text-muted-foreground hover:text-foreground"
                                title="Rename payment"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
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
                            {payment.status === 'pending' && payment.payment_method_type === 'card_present' && (
                              <button
                                onClick={() => handleCheckStatus(payment)}
                                disabled={isReconciling}
                                className="p-1.5 text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
                                title="Check payment status with Stripe"
                              >
                                <RefreshCw className={`h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
                                Check Status
                              </button>
                            )}
                          </div>
                          {payment.status === 'pending' && (
                            <button
                              onClick={() => handleCancelPayment(payment)}
                              disabled={isCancelling}
                              className="ml-auto p-1.5 text-red-400 hover:text-red-300 disabled:opacity-50 flex-shrink-0"
                              title="Cancel payment request"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Expandable older payments section */}
                    {olderPayments.length > 0 && (
                      <>
                        <button
                          onClick={() => setShowOlderPayments(!showOlderPayments)}
                          className="w-full bg-muted/50 dark:bg-[#0f172a] rounded-lg p-3 border border-border dark:border-slate-700 flex items-center justify-between gap-3 hover:bg-muted dark:hover:bg-[#1a2235] transition-colors"
                          aria-expanded={showOlderPayments}
                          aria-label={showOlderPayments ? `Hide ${olderPayments.length} older payments` : `Show ${olderPayments.length} older payments`}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {showOlderPayments ? `Hide older payments (${olderPayments.length})` : `Show older payments (${olderPayments.length})`}
                          </span>
                          <ChevronDown
                            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
                              showOlderPayments ? 'rotate-180' : ''
                            }`}
                          />
                        </button>

                        {showOlderPayments && (
                          <div className="space-y-2.5">
                            {olderPayments.map((payment) => (
                              <div key={payment.id} className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-3 border border-border dark:border-slate-700">
                                <div className="flex items-start justify-between gap-3 mb-2.5">
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-foreground font-medium text-sm">
                                      {getCustomerName(payment)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment.status)}`}>
                                      {getStatusLabel(payment.status)}
                                    </span>
                                  </div>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  {payment.leads && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Phone</span>
                                      <span className="text-foreground">{formatPhoneNumber(payment.leads.caller_phone)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Amount</span>
                                    <span className="text-foreground font-semibold">{formatCurrency(payment.amount_cents / 100)}</span>
                                  </div>
                                  {getPaymentDescription(payment) && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Description</span>
                                      <span className="text-foreground truncate max-w-[150px]">{getPaymentDescription(payment)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Requested</span>
                                    <span className="text-foreground">{new Date(payment.created_at).toLocaleDateString()}</span>
                                  </div>
                                  {payment.paid_at && (
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Paid</span>
                                      <span className="text-foreground">{new Date(payment.paid_at).toLocaleDateString()}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center w-full mt-2.5 pt-2.5 border-t border-slate-700">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {payment.leads && (
                                      <button
                                        onClick={() => router.push(`/dashboard/leads/${payment.leads!.id}`)}
                                        className="flex-1 text-blue-400 hover:text-blue-300 text-xs font-medium text-center py-1.5"
                                      >
                                        View Customer
                                      </button>
                                    )}
                                    {payment.status === 'paid' && (
                                      <button
                                        onClick={() => handleOpenEditModal(payment)}
                                        className="p-1.5 text-muted-foreground hover:text-foreground"
                                        title="Rename payment"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </button>
                                    )}
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
                                    {payment.status === 'pending' && payment.payment_method_type === 'card_present' && (
                                      <button
                                        onClick={() => handleCheckStatus(payment)}
                                        disabled={isReconciling}
                                        className="p-1.5 text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
                                        title="Check payment status with Stripe"
                                      >
                                        <RefreshCw className={`h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
                                        Check Status
                                      </button>
                                    )}
                                    {payment.status === 'pending' && payment.payment_method_type === 'card_present' && (
                                      <button
                                        onClick={() => handleCheckStatus(payment)}
                                        disabled={isReconciling}
                                        className="p-1.5 text-blue-400 hover:text-blue-300 disabled:opacity-50 flex items-center gap-1 text-xs font-medium"
                                        title="Check payment status with Stripe"
                                      >
                                        <RefreshCw className={`h-4 w-4 ${isReconciling ? 'animate-spin' : ''}`} />
                                        Check Status
                                      </button>
                                    )}
                                  </div>
                                  {payment.status === 'pending' && (
                                    <button
                                      onClick={() => handleCancelPayment(payment)}
                                      disabled={isCancelling}
                                      className="ml-auto p-1.5 text-red-400 hover:text-red-300 disabled:opacity-50 flex-shrink-0"
                                      title="Cancel payment request"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-[#0f172a]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Phone Number
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Payment Method
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Requested
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border [&_tr:nth-child(even)]:bg-muted/20 dark:[&_tr:nth-child(even)]:bg-slate-800/20">
                    {paymentRequests.length === 0 && paymentFilter === 'all' ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12">
                          <EmptyState
                            icon={<CreditCard className="w-6 h-6" strokeWidth={1.5} />}
                            title="No payment requests yet"
                            description="Send payment requests to customers to collect payments via text"
                            primaryAction={
                              <Button onClick={() => setShowPaymentModal(true)} size="sm">
                                <CreditCard className="h-4 w-4" />
                                New Payment Request
                              </Button>
                            }
                            variant="payments"
                          />
                        </td>
                      </tr>
                    ) : paymentRequests.length > 0 && visiblePayments.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-12">
                          <EmptyState
                            icon={<CreditCard className="w-6 h-6" strokeWidth={1.5} />}
                            title="No payments match this filter"
                            description="Try a different filter to view other payments."
                            primaryAction={
                              <Button onClick={() => setPaymentFilter('all')} size="sm">
                                Clear Filter
                              </Button>
                            }
                            variant="payments"
                          />
                        </td>
                      </tr>
                    ) : (
                      <>
                        {visiblePayments.map((payment) => (
                          <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2235] transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-foreground font-medium text-sm">
                                  {getCustomerName(payment)}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-sm max-w-[220px] truncate">
                              {getPaymentDescription(payment)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                              {payment.leads ? formatPhoneNumber(payment.leads.caller_phone) : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-foreground font-semibold text-sm">
                              {formatCurrency(payment.amount_cents / 100)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment.status)}`}>
                                {getStatusLabel(payment.status)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                              {new Date(payment.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                              {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center w-full">
                                <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                                  {(payment.status === 'paid' || payment.status === 'pending') && (
                                    <button
                                      onClick={() => handleOpenEditModal(payment)}
                                      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                      title="Edit payment"
                                      aria-label="Edit payment"
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  {payment.status === 'pending' && (payment.payment_provider === 'paypal' || payment.payment_provider === 'venmo') && (
                                    <button
                                      onClick={() => {
                                        setPaymentToMarkPaid(payment)
                                        setShowMarkPaidConfirm(true)
                                      }}
                                      disabled={isMarkingPaid}
                                      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-green-400 hover:text-green-300 hover:bg-green-500/10 text-xs font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500/50"
                                      aria-label="Mark as paid"
                                    >
                                      <CreditCard className="h-3.5 w-3.5" />
                                      Mark Paid
                                    </button>
                                  )}
                                  {payment.status === 'pending' && payment.payment_method_type === 'card_present' && (
                                    <button
                                      onClick={() => handleCheckStatus(payment)}
                                      disabled={isReconciling}
                                      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 text-xs font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                      aria-label="Check payment status"
                                    >
                                      <RefreshCw className={`h-3.5 w-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                                      Check Status
                                    </button>
                                  )}
                                </div>
                                {payment.status === 'pending' && !(payment.payment_method_type === 'card' && payment.checkout_url) && (
                                  <button
                                    onClick={() => handleCancelPayment(payment)}
                                    disabled={isCancelling}
                                    className="ml-auto h-8 w-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-red-500/50 flex-shrink-0"
                                    title="Cancel payment request"
                                    aria-label="Cancel payment request"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}

                        {/* Expandable older payments section */}
                        {olderPayments.length > 0 && (
                          <>
                            <tr>
                              <td colSpan={9} className="px-4 py-2 border-t border-border/50">
                                <button
                                  onClick={() => setShowOlderPayments(!showOlderPayments)}
                                  className="w-full flex items-center pr-4 hover:bg-muted/50 dark:hover:bg-slate-800/30 transition-colors py-2"
                                  aria-expanded={showOlderPayments}
                                  aria-label={`Show ${olderPayments.length} older payments`}
                                >
                                  <span className="flex-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                    Older payments ({olderPayments.length})
                                  </span>
                                  <ChevronDown
                                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ml-auto ${
                                      showOlderPayments ? 'rotate-180' : ''
                                    }`}
                                  />
                                </button>
                              </td>
                            </tr>

                            {showOlderPayments && olderPayments.map((payment) => (
                              <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2235] transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-foreground font-medium text-sm">
                                      {getCustomerName(payment)}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground text-sm max-w-[220px] truncate">
                                  {getPaymentDescription(payment)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                                  {payment.leads ? formatPhoneNumber(payment.leads.caller_phone) : '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-foreground font-semibold text-sm">
                                  {formatCurrency(payment.amount_cents / 100)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment.status)}`}>
                                    {getStatusLabel(payment.status)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                                  {new Date(payment.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                                  {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center w-full">
                                    <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                                      {(payment.status === 'paid' || payment.status === 'pending') && (
                                        <button
                                          onClick={() => handleOpenEditModal(payment)}
                                          className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                          title="Edit payment"
                                          aria-label="Edit payment"
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                      {payment.status === 'pending' && (payment.payment_provider === 'paypal' || payment.payment_provider === 'venmo') && (
                                        <button
                                          onClick={() => {
                                            setPaymentToMarkPaid(payment)
                                            setShowMarkPaidConfirm(true)
                                          }}
                                          disabled={isMarkingPaid}
                                          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-green-400 hover:text-green-300 hover:bg-green-500/10 text-xs font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-green-500/50"
                                          aria-label="Mark as paid"
                                        >
                                          <CreditCard className="h-3.5 w-3.5" />
                                          Mark Paid
                                        </button>
                                      )}
                                      {payment.status === 'pending' && payment.payment_method_type === 'card_present' && (
                                        <button
                                          onClick={() => handleCheckStatus(payment)}
                                          disabled={isReconciling}
                                          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 text-xs font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                          aria-label="Check payment status"
                                        >
                                          <RefreshCw className={`h-3.5 w-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                                          Check Status
                                        </button>
                                      )}
                                  </div>
                                  {payment.status === 'pending' && !(payment.payment_method_type === 'card' && payment.checkout_url) && (
                                      <button
                                        onClick={() => handleCancelPayment(payment)}
                                        disabled={isCancelling}
                                        className="ml-auto h-8 w-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-red-500/50 flex-shrink-0"
                                        title="Cancel payment request"
                                        aria-label="Cancel payment request"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                      </>
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
            <div className="bg-card dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full max-h-[calc(100dvh-1rem)] md:max-h-[90vh] overflow-hidden flex flex-col border border-border dark:border-slate-700">
              {/* Header - shrink-0 */}
              <div className="flex items-center justify-between px-4 py-3.5 md:px-5 md:py-4 border-b border-border dark:border-slate-700 shrink-0">
                <div className="min-w-0 pr-3">
                  <h3 className="text-lg font-semibold text-foreground leading-tight">
                    New Payment Request
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
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
                  className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted dark:hover:bg-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content - flex-1 overflow-y-auto */}
              <div data-scroll-lock-allow className="overflow-y-auto flex-1 overscroll-contain px-4 py-3 md:px-5 md:py-4 space-y-2.5 md:space-y-3" style={{ maxHeight: 'calc(100dvh-10rem-var(--bottom-nav-height,80px))', WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--bottom-nav-height,80px)' }}>
                {paymentPrefill && (
                  <div className="p-3 bg-muted/50 dark:bg-[#0f172a] border border-border dark:border-slate-700 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Customer</p>
                        <p className="text-sm font-medium text-foreground">
                          {paymentPrefill.customer_name || 'Customer'}
                        </p>
                        {paymentPrefill.customer_phone && (
                          <p className="text-xs text-muted-foreground">
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
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5 md:mb-2">
                    Amount (USD)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0.01"
                      disabled={isCreatingPayment}
                      className="w-full pl-8 pr-3 py-2 border border-border dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-background dark:bg-[#0f172a] text-foreground dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5 md:mb-2">
                    Payment Method
                  </label>
                  {hasAnyPaymentMethod ? (
                    <div className="grid grid-cols-3 gap-2.5 pt-0.5">
                      <div className="relative pb-5">
                        <button
                          type="button"
                          onClick={() => isStripeConfigured && setPaymentProvider('stripe')}
                          disabled={isCreatingPayment}
                          className={`w-full min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                            paymentProvider === 'stripe' && isStripeConfigured
                              ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                              : !isStripeConfigured
                              ? 'bg-muted dark:bg-slate-800/60 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-500'
                              : 'bg-background dark:bg-[#0f172a] border-border dark:border-slate-600 text-foreground dark:text-gray-300 hover:bg-muted dark:hover:border-slate-500'
                          }`}
                        >
                          Stripe
                        </button>
                        {!isStripeConfigured && (
                          <button
                            type="button"
                            onClick={() => {
                              router.push('/dashboard/settings#payments')
                              setShowPaymentModal(false)
                            }}
                            className="absolute bottom-0 left-0 right-0 text-[10px] md:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
                          >
                            Configure →
                          </button>
                        )}
                      </div>
                      <div className="relative pb-5">
                        <button
                          type="button"
                          onClick={() => isVenmoConfigured && setPaymentProvider('venmo')}
                          disabled={isCreatingPayment}
                          className={`w-full min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                            paymentProvider === 'venmo' && isVenmoConfigured
                              ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                              : !isVenmoConfigured
                              ? 'bg-muted dark:bg-slate-800/60 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-500'
                              : 'bg-background dark:bg-[#0f172a] border-border dark:border-slate-600 text-foreground dark:text-gray-300 hover:bg-muted dark:hover:border-slate-500'
                          }`}
                        >
                          Venmo
                        </button>
                        {!isVenmoConfigured && (
                          <button
                            type="button"
                            onClick={() => {
                              router.push('/dashboard/settings#payments-venmo')
                              setShowPaymentModal(false)
                            }}
                            className="absolute bottom-0 left-0 right-0 text-[10px] md:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
                          >
                            Configure →
                          </button>
                        )}
                      </div>
                      <div className="relative pb-5">
                        <button
                          type="button"
                          onClick={() => isPaypalConfigured && setPaymentProvider('paypal')}
                          disabled={isCreatingPayment}
                          className={`w-full min-h-[44px] px-2 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-all ${
                            paymentProvider === 'paypal' && isPaypalConfigured
                              ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_8px_24px_rgba(37,99,235,0.25)]'
                              : !isPaypalConfigured
                              ? 'bg-muted dark:bg-slate-800/60 border-border dark:border-slate-700 text-muted-foreground dark:text-slate-500'
                              : 'bg-background dark:bg-[#0f172a] border-border dark:border-slate-600 text-foreground dark:text-gray-300 hover:bg-muted dark:hover:border-slate-500'
                          }`}
                        >
                          PayPal
                        </button>
                        {!isPaypalConfigured && (
                          <button
                            type="button"
                            onClick={() => {
                              router.push('/dashboard/settings#payments-paypal')
                              setShowPaymentModal(false)
                            }}
                            className="absolute bottom-0 left-0 right-0 text-[10px] md:text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium text-center"
                          >
                            Configure →
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 md:p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 md:mb-3">
                        No payment methods have been configured yet.
                      </p>
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2 md:mb-3">
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
                  <label className="block text-sm font-medium text-foreground mb-1.5 md:mb-2">
                    Description
                  </label>
                  <textarea
                    value={paymentDescription}
                    onChange={(e) => setPaymentDescription(e.target.value)}
                    placeholder="Service payment"
                    rows={2}
                    disabled={isCreatingPayment}
                    className="w-full px-3 py-2 min-h-[76px] border border-border dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-background dark:bg-[#0f172a] text-foreground dark:text-white resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg">
                    <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
                  </div>
                )}
              </div>

              {/* Footer/Actions - shrink-0 */}
              <div className="flex gap-2.5 justify-end px-4 py-3 md:px-5 md:py-4 border-t border-border dark:border-slate-700 shrink-0 pb-safe bg-card dark:bg-[#1e293b]">
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
                  className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="bg-card dark:bg-[#1e293b] rounded-xl shadow-xl max-w-md w-full p-6 border border-border dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold text-foreground mb-2">Confirm Payment Received</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Confirm that you received this payment through {paymentToMarkPaid.payment_provider === 'paypal' ? 'PayPal' : 'Venmo'}.
              </p>
              <div className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-4 mb-4 border border-border dark:border-slate-700">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground text-sm">Amount</span>
                  <span className="text-foreground font-semibold">{formatCurrency(paymentToMarkPaid.amount_cents / 100)}</span>
                </div>
                {paymentToMarkPaid.description && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Description</span>
                    <span className="text-foreground text-sm">{paymentToMarkPaid.description}</span>
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
                  className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
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
          onRefreshAfterSuccess={async () => {
            // Run independent refreshes in parallel without reloading the app
            await Promise.allSettled([
              (async () => { try { await fetchPayments() } catch {} })(),
            ])
          }}
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

        {/* Edit Payment Modal */}
        <PaymentEditModal
          isOpen={showEditModal}
          onClose={handleCloseEditModal}
          onSave={handleSaveLabel}
          onViewCustomer={(customerId) => router.push(`/dashboard/leads/${customerId}`)}
          onCopyLink={copyPaymentLink}
          onCancelPayment={handleCancelPayment}
          isCancelling={isCancelling}
          payment={paymentToEdit}
          currentLabel={editLabel}
          methodBadge={paymentToEdit ? getPaymentMethodBadge(paymentToEdit.payment_method_type, paymentToEdit.payment_provider) : null}
        />
    </DashboardShell>
  )
}
