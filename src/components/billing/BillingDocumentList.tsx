'use client'

import { useState } from 'react'
import { FileText, FileSpreadsheet, Edit, Trash2, Loader2, Eye, Download, Send, RefreshCw, ArrowRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { formatCurrency } from '@/lib/utils'
import { effectiveStatus } from '@/lib/billing/document-presentation'
import { billingCustomerDisplayName } from '@/lib/billing/billing-utils'
import { showToast } from '@/lib/toast'
import StatusPill from '@/components/ui/StatusPill'
import type { BillingDocumentType } from './BillingEditorModal'

export interface BillingDocumentListItem {
  id: string
  document_type: BillingDocumentType
  status: string
  document_number: string
  display_name: string | null
  issue_date: string
  valid_until: string | null
  due_date: string | null
  total_cents: number
  customer_id: string | null
  public_token: string | null
  source_quote_id: string | null
  payment_request_id: string | null
  payment_request: {
    id: string
    status: string
    paid_at: string | null
  } | null
  leads: {
    id: string
    contact_name: string | null
    caller_phone: string | null
    raw_metadata?: Record<string, any> | null
    ai_call_records?: Array<{
      id: string
      created_at: string
      extracted_info: Record<string, any> | null
    }> | null
  } | null
  updated_at: string
  sent_at: string | null
  derived_invoice?: { id: string; document_number: string } | null
  source_quote?: { id: string; document_number: string } | null
}

interface BillingDocumentListProps {
  documents: BillingDocumentListItem[]
  loading: boolean
  onOpen: (doc: BillingDocumentListItem) => void
  onDelete: (doc: BillingDocumentListItem) => void
  onDownload: (doc: BillingDocumentListItem) => void
  onSend: (doc: BillingDocumentListItem) => void
  onConvert: (doc: BillingDocumentListItem) => void
  onView: (doc: BillingDocumentListItem) => void
  onViewRelated?: (documentId: string) => void
  downloadingId: string | null
  sendingId: string | null
  convertingId: string | null
  deletingId: string | null
  // Active type filter for context-aware empty states
  billingTypeFilter?: 'all' | 'quote' | 'invoice'
  // Callback to open the creation chooser from the empty-state CTA
  onCreate?: () => void
}

function statusBadge(status: string): { label: string; className: string } {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
    sent: { label: 'Sent', className: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    accepted: { label: 'Accepted', className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
    declined: { label: 'Declined', className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
    expired: { label: 'Expired', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' },
    paid: { label: 'Paid', className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
    overdue: { label: 'Overdue', className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' },
  }
  return map[status] || { label: status, className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' }
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return ''
  }
}

export default function BillingDocumentList({
  documents,
  loading,
  onOpen,
  onDelete,
  onDownload,
  onSend,
  onConvert,
  onView,
  onViewRelated,
  downloadingId,
  sendingId,
  convertingId,
  deletingId,
  billingTypeFilter = 'all',
  onCreate,
}: BillingDocumentListProps) {
  const [deleteTarget, setDeleteTarget] = useState<BillingDocumentListItem | null>(null)

  const handleConfirmDelete = () => {
    if (!deleteTarget) return
    onDelete(deleteTarget)
    setDeleteTarget(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (documents.length === 0) {
    // Context-aware empty state with creation CTA
    const emptyTitle =
      billingTypeFilter === 'quote' ? 'No quotes yet' :
      billingTypeFilter === 'invoice' ? 'No invoices yet' :
      'No quotes or invoices yet'
    const emptyDesc =
      billingTypeFilter === 'quote' ? 'Create your first quote for a customer.' :
      billingTypeFilter === 'invoice' ? 'Create your first invoice for a customer.' :
      'Create your first quote or invoice for a customer.'
    const ctaLabel =
      billingTypeFilter === 'quote' ? 'Create Quote' :
      billingTypeFilter === 'invoice' ? 'Create Invoice' :
      'Create Quote or Invoice'

    return (
      <div className="text-center py-8 px-4">
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4">{emptyDesc}</p>
        {onCreate && (
          <button
            onClick={onCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors shadow-sm"
          >
            <FileText className="w-4 h-4" />
            {ctaLabel}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const isQuote = doc.document_type === 'quote'
        const paymentRequest = doc.payment_request
        const paymentStatus = paymentRequest?.status?.toLowerCase().trim() || null
        // Compute effective status (overdue/expired)
        const effective = effectiveStatus({
          document_type: doc.document_type,
          status: doc.status,
          valid_until: doc.valid_until,
          due_date: doc.due_date,
        } as any)
        const badge = statusBadge(effective)
        const customerName = billingCustomerDisplayName(doc.leads) || ''
        const customerPhone = doc.leads?.caller_phone || ''
        // Display priority: canonical name as primary, phone as secondary metadata,
        // "Unnamed customer" only when no meaningful name truly exists.
        const customerLabel = customerName || 'Unnamed customer'
        const customerSecondary = customerName && customerPhone ? customerPhone : (customerPhone && !customerName ? '' : '')
        const isDraft = doc.status === 'draft'
        const isSent = doc.status === 'sent' || effective === 'overdue' || effective === 'expired'
        const isAccepted = doc.status === 'accepted'
        const isPaid = doc.status === 'paid' || paymentStatus === 'paid'
        const isCancelled = doc.status === 'cancelled'
        const isDeclined = doc.status === 'declined'
        const isPaymentCancelled = paymentStatus === 'cancelled' || paymentStatus === 'canceled'
        const isPaymentPending = paymentStatus === 'pending' || paymentStatus === 'draft' || (!paymentStatus && isSent && !isQuote)
        const dateLabel = doc.sent_at ? `Sent ${formatDate(doc.sent_at)}` : `Updated ${formatDate(doc.updated_at)}`

        // Contextual subline based on status and canonical payment request state
        let subline = ''
        if (isDraft && isQuote) subline = 'Next: Send quote'
        else if (isAccepted && isQuote && doc.derived_invoice) subline = `Invoice created • ${doc.derived_invoice.document_number}`
        else if (isAccepted && isQuote) subline = 'Next: Create invoice'
        else if (!isQuote && doc.source_quote) subline = `Created from ${doc.source_quote.document_number}`
        else if (isPaid) subline = 'Payment received'
        else if (isPaymentCancelled) subline = 'Payment cancelled. Resend to request again.'
        else if (isSent && !isQuote && isPaymentPending) subline = 'Waiting for payment'
        else if (effective === 'overdue') subline = 'Payment overdue'
        else if (isDeclined) subline = 'Customer declined'

        const statusVariant: Parameters<typeof StatusPill>[0]['variant'] =
          effective === 'paid'
            ? 'green'
            : effective === 'sent' || effective === 'accepted'
            ? 'blue'
            : effective === 'overdue' || effective === 'expired' || effective === 'declined' || effective === 'cancelled'
            ? 'red'
            : effective === 'pending' || effective === 'draft'
            ? 'amber'
            : 'gray'

        return (
          <div
            key={doc.id}
            className="flex flex-col gap-2 p-3 rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
            {/* Left: info */}
            <button
              onClick={() => onView(doc)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2 mb-1 min-w-0">
                {isQuote ? (
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                )}
                <span className="text-sm font-semibold text-foreground truncate">
                  {doc.display_name || `${isQuote ? 'Quote' : 'Invoice'} ${doc.document_number}`}
                </span>
              </div>
              {doc.display_name && (
                <p className="text-xs text-muted-foreground truncate font-medium">
                  {isQuote ? 'Quote' : 'Invoice'} {doc.document_number}
                </p>
              )}
              <p className="text-xs text-muted-foreground truncate">
                {customerLabel}
                {customerSecondary && <span className="text-muted-foreground/60"> · {customerSecondary}</span>}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium text-foreground">{formatCurrency(doc.total_cents, true)}</span>
                <span className="text-xs text-muted-foreground">· {dateLabel}</span>
              </div>
              {subline && (
                <p className="text-[11px] text-muted-foreground/70 dark:text-muted-foreground/60 mt-0.5">{subline}</p>
              )}
            </button>

            {/* Right: status pill in fixed header position */}
            <div className="flex-shrink-0">
              <StatusPill variant={statusVariant}>{badge.label}</StatusPill>
            </div>
            </div>

            {/* Bottom: six evenly distributed action slots spanning card width
                 col 1 Edit, col 2 Send/Resend, col 3 Convert/View Invoice,
                 col 4 Download, col 5 View, col 6 Delete */}
            <div className="grid grid-cols-6 gap-1 w-full">
              {[
                {
                  col: 1,
                  key: 'edit',
                  icon: Edit,
                  label: 'Edit',
                  title: 'Edit',
                  enabled: isDraft || isDeclined,
                  disabledReason: isQuote ? "Sent quotes can't be edited." : "Sent invoices can't be edited.",
                  onClick: () => onOpen(doc),
                  loading: false,
                },
                {
                  col: 2,
                  key: 'send',
                  icon: isSent ? RefreshCw : Send,
                  label: isSent ? 'Resend' : 'Send',
                  title: isSent ? 'Resend' : isQuote ? 'Send Quote' : 'Send Invoice',
                  enabled: isDraft || (isSent && !isAccepted),
                  disabledReason: isQuote && isAccepted
                    ? 'This quote has already been accepted.'
                    : isQuote
                    ? 'This quote has already been sent.'
                    : 'This invoice has already been sent.',
                  onClick: () => onSend(doc),
                  loading: sendingId === doc.id,
                },
                {
                  col: 3,
                  key: 'convert',
                  icon: ArrowRight,
                  label: doc.derived_invoice ? 'Invoice' : 'Convert',
                  title: doc.derived_invoice ? 'View Invoice' : 'Create Invoice',
                  enabled: isAccepted,
                  disabledReason: doc.derived_invoice
                    ? 'This quote already has an invoice.'
                    : 'Only accepted quotes can be converted to an invoice.',
                  onClick: () => doc.derived_invoice ? onViewRelated?.(doc.derived_invoice.id) : onConvert(doc),
                  loading: convertingId === doc.id,
                },
                {
                  col: 4,
                  key: 'download',
                  icon: Download,
                  label: 'Download',
                  title: 'Download PDF',
                  enabled: true,
                  disabledReason: '',
                  onClick: () => onDownload(doc),
                  loading: downloadingId === doc.id,
                },
                {
                  col: 5,
                  key: 'view',
                  icon: Eye,
                  label: 'View',
                  title: 'View',
                  enabled: true,
                  disabledReason: '',
                  onClick: () => onView(doc),
                  loading: false,
                },
                {
                  col: 6,
                  key: 'delete',
                  icon: Trash2,
                  label: 'Delete',
                  title: 'Delete',
                  enabled: isDraft,
                  disabledReason: "Sent documents can't be deleted.",
                  onClick: () => setDeleteTarget(doc),
                  loading: deletingId === doc.id,
                },
              ].map((slot) => {
                const Icon = slot.icon
                const isLoading = slot.enabled && slot.loading
                const disabledByEligibility = !slot.enabled

                if (disabledByEligibility) {
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      onClick={(e) => slot.disabledReason && showToast(slot.disabledReason, 'info', { anchor: e.currentTarget })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          slot.disabledReason && showToast(slot.disabledReason, 'info', { anchor: e.currentTarget })
                        }
                      }}
                      aria-label={`${slot.title} unavailable`}
                      style={{ gridColumn: slot.col }}
                      className="flex flex-col items-center justify-center gap-0.5 h-12 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 text-slate-300 dark:text-slate-700 cursor-default"
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[9px] leading-none">{slot.label}</span>
                    </button>
                  )
                }

                return (
                  <button
                    key={slot.key}
                    type="button"
                    onClick={slot.onClick}
                    disabled={isLoading}
                    aria-label={slot.title}
                    title={slot.title}
                    style={{ gridColumn: slot.col }}
                    className="flex flex-col items-center justify-center gap-0.5 h-12 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 active:scale-[0.98] text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 transition-colors disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
                    <span className="text-[9px] leading-none">{slot.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget?.document_type === 'quote' ? 'Delete quote?' : 'Delete invoice?'}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {deleteTarget?.document_type === 'quote' ? 'Quote' : 'Invoice'} {deleteTarget?.document_number} will be permanently deleted. This can't be undone.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmDelete}
              disabled={!!deletingId && deletingId === deleteTarget?.id}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              {deletingId === deleteTarget?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

    </div>
  )
}
