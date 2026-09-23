'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { X, Briefcase, User, Phone, MapPin, FileText, Calendar, Clock, Pencil, Trash2, Link as LinkIcon, MessageSquare, CheckCircle2, AlertCircle, CreditCard, Copy, ExternalLink, Smartphone, MessageSquareText, Navigation, Share2 } from 'lucide-react'
import type { Job, JobStatus } from './JobComposer'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatCurrency, capitalizeFirstAlpha } from '@/lib/utils'
import { getEffectivePaymentStatus } from '@/lib/payment-status'
import { useBusiness } from '@/contexts/BusinessContext'
import JobTimer from '@/components/jobs/JobTimer'
import CustomerContextDisclosure from '@/components/customers/CustomerContextDisclosure'
import { isNativeCapacitor } from '@/lib/terminal'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useModalBackButton } from '@/hooks/useModalBackButton'

function NestedCancelConfirm({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // Handle Android back button and browser back to close nested confirm
  useModalBackButton({ isOpen: true, onClose })

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        {children}
      </div>
    </>
  )
}

interface JobDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  job: Job
  onEdit: (job: Job) => void
  onStatusChange: (job: Job, status: JobStatus) => void
  onDelete: (job: Job) => void
}

interface PaymentRequest {
  id: string
  lead_id: string
  amount_cents: number
  description: string
  status: string
  created_at: string
  paid_at: string | null
  checkout_url: string | null
  expires_at: string | null
  payment_provider: string | null
  refund_status?: string | null
  refunded_amount_cents?: number | null
}

interface Lead {
  id: string
  caller_phone: string
  raw_metadata: any
  name?: string
}

