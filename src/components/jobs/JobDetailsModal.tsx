'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Briefcase, User, Phone, MapPin, FileText, Calendar, Clock, Pencil, Trash2, Link as LinkIcon, MessageSquare, CheckCircle2, AlertCircle, CreditCard, Copy, ExternalLink } from 'lucide-react'
import type { Job, JobStatus } from './JobComposer'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatCurrency } from '@/lib/utils'
import { useBusiness } from '@/contexts/BusinessContext'
import RequestPaymentModal from '@/components/payments/RequestPaymentModal'

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
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null)
  const [isLoadingPayment, setIsLoadingPayment] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isCancellingPayment, setIsCancellingPayment] = useState(false)

  // Fetch payment request when modal opens or job changes
  useEffect(() => {
    if (isOpen && job.lead_id) {
      fetchPaymentRequest()
    }
  }, [isOpen, job.lead_id])

  const fetchPaymentRequest = async () => {
    if (!job.lead_id) return

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

  if (!isOpen) return null

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (newStatus === job.status) return
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
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/jobs/${job.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete job')
      onDelete(job)
      onClose()
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const currentStatusOption = STATUS_OPTIONS.find(s => s.value === job.status)

  return (
    <>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] animate-in fade-in duration-200" onClick={onClose} />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 border-b border-border/50">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                <Briefcase className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-foreground leading-snug break-words">{job.title}</h2>
                <div className="flex items-center gap-2 mt-1">
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
          <div className="p-5 space-y-5">
            {/* Customer */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Customer</p>
              <div className="space-y-2">
                {job.customer_name && (
                  <div className="flex items-center gap-3 text-sm text-slate-800 dark:text-slate-200">
                    <User className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="font-medium">{job.customer_name}</span>
                  </div>
                )}
                {job.customer_phone && (
                  <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <a href={`tel:${job.customer_phone}`} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                      {job.customer_phone}
                    </a>
                  </div>
                )}
                {!job.customer_name && !job.customer_phone && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 italic">No customer information</p>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Schedule</p>
              <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                <Calendar className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>
                  {job.scheduled_date ? formatDate(job.scheduled_date) : 'No date set'}
                  {job.scheduled_time && ` at ${formatTime(job.scheduled_time)}`}
                </span>
              </div>
            </div>

            {/* Address */}
            {job.service_address && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Address</p>
                <div className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span>{job.service_address}</span>
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Notes</p>
              {job.notes ? (
                <div className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <FileText className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{job.notes}</span>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No notes added</p>
              )}
            </div>

            {/* Payment */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Payment</p>
              
              {isLoadingPayment ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading...</p>
              ) : !job.lead_id ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No lead associated with this job</p>
              ) : !paymentRequest ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Not requested</p>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Request Payment
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${getPaymentStatusColor(paymentRequest.status)}`}>
                      {getPaymentStatusLabel(paymentRequest.status)}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(paymentRequest.amount_cents / 100)}
                    </span>
                  </div>
                  
                  {paymentRequest.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">{paymentRequest.description}</p>
                  )}
                  
                  <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="capitalize">{paymentRequest.payment_provider}</span>
                    <span>•</span>
                    <span>{new Date(paymentRequest.created_at).toLocaleDateString()}</span>
                  </div>

                  {paymentRequest.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                      {paymentRequest.checkout_url && (
                        <>
                          <button
                            onClick={() => copyPaymentLink(paymentRequest.checkout_url!)}
                            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Copy payment link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <a
                            href={paymentRequest.checkout_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title="Open payment link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </>
                      )}
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="p-1.5 text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        title="Cancel payment request"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {paymentRequest.status === 'paid' && paymentRequest.paid_at && (
                    <div className="text-[10px] text-green-600 dark:text-green-400">
                      Paid on {new Date(paymentRequest.paid_at).toLocaleDateString()}
                    </div>
                  )}

                  {(paymentRequest.status === 'cancelled' || paymentRequest.status === 'expired') && (
                    <button
                      onClick={() => setShowPaymentModal(true)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      Create new payment request
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Confirmation SMS section */}
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">Appointment Confirmation</p>
              {job.confirmation_sms_sent_at ? (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmation sent</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(job.confirmation_sms_sent_at).toLocaleDateString()}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-300">No confirmation sent</p>
              )}
              {job.lead_id && (
                <Link
                  href={`/dashboard/leads/${job.lead_id}`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 mt-2 transition-colors"
                >
                  <LinkIcon className="w-3 h-3" />
                  View Conversation
                </Link>
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
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border/50">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2 w-full">
                <span className="text-xs text-muted-foreground flex-1">Delete this job?</span>
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

      {/* Payment Request Modal */}
      {showPaymentModal && business && (
        <RequestPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          business={business}
          onPaymentCreated={() => {
            setShowPaymentModal(false)
            fetchPaymentRequest()
          }}
          prefillLeadId={job.lead_id || undefined}
          prefillDescription={job.title || undefined}
        />
      )}

      {/* Cancel Payment Confirmation */}
      {showCancelConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] animate-in fade-in duration-200" onClick={() => setShowCancelConfirm(false)} />
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 border border-border/50 w-full max-w-sm animate-in zoom-in-95 duration-200">
              <div className="p-5">
                <h3 className="text-lg font-semibold text-foreground mb-2">Cancel Payment Request?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  This will cancel the payment request for {paymentRequest ? formatCurrency(paymentRequest.amount_cents / 100) : 'this amount'}. This action cannot be undone.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={isCancellingPayment}
                    className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Keep Request
                  </button>
                  <button
                    onClick={handleCancelPayment}
                    disabled={isCancellingPayment}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isCancellingPayment ? 'Cancelling...' : 'Cancel Request'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
