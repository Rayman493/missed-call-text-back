'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useBusiness } from '@/contexts/BusinessContext'
import { CreditCard, Copy, ExternalLink, User, X, AlertCircle, Info, ChevronDown, Filter, Edit, RefreshCw, Plus, Loader2 } from 'lucide-react'
import DashboardShell from '@/components/layout/DashboardShell'
import Toast, { ToastContainer } from '@/components/Toast'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'
import AppleTapToPayIcon from '@/components/icons/AppleTapToPayIcon'
import { createBrowserClient } from '@/lib/supabase/browser'
import { getEffectivePaymentStatusStyle, getDisputeStatusLabel, getDisputeStatusBadgeClass } from '@/lib/payment-status'
import { isPlaceholderValue } from '@/components/payments/customer-search-helpers'
import { getPaymentMethodBadge } from '@/lib/payment-method-badge'
import { deliverBillingPdf } from '@/lib/billing/download-billing-pdf'
import { billingCustomerDisplayName } from '@/lib/billing/billing-utils'
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
import PaymentsNewRequestModal from '@/components/payments/PaymentsNewRequestModal'
import PaymentActionBar from '@/components/payments/PaymentActionBar'
import { openStripeDashboardHandoff } from '@/lib/stripe-dashboard-handoff'
import Modal from '@/components/ui/Modal'
import BillingChooserModal from '@/components/billing/BillingChooserModal'
import BillingEditorModal, { BillingDocumentType, BillingDocumentData } from '@/components/billing/BillingEditorModal'
import BillingDocumentList, { BillingDocumentListItem } from '@/components/billing/BillingDocumentList'
import BillingViewerModal from '@/components/billing/BillingViewerModal'
import { suppressNextHistoryBackCleanup } from '@/lib/modalBackButton'
import { FileText } from 'lucide-react'

interface PaymentRequest {
  id: string
  amount_cents: number
  description: string
  status: string
  created_at: string
  paid_at: string | null
  failed_at: string | null
  cancelled_at: string | null
  checkout_url: string | null
  expires_at: string | null
  payment_provider: string | null
  payment_method_type: string | null
  stripe_connect_account_id: string | null
  refund_status: string | null
  refunded_amount_cents: number | null
  dispute_status: string | null
  dispute_reason: string | null
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

function getStatusColor(payment: { status: string; refund_status?: string | null }): string {
  const style = getEffectivePaymentStatusStyle(payment)
  return style.badgeClass
}


const getStatusLabel = (payment: { status: string; refund_status?: string | null }) => {
  const style = getEffectivePaymentStatusStyle(payment)
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
  const { business, role } = useBusiness()
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
  const [isCancelling, setIsCancelling] = useState(false)
  const [isMarkingPaid, setIsMarkingPaid] = useState(false)
  const [isMarkingUnpaid, setIsMarkingUnpaid] = useState(false)
  const [showMarkPaidConfirm, setShowMarkPaidConfirm] = useState(false)
  const [showMarkUnpaidConfirm, setShowMarkUnpaidConfirm] = useState(false)
  const [paymentToMarkUnpaid, setPaymentToMarkUnpaid] = useState<PaymentRequest | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [paymentToCancel, setPaymentToCancel] = useState<PaymentRequest | null>(null)
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

  // Quote / Invoice state
  const [showBillingChooser, setShowBillingChooser] = useState(false)
  const [billingEditorType, setBillingEditorType] = useState<BillingDocumentType>('quote')
  const [billingEditorDoc, setBillingEditorDoc] = useState<BillingDocumentData | null>(null)
  const [showBillingEditor, setShowBillingEditor] = useState(false)
  const [billingDocuments, setBillingDocuments] = useState<BillingDocumentListItem[]>([])
  const [billingLoading, setBillingLoading] = useState(false)
  const [billingDeletingId, setBillingDeletingId] = useState<string | null>(null)
  const [billingDownloadingId, setBillingDownloadingId] = useState<string | null>(null)
  const [billingSendingId, setBillingSendingId] = useState<string | null>(null)
  const [billingConvertingId, setBillingConvertingId] = useState<string | null>(null)
  const [billingSendTarget, setBillingSendTarget] = useState<BillingDocumentListItem | null>(null)
  const [billingSendError, setBillingSendError] = useState('')
  const [billingConvertTarget, setBillingConvertTarget] = useState<BillingDocumentListItem | null>(null)
  const [viewingBillingDoc, setViewingBillingDoc] = useState<BillingDocumentListItem | null>(null)
  // Modal-local feedback for PDF download results while the viewer is open —
  // the page-level success banner is behind the modal and invisible to the user.
  const [billingViewerFeedback, setBillingViewerFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [showBillingViewer, setShowBillingViewer] = useState(false)
  const [toasts, setToasts] = useState<{ id: string; message: string; type: 'success' | 'error' | 'warning' | 'info' }[]>([])

  // Payments page segmented view: "payments" or "billing"
  const [paymentsSegment, setPaymentsSegment] = useState<'payments' | 'billing'>('payments')
  // Billing document type filter within the Quotes & Invoices segment
  const [billingTypeFilter, setBillingTypeFilter] = useState<'all' | 'quote' | 'invoice'>('all')

  // Lock background scroll for the inline mark-paid confirmation overlay.
  // QuickTapToPayModal, TapToPaySetupModal and PaymentEditModal manage their own locks internally.
  // Note: the shared <Modal> used for the mark-paid confirm now owns its own
  // scroll lock + back-button handling, so we no longer need a separate
  // useBodyScrollLock or popstate listener here.

  // Check native support on mount
  useEffect(() => {
    setIsNativeSupported(isNativeCapacitor())
  }, [])

  // Note: the mark-paid confirm now uses the shared <Modal> component, which
  // owns its own Android Back / popstate handling via useModalBackButton.
  // The hand-built popstate + Capacitor backButton listener that used to live
  // here has been removed to avoid double history-state entries and double
  // back-button handling.

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

  // Filter billing documents by type within the Quotes & Invoices segment
  const filteredBillingDocuments = useMemo(() => {
    const linkedDocuments = billingDocuments.map((document) => {
      const derivedInvoice = document.document_type === 'quote'
        ? billingDocuments.find((candidate) => candidate.document_type === 'invoice' && candidate.source_quote_id === document.id)
        : null
      const sourceQuote = document.source_quote_id
        ? billingDocuments.find((candidate) => candidate.id === document.source_quote_id && candidate.document_type === 'quote')
        : null
      return {
        ...document,
        derived_invoice: derivedInvoice ? { id: derivedInvoice.id, document_number: derivedInvoice.document_number } : null,
        source_quote: sourceQuote ? { id: sourceQuote.id, document_number: sourceQuote.document_number } : null,
      }
    })
    if (billingTypeFilter === 'all') return linkedDocuments
    return linkedDocuments.filter((document) => document.document_type === billingTypeFilter)
  }, [billingDocuments, billingTypeFilter])

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
    fetchBillingDocuments()
  }, [])