const STATUS_OPTIONS: { value: JobStatus; label: string; color: string }[] = [
  { value: 'scheduled', label: 'Scheduled', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
  { value: 'completed', label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
]

const STATUS_BADGE: Record<JobStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function formatDate(date: string | null) {
  if (!date) return null
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

function formatTime(time: string | null) {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function JobDetailsModal({
  isOpen,
  onClose,
  job,
  onEdit,
  onStatusChange,
  onDelete,
}: JobDetailsModalProps) {
  const { business } = useBusiness()
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteScope, setDeleteScope] = useState<'occurrence' | 'future' | 'series'>('occurrence')
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null)
  const [isLoadingPayment, setIsLoadingPayment] = useState(false)
  const [paymentLoadedForLeadId, setPaymentLoadedForLeadId] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showTapToPayModal, setShowTapToPayModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancellingPayment, setIsCancellingPayment] = useState(false)
  const [isNativeSupported, setIsNativeSupported] = useState(false)
  const [lead, setLead] = useState<Lead | null>(null)
  const [paymentToast, setPaymentToast] = useState<string | null>(null)
  const updateStatusInFlightRef = useRef(false)
  const deleteInFlightRef = useRef(false)

  // Lock background scroll when main modal is open
  useBodyScrollLock(isOpen, 'job-details-modal')

  // Handle Android back button and browser back to close modal
  useModalBackButton({ isOpen, onClose })

  // Fetch payment request when modal opens or job changes
  useEffect(() => {
    if (isOpen && job.lead_id) {
      fetchPaymentRequest()
    }
  }, [isOpen, job.lead_id])

  // Check native support when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsNativeSupported(isNativeCapacitor())
      if (job.lead_id) {
        fetchLead()
      }
    } else {
      setLead(null)
    }
  }, [isOpen, job.lead_id])

  const fetchLead = async () => {
    if (!job.lead_id) return
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }
      const response = await fetch(`/api/leads/${job.lead_id}`, { headers })
      if (response.ok) {
        const data = await response.json()
        setLead(data)
      }
    } catch (err) {
      console.error('Error fetching lead:', err)
    }
  }

  const fetchPaymentRequest = async () => {
    if (!job.lead_id) return

    setPaymentRequest(null)
    setPaymentLoadedForLeadId(null)
    setIsLoadingPayment(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch('/api/payments', { headers })
      if (!response.ok) return

      const data = await response.json()
      const payment = data.paymentRequests?.find((p: PaymentRequest) => p.lead_id === job.lead_id)
      setPaymentRequest(payment || null)
    } catch (err) {
      console.error('Error fetching payment request:', err)
    } finally {
      setPaymentLoadedForLeadId(job.lead_id)
      setIsLoadingPayment(false)
    }
  }

  const handleCancelPayment = async () => {
    if (!paymentRequest) return

    setIsCancellingPayment(true)
    try {
      const supabase = createBrowserClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(`/api/payments/${paymentRequest.id}/cancel`, {
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

      setShowCancelConfirm(false)
      await fetchPaymentRequest()
    } catch (err) {
      console.error('Error cancelling payment request:', err)
    } finally {
      setIsCancellingPayment(false)
    }
  }

  const copyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      // Show toast feedback
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-in fade-in slide-in-from-bottom-2 duration-300'
      toast.textContent = 'Payment link copied to clipboard'
      document.body.appendChild(toast)
      setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-2')
        setTimeout(() => toast.remove(), 300)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy link:', err)
    }
  }

  const getPaymentStatusColor = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'paid':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      case 'cancelled':
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      case 'expired':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      case 'failed':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      case 'refunded':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
      case 'partially_refunded':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    }
  }

  const getPaymentStatusLabel = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'Pending'
      case 'paid':
        return 'Paid'
      case 'refunded':
        return 'Refunded'
      case 'partially_refunded':
        return 'Partially refunded'
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

  const getPaymentMethodLabel = (provider: string | null, methodType: string | null): string => {
    if (methodType === 'card_present') return 'Tap to Pay'
    if (provider === 'stripe') return 'Stripe'
    if (provider === 'venmo') return 'Venmo'
    if (provider === 'paypal') return 'PayPal'
    return provider || 'Unknown'
  }

  if (!isOpen) return null

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (newStatus === job.status) return
    if (updateStatusInFlightRef.current) return
    updateStatusInFlightRef.current = true
    setIsUpdatingStatus(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!response.ok) throw new Error('Failed to update status')
      const data = await response.json()
      onStatusChange(data.job, newStatus)
    } finally {
      setIsUpdatingStatus(false)
      updateStatusInFlightRef.current = false
    }
  }

  const isRecurringJob = !!job && (
    !!(job as any).recurrence || !!(job as any).series_id || job.id.startsWith('virtual:')
  )

  const handleDelete = async () => {
    if (deleteInFlightRef.current) return
    deleteInFlightRef.current = true
    setIsDeleting(true)
    try {
      const params = new URLSearchParams({ scope: isRecurringJob ? deleteScope : 'occurrence' })
      if ((job as any).scheduled_date) params.set('occurrence_date', (job as any).scheduled_date)
      const response = await fetch(`/api/jobs/${job.id}?${params}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete job')
      onDelete(job)
      onClose()
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
      deleteInFlightRef.current = false
    }
  }

  const currentStatusOption = STATUS_OPTIONS.find(s => s.value === job.status)

  // Title logic with priority: job.request > lead.request > AI extracted request > first sentence of transcript > job.title
  const getRequestTitle = (): string => {
    // Priority 1: job.request (if field exists)
    if ((job as any).request) {
      return (job as any).request
    }
    // Priority 2: lead.request from raw_metadata
    if (lead?.raw_metadata?.request) {
      return lead.raw_metadata.request
    }
    // Priority 3: AI extracted request from lead raw_metadata
    if (lead?.raw_metadata?.extracted_info?.reasonForCalling) {
      return lead.raw_metadata.extracted_info.reasonForCalling
    }
    if (lead?.raw_metadata?.extracted_info?.serviceRequested) {
      return lead.raw_metadata.extracted_info.serviceRequested
    }
    // Priority 4: First sentence of transcript (if available)
    if (lead?.raw_metadata?.transcript) {
      const transcript = lead.raw_metadata.transcript
      const firstSentence = transcript.split(/[.!?]/)[0]
      if (firstSentence && firstSentence.trim().length > 10) {
        return firstSentence.trim()
      }
    }
    // Fallback to job.title
    return job.title
  }

  const displayTitle = getRequestTitle()

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-4 right-4 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-in fade-in slide-in-from-bottom-2 duration-300'
      toast.textContent = 'Address copied to clipboard'
      document.body.appendChild(toast)
      setTimeout(() => {
        toast.classList.add('animate-out', 'fade-out', 'slide-out-to-bottom-2')
        setTimeout(() => toast.remove(), 300)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy address:', err)
    }
  }

  const openInMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address)
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank')
  }

  const overlay = (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-4">
        <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-lg max-h-[var(--details-modal-max-height)] sm:max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-border/50 bg-muted/30">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Briefcase className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground leading-snug break-words">{capitalizeFirstAlpha(displayTitle)}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[job.status]}`}>
                    {currentStatusOption?.label}
                  </span>
                  {job.source === 'replyflow' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      <LinkIcon className="w-2.5 h-2.5" />
                      ReplyFlow Lead
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors flex-shrink-0" aria-label="Close modal">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Details */}
          <div data-scroll-lock-allow className="p-5 space-y-6 overflow-y-auto shrink min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Customer - identity on the left, actions on the right. The
                phone renders once as a tel: link — a separate "Call" chip would
                duplicate the same number/action in the same row. */}
            {(job.customer_name || job.customer_phone || lead?.id) && (
              <div className="flex items-center gap-2 text-sm">
                <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap min-w-0 flex-1">
                  <span className="text-foreground font-medium min-w-0 break-words">{job.customer_name || lead?.name || 'Customer'}</span>
                  {job.customer_phone && (
                    <a href={`tel:${job.customer_phone}`} className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors break-all">
                      {job.customer_phone}
                    </a>
                  )}
                </div>
                {lead?.id && (
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => window.location.assign(`/dashboard/leads/${lead.id}`)}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      View
                    </button>
                    <button
                      onClick={() => window.location.assign(`/dashboard/leads/${lead.id}`)}
                      className="text-[10px] px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 flex items-center gap-1"
                    >
                      <MessageSquareText className="w-3 h-3" />
                      Conversation
                    </button>
                  </div>
                )}
              </div>
            )}
            {lead && <CustomerContextDisclosure leadData={lead} />}

            {/* Location - using EventDetailsModal pattern */}
            {job.service_address && (
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="text-foreground break-words flex-1 min-w-0">{job.service_address}</span>
                <div className="flex gap-1 flex-shrink-0 flex-wrap">
                  <button
                    onClick={() => openInMaps(job.service_address!)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center gap-1"
                    title="Open in Maps"
                  >
                    <Navigation className="w-3 h-3" />
                    Maps
                  </button>
                  <button
                    onClick={() => copyAddress(job.service_address!)}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 flex items-center gap-1"
                    title="Copy Address"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                </div>
              </div>
            )}

            {/* Schedule */}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-foreground">
                {job.scheduled_date ? formatDate(job.scheduled_date) : 'No date set'}
                {job.scheduled_time && ` at ${formatTime(job.scheduled_time)}`}
              </span>
            </div>

            {/* Job Notes - structured info first, fallback to transcript */}
            {job.notes && (
              <div className="flex items-start gap-3 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <span className="text-foreground whitespace-pre-line break-words min-w-0">{job.notes}</span>
              </div>
            )}

            {/* Payment — informational only; collection actions live in Payments */}
            <div className="p-3 rounded-lg bg-muted/30 dark:bg-slate-800/60 border border-border/40 dark:border-border/30">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Payment</p>
              {!job.lead_id ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No lead associated with this job</p>
              ) : isLoadingPayment || paymentLoadedForLeadId !== job.lead_id ? (
                <div className="space-y-2" aria-label="Loading payment details">
                  <div className="h-5 w-20 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                  <div className="h-3 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                </div>
              ) : !paymentRequest ? (
                <p className="text-sm text-slate-600 dark:text-slate-300">No payments yet</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getPaymentStatusColor(getEffectivePaymentStatus(paymentRequest))}`}>
                      {getPaymentStatusLabel(getEffectivePaymentStatus(paymentRequest))}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(paymentRequest.amount_cents / 100)}
                    </span>
                  </div>

                  {paymentRequest.description && !/^not collected$/i.test(paymentRequest.description.trim()) && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">{paymentRequest.description}</p>
                  )}

                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <span>{getPaymentMethodLabel(paymentRequest.payment_provider, (paymentRequest as any).payment_method_type)}</span>
                    <span>•</span>
                    <span>{new Date(paymentRequest.created_at).toLocaleDateString()}</span>
                  </div>

                  {paymentRequest.status === 'paid' && paymentRequest.paid_at && (
                    <div className="text-[10px] text-green-600 dark:text-green-400">
                      Paid on {new Date(paymentRequest.paid_at).toLocaleDateString()}
                    </div>
                  )}
                  {!!paymentRequest.refunded_amount_cents && paymentRequest.refunded_amount_cents > 0 && (
                    <div className="text-[10px] text-purple-600 dark:text-purple-400">
                      Refunded {formatCurrency(paymentRequest.refunded_amount_cents / 100)}
                    </div>
                  )}
                </div>
              )}
            </div>


            {/* Status Change */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => handleStatusChange(opt.value)}
                    disabled={isUpdatingStatus || opt.value === job.status}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all disabled:cursor-not-allowed ${
                      opt.value === job.status
                        ? `${opt.color} opacity-100 cursor-default`
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 opacity-70 hover:opacity-100'
                    }`}
                  >
                    {opt.label}
                    {opt.value === job.status && ' ✓'}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Tracking */}
            <JobTimer jobId={job.id} />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border/50 bg-muted/30 flex-shrink-0" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2 w-full flex-wrap">
                <span className="text-xs text-muted-foreground flex-1">
                  {isRecurringJob ? 'Delete recurring job:' : 'Delete this job?'}
                </span>
                {isRecurringJob && (
                  <select
                    value={deleteScope}
                    onChange={(e) => setDeleteScope(e.target.value as typeof deleteScope)}
                    className="px-2 py-1.5 text-xs bg-muted border border-border/50 rounded-lg text-foreground"
                  >
                    <option value="occurrence">This occurrence</option>
                    <option value="future">This & future</option>
                    <option value="series">Entire series</option>
                  </select>
                )}
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title="Delete job"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { onEdit(job); onClose() }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors shadow-sm"
                >
                  <Pencil className="w-4 h-4" />
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>

    </>
  )

  // Portal to document.body so the backdrop/panel cover the full viewport
  // (including the status-bar band) instead of stacking under root chrome.
  return typeof document !== 'undefined' ? createPortal(overlay, document.body) : null
}