  // Realtime: subscribe to billing_documents changes for the current business
  // so that accept/decline/paid status updates appear live without manual refresh.
  useEffect(() => {
    if (!business?.id) return
    const supabase = createBrowserClient()
    const channel = supabase
      .channel('billing-documents-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'billing_documents',
          filter: `business_id=eq.${business.id}`,
        },
        (payload: any) => {
          // Reconcile the changed row into local state by id.
          // For UPDATE: merge the changed fields into the existing row.
          // For INSERT: prepend the new row (fetch full data since the
          // realtime payload may not include joined leads data).
          // For DELETE: remove the row.
          const row = payload.new as any
          const oldRow = payload.old as any
          if (payload.eventType === 'DELETE') {
            const deletedId = oldRow?.id
            if (deletedId) {
              setBillingDocuments((prev) => prev.filter((d) => d.id !== deletedId))
            }
            return
          }
          // For INSERT or UPDATE, check if the row is already in local state.
          setBillingDocuments((prev) => {
            const existing = prev.find((d) => d.id === row.id)
            if (existing) {
              // Merge changed fields — preserve joined leads data
              return prev.map((d) => d.id === row.id ? {
                ...d,
                document_type: row.document_type ?? d.document_type,
                status: row.status ?? d.status,
                customer_id: row.customer_id !== undefined ? row.customer_id : d.customer_id,
                source_quote_id: row.source_quote_id !== undefined ? row.source_quote_id : d.source_quote_id,
                display_name: row.display_name !== undefined ? row.display_name : d.display_name,
                sent_at: row.sent_at ?? d.sent_at,
                public_token: row.public_token ?? d.public_token,
                payment_request_id: (row as any).payment_request_id ?? (d as any).payment_request_id,
                payment_request: (row as any).payment_request ?? (d as any).payment_request,
                updated_at: row.updated_at ?? d.updated_at,
                total_cents: row.total_cents ?? d.total_cents,
              } : d)
            }
            // New row — fetch full data (with leads join) in the background.
            // Don't block the realtime handler; just trigger a silent refetch.
            fetchBillingDocuments({ silent: true })
            return prev
          })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [business?.id])

  // Realtime: subscribe to payment_requests so that cancelling or paying a
  // linked payment request is reflected on the Quotes & Invoices cards without
  // an app restart.
  useEffect(() => {
    if (!business?.id) return
    const supabase = createBrowserClient()
    const channel = supabase
      .channel('payment-requests-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payment_requests',
          filter: `business_id=eq.${business.id}`,
        },
        (payload: any) => {
          // Payment requests may carry the payment status but not the joined
          // lead/job data needed by the Payments list. Use the realtime event
          // as an invalidation signal and refetch the canonical payment list.
          console.log('[Payments Page] payment_requests realtime event:', {
            eventType: payload.eventType,
            paymentRequestId: payload.new?.id,
            status: payload.new?.status
          })
          fetchPayments()
          fetchBillingDocuments({ silent: true })
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [business?.id])

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

  // App resume: refetch payments when the app returns to the foreground.
  // On Capacitor (native Android/iOS), the page stays mounted across app
  // suspend/resume, so the mount effect does NOT re-fire. Without this
  // listener, stale non-terminal Tap to Pay payments would not be reconciled
  // on resume. The /api/payments endpoint performs bounded reconciliation
  // of recent non-terminal Tap to Pay payments on each fetch.
  useEffect(() => {
    let appStateListener: { remove: () => void } | undefined
    let visibilityHandler: (() => void) | undefined

    const triggerRefetch = () => {
      console.log('[Payments Page] App resumed — refetching payments for bounded reconciliation')
      fetchPayments()
    }

    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        appStateListener = await App.addListener('appStateChange', ({ isActive }: { isActive: boolean }) => {
          if (isActive) triggerRefetch()
        })
      } catch {
        // Not on Capacitor (web) — fall back to visibilitychange
        if (typeof document !== 'undefined') {
          visibilityHandler = () => {
            if (document.visibilityState === 'visible') triggerRefetch()
          }
          document.addEventListener('visibilitychange', visibilityHandler)
        }
      }
    })()

    return () => {
      appStateListener?.remove?.()
      if (visibilityHandler) {
        document.removeEventListener('visibilitychange', visibilityHandler)
      }
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

  // ---- Quote / Invoice handlers ----
  // silent=true: background revalidation (realtime events, post-mutation
  // reconciliation). Skipping the loading flag keeps the existing list
  // mounted — the spinner branch would unmount every card and reset the
  // user's scroll position mid-list.
  const fetchBillingDocuments = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setBillingLoading(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch('/api/billing-documents', { headers })
      if (!res.ok) return
      const json = await res.json()
      setBillingDocuments(json.documents || [])
    } catch {
      // ignore
    } finally {
      if (!silent) setBillingLoading(false)
    }
  }

  const handleBillingChooserSelect = (type: BillingDocumentType) => {
    // Suppress the chooser's history.back() cleanup so it does not
    // trigger a popstate that would immediately close the editor.
    // This is deterministic (no setTimeout): the flag is consumed
    // synchronously during the chooser's useModalBackButton cleanup.
    suppressNextHistoryBackCleanup()
    setBillingEditorType(type)
    setBillingEditorDoc(null)
    setShowBillingChooser(false)
    setShowBillingEditor(true)
  }

  const handleOpenBillingDoc = async (doc: BillingDocumentListItem) => {
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/billing-documents/${doc.id}`, { headers })
      if (!res.ok) return
      const json = await res.json()
      const d = json.document
      setBillingEditorType(d.document_type)
      setBillingEditorDoc({
        id: d.id,
        document_type: d.document_type,
        status: d.status,
        document_number: d.document_number,
        // Persisted document name must round-trip into the editor — without
        // this, reopening a draft shows a blank name field and "loses" the
        // saved value.
        display_name: d.display_name ?? null,
        issue_date: d.issue_date,
        valid_until: d.valid_until,
        due_date: d.due_date,
        customer_id: d.customer_id,
        customer_name: billingCustomerDisplayName(d.leads),
        customer_phone: d.leads?.caller_phone || null,
        customer_email: null,
        notes: d.notes,
        terms: d.terms,
        discount_cents: d.discount_cents,
        tax_cents: d.tax_cents,
        line_items: (d.billing_document_items || []).map((item: any) => ({
          id: item.id,
          description: item.description || '',
          quantity: String(item.quantity),
          unit_label: item.unit_label || '',
          unit_price_cents: String(item.unit_price_cents),
        })),
      })
      setShowBillingEditor(true)
    } catch {
      // ignore
    }
  }

  const handleBillingSaved = (savedDoc?: BillingDocumentData) => {
    // Merge the saved document into local state by id — no full refetch,
    // no loading flash. If it's a new doc (not in the list), prepend it.
    if (savedDoc?.document_type) {
      const label = savedDoc.document_type === 'quote' ? 'Quote' : 'Invoice'
      const name = savedDoc.display_name?.trim()
      const identity = name || (savedDoc.document_number || 'draft')
      const quoted = name ? `“${identity}”` : identity
      showToast(savedDoc.status === 'sent'
        ? `${label} ${quoted} sent to customer.`
        : `${label} ${quoted} created — ready to review and send.`, 'success')
    }
    if (savedDoc?.id) {
      const savedId = savedDoc.id
      setBillingDocuments((prev) => {
        const existing = prev.find((d) => d.id === savedId)
        // The PATCH/POST response carries the canonical `leads` join for the
        // saved customer_id. Use it (including explicit null on customer
        // removal) — carrying over the old join leaves the card showing a
        // stale customer or "Unnamed customer" until a full refresh.
        const savedLeads = (savedDoc as any).leads
        const item: BillingDocumentListItem = {
          id: savedId,
          document_type: savedDoc.document_type,
          status: savedDoc.status,
          document_number: savedDoc.document_number,
          // Explicit undefined-check: a cleared name persists as null and must
          // clear on the card too — `??` would wrongly resurrect the old name.
          display_name: savedDoc.display_name !== undefined ? savedDoc.display_name : (existing?.display_name ?? null),
          issue_date: savedDoc.issue_date,
          valid_until: savedDoc.valid_until ?? null,
          due_date: savedDoc.due_date ?? null,
          total_cents: (savedDoc as any).total_cents ?? existing?.total_cents ?? 0,
          customer_id: savedDoc.customer_id ?? null,
          public_token: (savedDoc as any).public_token ?? existing?.public_token ?? null,
          source_quote_id: (savedDoc as any).source_quote_id ?? existing?.source_quote_id ?? null,
          payment_request_id: (savedDoc as any).payment_request_id ?? existing?.payment_request_id ?? null,
          payment_request: existing?.payment_request ?? null,
          leads: savedLeads !== undefined ? savedLeads : (existing?.leads ?? null),
          updated_at: new Date().toISOString(),
          sent_at: existing?.sent_at ?? null,
        }
        if (existing) {
          return prev.map((d) => d.id === savedId ? item : d)
        }
        return [item, ...prev]
      })
    }
    // Switch to the billing segment and matching type filter so the
    // newly created record is immediately visible.
    setPaymentsSegment('billing')
    if (savedDoc?.document_type === 'quote' && billingTypeFilter !== 'quote') {
      setBillingTypeFilter('quote')
    } else if (savedDoc?.document_type === 'invoice' && billingTypeFilter !== 'invoice') {
      setBillingTypeFilter('invoice')
    }
  }

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString()
    // Replace an identical live toast instead of stacking duplicates from
    // rapid repeated actions.
    setToasts(prev => [...prev.filter(t => !(t.message === message && t.type === type)), { id, message, type }])
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const handleDeleteBillingDoc = async (doc: BillingDocumentListItem) => {
    // Confirmation is handled by the BillingDocumentList's custom Modal.
    // Do NOT add a second browser-native confirm() here.
    setBillingDeletingId(doc.id)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/billing-documents/${doc.id}`, { method: 'DELETE', headers })
      if (res.ok) {
        setBillingDocuments((prev) => prev.filter((d) => d.id !== doc.id))
        const label = doc.document_type === 'quote' ? 'Quote' : 'Invoice'
        showToast(`${label} deleted.`, 'success')
      } else {
        const json = await res.json().catch(() => ({}))
        showToast(json.error || 'Failed to delete document. Please try again.', 'error')
      }
    } catch {
      showToast('Failed to delete document. Please try again.', 'error')
    } finally {
      setBillingDeletingId(null)
    }
  }

  const handleDownloadBillingDoc = async (doc: BillingDocumentListItem) => {
    // When the document viewer modal is open for this doc, route feedback into
    // the modal so the result is visible; otherwise use the page banner.
    const viewerOpenForDoc = viewingBillingDoc?.id === doc.id
    await deliverBillingPdf({
      documentId: doc.id,
      documentNumber: doc.document_number,
      documentType: doc.document_type === 'quote' ? 'quote' : 'invoice',
      onStart: () => {
        setBillingDownloadingId(doc.id)
        if (viewerOpenForDoc) setBillingViewerFeedback(null)
      },
      onSuccess: (message) => {
        if (viewerOpenForDoc) setBillingViewerFeedback({ type: 'success', message })
        else showToast(message, 'success')
      },
      onError: (message) => {
        if (viewerOpenForDoc) setBillingViewerFeedback({ type: 'error', message })
        else showToast(message, 'error')
      },
      onFinally: () => setBillingDownloadingId(null),
    })
  }

  const handleSendBillingDoc = async (doc: BillingDocumentListItem) => {
    setBillingSendingId(doc.id)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/billing-documents/${doc.id}/send`, { method: 'POST', headers })
      if (res.ok) {
        // Merge the returned document into local state by id — no full refetch,
        // no loading flash, no scroll jump.
        const json = await res.json()
        const updated = json.document
        if (updated) {
          setBillingDocuments((prev) => prev.map((d) => d.id === updated.id ? {
            ...d,
            status: updated.status,
            sent_at: updated.sent_at,
            public_token: updated.public_token,
            payment_request_id: updated.payment_request_id,
          } : d))
        }
        const customerName = billingCustomerDisplayName(doc.leads) || doc.display_name || 'customer'
        const label = doc.document_type === 'quote' ? 'Quote' : 'Invoice'
        showToast(doc.sent_at ? `${label} resent to ${customerName}.` : `${label} sent to ${customerName}.`, 'success')
      } else {
        const json = await res.json().catch(() => ({}))
        showToast(json.error || 'Failed to send document. Please try again.', 'error')
      }
    } catch {
      showToast('Failed to send document. Please try again.', 'error')
    } finally {
      setBillingSendingId(null)
    }
  }

  // Returns the created/existing invoice list item on success, null on failure.
  // The RPC (convert_quote_to_invoice) is idempotent — re-converting returns the
  // existing invoice, so callers can safely open the result either way.
  const handleConvertBillingDoc = async (doc: BillingDocumentListItem): Promise<BillingDocumentListItem | null> => {
    // Re-entry guard: rapid/double taps must not fire a second conversion.
    if (billingConvertingId) return null
    setBillingConvertingId(doc.id)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
      const res = await fetch(`/api/billing-documents/${doc.id}/convert`, { method: 'POST', headers })
      if (res.ok) {
        const json = await res.json()
        const newInvoice = json.document
        if (!newInvoice) return null
        const invoiceItem: BillingDocumentListItem = {
          id: newInvoice.id,
          document_type: 'invoice',
          status: newInvoice.status || 'draft',
          document_number: newInvoice.document_number,
          display_name: newInvoice.display_name || null,
          issue_date: newInvoice.issue_date,
          valid_until: newInvoice.valid_until,
          due_date: newInvoice.due_date,
          total_cents: newInvoice.total_cents,
          customer_id: newInvoice.customer_id,
          public_token: newInvoice.public_token,
          source_quote_id: newInvoice.source_quote_id,
          payment_request_id: newInvoice.payment_request_id ?? null,
          payment_request: newInvoice.payment_request ?? null,
          leads: newInvoice.leads,
          updated_at: newInvoice.updated_at,
          sent_at: newInvoice.sent_at,
        }
        let isNewlyCreated = false
        setBillingDocuments((prev) => {
          const existing = prev.some((document) => document.id === invoiceItem.id)
          isNewlyCreated = !existing
          return existing
            ? prev.map((document) => document.id === invoiceItem.id ? { ...document, ...invoiceItem } : document)
            : [invoiceItem, ...prev]
        })
        if (isNewlyCreated) {
          showToast(`Invoice ${newInvoice.document_number || ''} created`.trim(), 'success')
        }
        return invoiceItem
      } else {
        let errorMessage = 'Failed to create invoice'
        try {
          const errorJson = await res.json()
          if (errorJson?.message || errorJson?.error) {
            errorMessage = errorJson.message || errorJson.error
          }
        } catch {
          // response body was not JSON; keep fallback
        }
        showToast(errorMessage, 'error')
        return null
      }
    } catch (err) {
      const fallback = err instanceof Error ? err.message : 'Failed to create invoice'
      showToast(fallback, 'error')
      return null
    } finally {
      setBillingConvertingId(null)
    }
  }

  const handleViewBillingDoc = (doc: BillingDocumentListItem) => {
    setViewingBillingDoc(doc)
    setBillingViewerFeedback(null)
    setShowBillingViewer(true)
  }

  const handleLeadSelected = (prefill: JobPrefill) => {
    // Modal→modal handoff: the picker's useModalBackButton cleanup would
    // call history.back() because no modal is registered yet at that moment;
    // the resulting popstate would then close the incoming payment modal.
    // Suppression makes the transition deterministic (same pattern as the
    // quote/invoice chooser→editor handoff).
    suppressNextHistoryBackCleanup()
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
        // Canonical saved name wins over historical AI intake names
        customer_name: lead.contact_name || lead.name || intake.customerName || undefined,
        customer_phone: intake.customerPhone || lead.caller_phone || undefined,
        service_address: intake.serviceAddress || undefined,
        title: getLeadRequestTitle(lead) || intake.serviceRequested || undefined,
        notes: noteParts.length > 0 ? noteParts.join('\n\n') : undefined,
        lead_id: lead.id,
        conversation_id: conversationId || undefined,
      }
      suppressNextHistoryBackCleanup()
      setPaymentPrefill(prefill)
      setIsAddCustomerModalOpen(false)
      setIsLeadPickerOpen(false)
      setShowPaymentModal(true)
    } catch (error) {
      console.error('Error loading lead details after creation:', error)
      showToast('Failed to load customer details. Please try again.', 'error')
    }
  }

  const handleCreatePayment = async (values?: {
    amount: string
    description: string
    paymentProvider: 'stripe' | 'venmo' | 'paypal'
  }) => {
    // Use submitted values if provided, otherwise fall back to state (for other callers)
    const amount = values?.amount ?? paymentAmount
    const description = values?.description ?? paymentDescription
    const provider = values?.paymentProvider ?? paymentProvider

    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'error')
      return
    }

    if (!paymentPrefill?.lead_id) {
      showToast('Please select a customer', 'error')
      return
    }

    // Client-side validation for payment method configuration
    if (provider === 'venmo' && !business?.venmo_username) {
      showToast('Venmo hasn\'t been connected yet. Connect Venmo in Settings → Payments before sending Venmo payment requests.', 'error')
      return
    }

    if (provider === 'paypal' && !business?.paypal_payment_link) {
      showToast('PayPal hasn\'t been connected yet. Connect PayPal in Settings → Payments before sending PayPal payment requests.', 'error')
      return
    }

    if (provider === 'stripe' && (!business?.stripe_connect_account_id || business.stripe_connect_status !== 'connected' || !business.stripe_charges_enabled)) {
      showToast('Stripe hasn\'t been connected yet. Connect Stripe in Settings → Payments before sending Stripe payment requests.', 'error')
      return
    }

    setIsCreatingPayment(true)
    setError('')

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
        amount_cents: Math.round(parseFloat(amount) * 100),
        description: description || undefined,
        payment_provider: provider,
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
      showToast('Payment request sent', 'success')

      // Track payment requested event
      if (business?.id) {
        analyticsService.track('payment_requested', {
          amount: amount ? parseFloat(amount) : undefined,
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
      showToast(err instanceof Error ? err.message : 'Failed to create payment request', 'error')
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
    // display_name is the human-facing payment title (shown in the card header),
    // NOT the description. The description is the original payment note and
    // remains secondary supporting text. Do not conflate the two.
    // AI-intake placeholders (e.g. "Not collected") can be persisted as the
    // description when the intake summary is used as the prefill — they are
    // generated fallback text, not a genuine note, so they are suppressed.
    if (isPlaceholderValue(payment.description)) return null
    return payment.description
  }

  // Card title: prefer the operator-set display_name (Payment Name), then the
  // customer name, then a generic fallback. This keeps the Payment Name
  // semantically separate from the Description shown in the body.
  const getPaymentTitle = (payment: PaymentRequest) => {
    if (payment.display_name) {
      return payment.display_name
    }
    return getCustomerName(payment)
  }

  const copyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      showToast('Payment link copied.', 'success')
    } catch (err) {
      console.error('Failed to copy link:', err)
      showToast('Couldn\'t copy the link. Please try again.', 'error')
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

      // Confirmed cancellation: close the confirm dialog AND the parent edit
      // modal, refresh the list, and confirm in the current viewport.
      setShowCancelConfirm(false)
      setPaymentToCancel(null)
      handleCloseEditModal()
      showToast('Payment request cancelled.', 'success')

      // Refresh payments (silent refetch — no loading flash, no scroll jump)
      await fetchPayments()
    } catch (err) {
      console.error('Error canceling payment request:', err)
      // Modals stay open so the user can retry; surface the real error in-view.
      showToast(err instanceof Error ? err.message : 'Failed to cancel payment request', 'error')
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

      showToast('Payment marked as paid', 'success')

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
      showToast(err instanceof Error ? err.message : 'Failed to mark payment as paid', 'error')
    } finally {
      setIsMarkingPaid(false)
    }
  }

  const canManuallyReversePaid = (payment: PaymentRequest): boolean => {
    // Only PayPal/Venmo payments that were manually confirmed are eligible.
    // Stripe/card-present processor-confirmed payments are not reversible here.
    return payment.status === 'paid' &&
      (payment.payment_provider === 'paypal' || payment.payment_provider === 'venmo') &&
      payment.payment_method_type !== 'card_present'
  }

  const handleMarkUnpaid = async (payment: PaymentRequest) => {
    setIsMarkingUnpaid(true)
    setError('')
    setShowMarkUnpaidConfirm(false)
    setPaymentToMarkUnpaid(null)

    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/payments/${payment.id}/mark-unpaid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to mark payment as unpaid')
      }

      showToast('Payment marked as unpaid', 'success')
      await fetchPayments()
    } catch (err) {
      console.error('Error marking payment as unpaid:', err)
      showToast(err instanceof Error ? err.message : 'Failed to mark payment as unpaid', 'error')
    } finally {
      setIsMarkingUnpaid(false)
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

  // Opens the business's Stripe Express Dashboard scoped to this payment.
  // Refunds/disputes are managed entirely in Stripe — never through ReplyFlow.
  const handleManageInStripe = async (payment: PaymentRequest) => {
    if (!business?.id || !payment.stripe_connect_account_id) return
    const result = await openStripeDashboardHandoff({
      businessId: business.id,
      paymentRequestId: payment.id,
    })
    if (!result.ok) {
      showToast(result.error || 'Couldn\'t open Stripe right now. Please try again.', 'error')
    }
  }

  // Same handoff, unscoped — business-level dashboard link (fee notice).
  const handleManageStripeDashboard = async () => {
    if (!business?.id) return
    const result = await openStripeDashboardHandoff({ businessId: business.id })
    if (!result.ok) {
      showToast(result.error || 'Couldn\'t open Stripe right now. Please try again.', 'error')
    }
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

      showToast('Payment label updated', 'success')
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

      showToast('Payment status updated', 'success')

      // Refresh payments to show updated status
      await fetchPayments()
    } catch (err) {
      console.error('Error checking payment status:', err)
      showToast(err instanceof Error ? err.message : 'Failed to check payment status', 'error')
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

        {/* Error Banner - renders when error is set (page-load failures only;
            action feedback goes through the viewport-anchored toast system) */}
        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-4 py-2 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1 text-sm text-red-900 dark:text-red-100">{error}</div>
            <button
              onClick={() => setError('')}
              className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Focus - Unified Intelligence for Payments */}
        <FocusSection business={business} view="payments" title="Collection Priorities" compact />

        {/* Action Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5">
          {/* Quote / Invoice Card */}
          <button
            onClick={() => setShowBillingChooser(true)}
            className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.01] active:scale-[0.995] min-h-[120px]
            bg-violet-900 dark:bg-violet-800 border-violet-950 dark:border-violet-900 hover:bg-violet-950 dark:hover:bg-violet-900 shadow-[0_6px_18px_rgba(0,0,0,0.22)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.45)]"
          >
            <div className="flex items-center gap-3.5 mb-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 dark:bg-white/10 ring-1 ring-inset ring-white/30 dark:ring-white/20 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white dark:text-white" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm sm:text-base leading-tight">Quote / Invoice</h3>
                <p className="text-white/80 text-xs">Create a document</p>
              </div>
            </div>
            <p className="text-white/90 text-xs sm:text-sm">Create a professional quote or invoice for your customer</p>
          </button>

          {/* Request Payment Card */}
          <button
            onClick={handleStartPaymentRequest}
            className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.01] active:scale-[0.995] min-h-[120px]
            bg-blue-600 dark:bg-blue-500 border-blue-700 dark:border-blue-600 hover:bg-blue-700 dark:hover:bg-blue-600 shadow-[0_6px_18px_rgba(0,0,0,0.15)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center gap-3.5 mb-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/20 dark:bg-white/10 ring-1 ring-inset ring-white/30 dark:ring-white/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-white dark:text-white" />
              </div>
              <div>
                <h3 className="text-white dark:text-white font-semibold text-sm sm:text-base leading-tight">Request Payment</h3>
                <p className="text-blue-100 dark:text-blue-100 text-xs">Send payment link</p>
              </div>
            </div>
            <p className="text-blue-50 dark:text-blue-50 text-xs sm:text-sm">Send a payment request via SMS to your customer</p>
          </button>

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
                  className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.995] min-h-[120px]
                  bg-emerald-700 dark:bg-emerald-600 border-emerald-800 dark:border-emerald-700 hover:bg-emerald-800 dark:hover:bg-emerald-700 shadow-[0_6px_18px_rgba(0,0,0,0.15)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.35)]"
                >
                  <div className="flex items-center gap-3.5 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-white/20 dark:bg-white/10 ring-1 ring-inset ring-white/30 dark:ring-white/20 flex items-center justify-center">
                      <AppleTapToPayIcon size={20} color="#ffffff" className="text-white dark:text-white" />
                    </div>
                    <div>
                      <h3 className="text-white dark:text-white font-semibold text-sm sm:text-base leading-tight">Tap to Pay</h3>
                      <p className="text-emerald-100 dark:text-emerald-100 text-xs">Collect in-person</p>
                    </div>
                  </div>
                  <p className="text-emerald-50 dark:text-emerald-50 text-xs sm:text-sm">Accept contactless payments now with your phone</p>
                </button>
              )
            }

            // State 3: Stripe ready + device unsupported (web)
            if (!isNativeSupported && isStripeReady) {
              return (
                <div className="rounded-2xl p-4 sm:p-5 border border-slate-200/60 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.18)] min-h-[120px]">
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
                  className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.995] min-h-[120px]
                  bg-green-50 dark:bg-green-800/60 border-green-200/50 dark:border-green-700/60 hover:border-green-300 dark:hover:border-green-600/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
                >
                  <div className="flex items-center gap-3.5 mb-2.5">
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 dark:bg-green-500/25 border border-green-200/50 dark:border-green-700/50 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <h3 className="text-foreground dark:text-white font-semibold text-sm sm:text-base leading-tight">Tap to Pay</h3>
                      <p className="text-green-800 dark:text-green-300/90 text-xs">Finish setup</p>
                    </div>
                  </div>
                  <p className="text-green-950/90 dark:text-green-200/80 text-xs sm:text-sm">Complete Stripe setup to accept contactless payments</p>
                </button>
              )
            }

            // State 1: Stripe not connected
            return (
              <button
                onClick={() => setShowTapToPaySetup(true)}
                className="relative overflow-hidden rounded-2xl p-4 sm:p-5 text-left border transition-all duration-150 ease-out hover:scale-[1.015] active:scale-[0.995] min-h-[120px]
                bg-green-50 dark:bg-green-900/40 border-green-200/50 dark:border-green-800/50 hover:border-green-300 dark:hover:border-green-700/50 shadow-[0_6px_18px_rgba(0,0,0,0.08)] dark:shadow-[0_6px_18px_rgba(0,0,0,0.25)]"
              >
                <div className="flex items-center gap-3.5 mb-2.5">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 dark:bg-green-500/15 border border-green-200/50 dark:border-green-800/50 flex items-center justify-center">
                    <AppleTapToPayIcon size={20} className="text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-foreground dark:text-white font-semibold text-sm sm:text-base leading-tight">Tap to Pay</h3>
                    <p className="text-green-800 dark:text-green-300/90 text-xs">Setup required</p>
                  </div>
                </div>
                <p className="text-green-950/90 dark:text-green-200/80 text-xs sm:text-sm">Accept contactless payments directly from your phone</p>
              </button>
            )
          })()}
        </div>

        {/* Stripe processing fee notice — shown only when Stripe is set up;
            never for purely manual/non-Stripe payment setups */}
        {business?.stripe_connect_account_id && (
          <p className="text-xs text-muted-foreground mt-3">
            Stripe charges processing fees on applicable payments. Fees vary by payment method and account.{' '}
            {role === 'owner' ? (
              <button
                type="button"
                onClick={() => handleManageStripeDashboard()}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                View your exact fees and net earnings in your Stripe Dashboard.
              </button>
            ) : (
              'View your exact fees and net earnings in your Stripe Dashboard.'
            )}
          </p>
        )}

        {/* Segment control: Payments | Quotes & Invoices */}
        <div className="flex items-center gap-1 mt-4 mb-4 p-1 bg-muted/50 dark:bg-slate-800/50 rounded-lg w-fit max-w-full">
          <button
            onClick={() => setPaymentsSegment('payments')}
            className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              paymentsSegment === 'payments'
                ? 'bg-card dark:bg-slate-700 text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Payments
          </button>
          <button
            onClick={() => setPaymentsSegment('billing')}
            className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
              paymentsSegment === 'billing'
                ? 'bg-card dark:bg-slate-700 text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Quotes & Invoices
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
          </div>
        ) : (
          <>
            {/* ===== Payments Segment ===== */}
            {paymentsSegment === 'payments' && (
            <>
            {/* Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5 mb-5">
              <div className="rounded-xl p-3 sm:p-3.5 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
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

              <div className="rounded-xl p-3 sm:p-3.5 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
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

              <div className="rounded-xl p-3 sm:p-3.5 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
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

              <div className="rounded-xl p-3 sm:p-3.5 border border-border/70 bg-card shadow-sm dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)]">
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
            <div className="flex items-center justify-between mb-4">
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
                    {visiblePayments.map((payment) => {
                      const isFinalStatus = ['paid', 'failed', 'cancelled'].includes(payment.status)
                      // Use canonical final-state timestamps only — never fall back to created_at
                      // created_at represents request creation, not a state transition
                      const finalTimestamp =
                        payment.status === 'paid' ? payment.paid_at :
                        payment.status === 'failed' ? payment.failed_at :
                        payment.status === 'cancelled' ? payment.cancelled_at :
                        null
                      const canEdit = ['pending', 'paid', 'failed', 'cancelled'].includes(payment.status)
                      return (
                      <div key={payment.id} className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-3 border border-border dark:border-slate-700 flex flex-col">
                        {/* Header: Payment + Tap to Pay badge + Status badge */}
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <CreditCard className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="text-foreground font-medium text-sm truncate">
                              {getPaymentTitle(payment)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment)}`}>
                              {getStatusLabel(payment)}
                            </span>
                            {payment.dispute_status && getDisputeStatusLabel(payment.dispute_status) && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getDisputeStatusBadgeClass(payment.dispute_status)}`}>
                                {getDisputeStatusLabel(payment.dispute_status)}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Body */}
                        <div className="space-y-1.5 text-xs flex-1">
                          {payment.leads && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Phone</span>
                              <span className="text-foreground">{formatPhoneNumber(payment.leads.caller_phone)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Amount</span>
                            <span className="text-foreground font-semibold">{formatCurrency(payment.amount_cents, true)}</span>
                          </div>
                          {getPaymentDescription(payment) && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Description</span>
                              <span className="text-foreground truncate max-w-[150px]">{getPaymentDescription(payment)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Requested</span>
                            <span className="text-foreground">{new Date(payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                          {/* Canonical final-status row: only render with a real timestamp */}
                          {isFinalStatus && finalTimestamp && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{getStatusLabel(payment)}</span>
                              <span className="text-foreground">{new Date(finalTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            </div>
                          )}
                          {/* Reserve structural row space when no final timestamp exists */}
                          {isFinalStatus && !finalTimestamp && (
                            <div className="flex justify-between min-h-[1.25rem]">
                              <span className="text-muted-foreground">{getStatusLabel(payment)}</span>
                              <span>&nbsp;</span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="w-full mt-2.5 pt-2.5 border-t border-slate-700 min-h-[3rem]">
                          <PaymentActionBar
                            payment={payment}
                            canEdit={canEdit}
                            isCancelling={isCancelling}
                            isMarkingPaid={isMarkingPaid}
                            isMarkingUnpaid={isMarkingUnpaid}
                            isReconciling={isReconciling}
                            onEdit={() => handleOpenEditModal(payment)}
                            onCopyLink={() => copyPaymentLink(payment.checkout_url!)}
                            onMarkPaid={() => {
                              setPaymentToMarkPaid(payment)
                              setShowMarkPaidConfirm(true)
                            }}
                            onMarkUnpaid={() => {
                              setPaymentToMarkUnpaid(payment)
                              setShowMarkUnpaidConfirm(true)
                            }}
                            onCheckStatus={() => handleCheckStatus(payment)}
                            onCancel={() => {
                              setPaymentToCancel(payment)
                              setShowCancelConfirm(true)
                            }}
                            onManageInStripe={() => handleManageInStripe(payment)}
                          />
                        </div>
                      </div>
                      )
                    })}

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
                                      {getPaymentTitle(payment)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment)}`}>
                                      {getStatusLabel(payment)}
                                    </span>
                                    {payment.dispute_status && getDisputeStatusLabel(payment.dispute_status) && (
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getDisputeStatusBadgeClass(payment.dispute_status)}`}>
                                        {getDisputeStatusLabel(payment.dispute_status)}
                                      </span>
                                    )}
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
                                    <span className="text-foreground font-semibold">{formatCurrency(payment.amount_cents, true)}</span>
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
                                <div className="w-full mt-2.5 pt-2.5 border-t border-slate-700 min-h-[3rem]">
                                  <PaymentActionBar
                                    payment={payment}
                                    canEdit={['pending', 'paid', 'failed', 'cancelled'].includes(payment.status)}
                                    isCancelling={isCancelling}
                                    isMarkingPaid={isMarkingPaid}
                                    isMarkingUnpaid={isMarkingUnpaid}
                                    isReconciling={isReconciling}
                                    onEdit={() => handleOpenEditModal(payment)}
                                    onCopyLink={() => copyPaymentLink(payment.checkout_url!)}
                                    onMarkPaid={() => {
                                      setPaymentToMarkPaid(payment)
                                      setShowMarkPaidConfirm(true)
                                    }}
                                    onMarkUnpaid={() => {
                                      setPaymentToMarkUnpaid(payment)
                                      setShowMarkUnpaidConfirm(true)
                                    }}
                                    onCheckStatus={() => handleCheckStatus(payment)}
                                    onCancel={() => {
                                      setPaymentToCancel(payment)
                                      setShowCancelConfirm(true)
                                    }}
                                    onManageInStripe={() => handleManageInStripe(payment)}
                                  />
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
                          <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2235] transition-colors cursor-pointer" onClick={() => handleOpenEditModal(payment)}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                <span className="text-foreground font-medium text-sm">
                                  {getPaymentTitle(payment)}
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
                              {formatCurrency(payment.amount_cents, true)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment)}`}>
                                {getStatusLabel(payment)}
                              </span>
                              {payment.dispute_status && getDisputeStatusLabel(payment.dispute_status) && (
                                <span className={`ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getDisputeStatusBadgeClass(payment.dispute_status)}`}>
                                  {getDisputeStatusLabel(payment.dispute_status)}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                              {new Date(payment.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                              {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center w-full" onClick={(e) => e.stopPropagation()}>
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
                                  {canManuallyReversePaid(payment) && (
                                    <button
                                      onClick={() => {
                                        setPaymentToMarkUnpaid(payment)
                                        setShowMarkUnpaidConfirm(true)
                                      }}
                                      disabled={isMarkingUnpaid}
                                      className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 text-xs font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                      aria-label="Mark as unpaid"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Mark Unpaid
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
                                    onClick={() => {
                                      setPaymentToCancel(payment)
                                      setShowCancelConfirm(true)
                                    }}
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
                              <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-[#1a2235] transition-colors cursor-pointer" onClick={() => handleOpenEditModal(payment)}>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-foreground font-medium text-sm">
                                      {getPaymentTitle(payment)}
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
                                  {formatCurrency(payment.amount_cents, true)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(payment)}`}>
                                    {getStatusLabel(payment)}
                                  </span>
                                  {payment.dispute_status && getDisputeStatusLabel(payment.dispute_status) && (
                                    <span className={`ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getDisputeStatusBadgeClass(payment.dispute_status)}`}>
                                      {getDisputeStatusLabel(payment.dispute_status)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                                  {new Date(payment.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                                  {payment.paid_at ? new Date(payment.paid_at).toLocaleDateString() : '-'}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="flex items-center w-full" onClick={(e) => e.stopPropagation()}>
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
                                      {canManuallyReversePaid(payment) && (
                                        <button
                                          onClick={() => {
                                            setPaymentToMarkUnpaid(payment)
                                            setShowMarkUnpaidConfirm(true)
                                          }}
                                          disabled={isMarkingUnpaid}
                                          className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 text-xs font-medium transition-colors disabled:opacity-50 disabled:hover:bg-transparent focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                                          aria-label="Mark as unpaid"
                                        >
                                          <RefreshCw className="h-3.5 w-3.5" />
                                          Mark Unpaid
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
                                        onClick={() => {
                                          setPaymentToCancel(payment)
                                          setShowCancelConfirm(true)
                                        }}
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
        </> /* end Payments segment */
        )}

        {/* ===== Quotes & Invoices Segment ===== */}
        {paymentsSegment === 'billing' && (
        <div className="mt-2">
          {/* Billing type filter (left) + create button (far right) */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-1 p-1 bg-muted/50 dark:bg-slate-800/50 rounded-lg w-fit max-w-full">
              <button
                onClick={() => setBillingTypeFilter('all')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  billingTypeFilter === 'all'
                    ? 'bg-card dark:bg-slate-700 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setBillingTypeFilter('quote')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  billingTypeFilter === 'quote'
                    ? 'bg-card dark:bg-slate-700 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Quotes
              </button>
              <button
                onClick={() => setBillingTypeFilter('invoice')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  billingTypeFilter === 'invoice'
                    ? 'bg-card dark:bg-slate-700 text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Invoices
              </button>
            </div>
            <button
              onClick={() => setShowBillingChooser(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white transition-colors shadow-sm flex-shrink-0"
              aria-label="Create Quote or Invoice"
              title="Create Quote or Invoice"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <BillingDocumentList
            documents={filteredBillingDocuments}
            loading={billingLoading}
            onOpen={handleOpenBillingDoc}
            onDelete={handleDeleteBillingDoc}
            onDownload={handleDownloadBillingDoc}
            onSend={setBillingSendTarget}
            onConvert={setBillingConvertTarget}
            onView={handleViewBillingDoc}
            onViewRelated={(documentId) => {
              const related = billingDocuments.find((document) => document.id === documentId)
              if (related) handleViewBillingDoc(related)
            }}
            deletingId={billingDeletingId}
            downloadingId={billingDownloadingId}
            sendingId={billingSendingId}
            convertingId={billingConvertingId}
            billingTypeFilter={billingTypeFilter}
            onCreate={() => setShowBillingChooser(true)}
          />
        </div>
        )}

        {/* New Payment Request Modal */}
        {business && (
          <PaymentsNewRequestModal
            isOpen={showPaymentModal}
            onClose={() => {
              setShowPaymentModal(false)
              setPaymentPrefill(undefined)
              setPaymentAmount('')
              setPaymentDescription('')
              setPaymentProvider('stripe')
              setError('')
            }}
            business={business}
            paymentPrefill={paymentPrefill}
            onSubmit={async ({ amount, description, paymentProvider: provider }) => {
              // Update parent state for UI consistency
              setPaymentAmount(amount)
              setPaymentDescription(description)
              setPaymentProvider(provider)
              // Call handleCreatePayment with submitted values directly (no stale state)
              await handleCreatePayment({ amount, description, paymentProvider: provider })
            }}
            onChangeCustomer={() => {
              suppressNextHistoryBackCleanup()
              setShowPaymentModal(false)
              setIsLeadPickerOpen(true)
            }}
          />
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
        <Modal
          isOpen={showMarkPaidConfirm && !!paymentToMarkPaid}
          onClose={() => {
            setShowMarkPaidConfirm(false)
            setPaymentToMarkPaid(null)
          }}
          title="Confirm Payment Received"
          footer={
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
                onClick={() => paymentToMarkPaid && handleMarkPaid(paymentToMarkPaid)}
                disabled={isMarkingPaid}
                className="px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isMarkingPaid ? 'Marking...' : 'Confirm Payment Received'}
              </button>
            </div>
          }
        >
              <p className="text-muted-foreground text-sm mb-4">
                Confirm that you received this payment through {paymentToMarkPaid?.payment_provider === 'paypal' ? 'PayPal' : 'Venmo'}.
              </p>
              <div className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-4 mb-4 border border-border dark:border-slate-700">
                <div className="flex justify-between mb-2">
                  <span className="text-muted-foreground text-sm">Amount</span>
                  <span className="text-foreground font-semibold">{paymentToMarkPaid ? formatCurrency(paymentToMarkPaid.amount_cents, true) : ''}</span>
                </div>
                {paymentToMarkPaid && getPaymentDescription(paymentToMarkPaid) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground text-sm">Description</span>
                    <span className="text-foreground text-sm">{getPaymentDescription(paymentToMarkPaid)}</span>
                  </div>
                )}
              </div>
        </Modal>

        {/* Cancel Payment Confirmation Modal */}
        <Modal
          isOpen={showCancelConfirm && !!paymentToCancel}
          onClose={() => {
            suppressNextHistoryBackCleanup()
            setShowCancelConfirm(false)
            setPaymentToCancel(null)
          }}
          title="Cancel this payment request?"
          footer={
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  suppressNextHistoryBackCleanup()
                  setShowCancelConfirm(false)
                  setPaymentToCancel(null)
                }}
                disabled={isCancelling}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Keep Payment
              </button>
              <button
                onClick={() => paymentToCancel && handleCancelPayment(paymentToCancel)}
                disabled={isCancelling}
                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Payment'}
              </button>
            </div>
          }
        >
          <p className="text-muted-foreground text-sm mb-4">
            The existing payment link will no longer be active.
          </p>
          {paymentToCancel && (
            <div className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-4 border border-border dark:border-slate-700">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground text-sm">Amount</span>
                <span className="text-foreground font-semibold">{formatCurrency(paymentToCancel.amount_cents, true)}</span>
              </div>
              {getPaymentDescription(paymentToCancel) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Description</span>
                  <span className="text-foreground text-sm">{getPaymentDescription(paymentToCancel)}</span>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* Mark as Unpaid Confirmation Modal */}
        <Modal
          isOpen={showMarkUnpaidConfirm && !!paymentToMarkUnpaid}
          onClose={() => {
            setShowMarkUnpaidConfirm(false)
            setPaymentToMarkUnpaid(null)
          }}
          title="Mark payment as unpaid?"
          footer={
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowMarkUnpaidConfirm(false)
                  setPaymentToMarkUnpaid(null)
                }}
                disabled={isMarkingUnpaid}
                className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted dark:text-gray-300 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
              >
                Keep Paid
              </button>
              <button
                onClick={() => paymentToMarkUnpaid && handleMarkUnpaid(paymentToMarkUnpaid)}
                disabled={isMarkingUnpaid}
                className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isMarkingUnpaid ? 'Updating...' : 'Mark Unpaid'}
              </button>
            </div>
          }
        >
          <p className="text-muted-foreground text-sm mb-4">
            This will revert the payment to Pending. Only manually confirmed PayPal or Venmo payments can be reversed.
          </p>
          {paymentToMarkUnpaid && (
            <div className="bg-muted/50 dark:bg-[#0f172a] rounded-lg p-4 border border-border dark:border-slate-700">
              <div className="flex justify-between mb-2">
                <span className="text-muted-foreground text-sm">Amount</span>
                <span className="text-foreground font-semibold">{formatCurrency(paymentToMarkUnpaid.amount_cents, true)}</span>
              </div>
              {getPaymentDescription(paymentToMarkUnpaid) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Description</span>
                  <span className="text-foreground text-sm">{getPaymentDescription(paymentToMarkUnpaid)}</span>
                </div>
              )}
            </div>
          )}
        </Modal>

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
          onCancelPayment={(payment) => {
            setPaymentToCancel(payment)
            setShowCancelConfirm(true)
          }}
          isCancelling={isCancelling}
          payment={paymentToEdit}
          onManageInStripe={paymentToEdit ? () => handleManageInStripe(paymentToEdit) : undefined}
          currentLabel={editLabel}
          methodBadge={paymentToEdit ? getPaymentMethodBadge(paymentToEdit.payment_method_type, paymentToEdit.payment_provider) : null}
        />

        {/* Quote / Invoice Chooser Modal */}
        <BillingChooserModal
          isOpen={showBillingChooser}
          onClose={() => setShowBillingChooser(false)}
          onSelectType={handleBillingChooserSelect}
        />

        {/* Quote / Invoice Editor Modal */}
        <BillingEditorModal
          isOpen={showBillingEditor}
          onClose={() => {
            setShowBillingEditor(false)
            setBillingEditorDoc(null)
          }}
          documentType={billingEditorType}
          existingDocument={billingEditorDoc}
          onSaved={handleBillingSaved}
        />

        {/* Quote / Invoice Viewer Modal */}
        <BillingViewerModal
          isOpen={showBillingViewer}
          onClose={() => {
            setShowBillingViewer(false)
            setViewingBillingDoc(null)
            setBillingViewerFeedback(null)
          }}
          documentId={viewingBillingDoc?.id || null}
          downloadFeedback={billingViewerFeedback}
          onDownload={() => viewingBillingDoc && handleDownloadBillingDoc(viewingBillingDoc)}
          onSend={() => viewingBillingDoc && setBillingSendTarget(viewingBillingDoc)}
          onEdit={() => {
            if (viewingBillingDoc) {
              setShowBillingViewer(false)
              handleOpenBillingDoc(viewingBillingDoc)
            }
          }}
          onConvert={() => viewingBillingDoc && setBillingConvertTarget(viewingBillingDoc)}
          isSending={billingSendingId === viewingBillingDoc?.id}
          isDownloading={billingDownloadingId === viewingBillingDoc?.id}
        />

        <Modal
          isOpen={!!billingSendTarget}
          onClose={() => { setBillingSendTarget(null); setBillingSendError('') }}
          title={`Send ${billingSendTarget?.document_type === 'quote' ? 'quote' : 'invoice'} to customer?`}
        >
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{billingSendTarget?.display_name || `${billingSendTarget?.document_type === 'quote' ? 'Quote' : 'Invoice'} ${billingSendTarget?.document_number}`}</p>
              <p>{billingCustomerDisplayName(billingSendTarget?.leads) || 'Unnamed customer'}{billingSendTarget?.leads?.caller_phone ? ` • ${billingSendTarget.leads.caller_phone}` : ''}</p>
              <p className="font-medium text-foreground">{billingSendTarget ? formatCurrency(billingSendTarget.total_cents, true) : ''}</p>
            </div>
            {billingSendError && (
              <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                <div className="flex-1 text-xs text-red-900 dark:text-red-100">{billingSendError}</div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => { setBillingSendTarget(null); setBillingSendError('') }} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg">Cancel</button>
              <button
                onClick={() => {
                  const target = billingSendTarget
                  if (!target) return
                  if (target.document_type === 'invoice' && target.total_cents <= 0) {
                    setBillingSendError('Add an amount greater than $0 before sending this invoice.')
                    return
                  }
                  setBillingSendError('')
                  setBillingSendTarget(null)
                  handleSendBillingDoc(target)
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Send to Customer
              </button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={!!billingConvertTarget}
          onClose={() => { if (!billingConvertingId) setBillingConvertTarget(null) }}
          title={`Create invoice from ${billingConvertTarget?.document_number || 'quote'}?`}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">The original quote will remain accepted and viewable in history. A new draft invoice will be created.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBillingConvertTarget(null)} disabled={!!billingConvertingId} className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg disabled:opacity-50">Cancel</button>
              <button
                onClick={async () => {
                  const target = billingConvertTarget
                  if (!target || billingConvertingId) return
                  const invoice = await handleConvertBillingDoc(target)
                  if (invoice) {
                    setBillingConvertTarget(null)
                    // Open the exact created/existing invoice in the viewer —
                    // success is never silent and the user lands on the result.
                    setViewingBillingDoc(invoice)
                    setBillingViewerFeedback(null)
                    setShowBillingViewer(true)
                  }
                }}
                disabled={!!billingConvertingId}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                {billingConvertingId ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {billingConvertingId ? 'Creating Invoice…' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </Modal>

        <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </DashboardShell>
  )
}
