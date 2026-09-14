'use client'

import { FileText, FileSpreadsheet, Edit, Trash2, Loader2, Eye, Download, Send, RefreshCw, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { effectiveStatus } from '@/lib/billing/document-presentation'
import type { BillingDocumentType } from './BillingEditorModal'

export interface BillingDocumentListItem {
  id: string
  document_type: BillingDocumentType
  status: string
  document_number: string
  issue_date: string
  valid_until: string | null
  due_date: string | null
  total_cents: number
  customer_id: string | null
  public_token: string | null
  source_quote_id: string | null
  leads: {
    id: string
    contact_name: string | null
    caller_phone: string | null
  } | null
  updated_at: string
  sent_at: string | null
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
  downloadingId: string | null
  sendingId: string | null
  convertingId: string | null
  deletingId: string | null
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
  downloadingId,
  sendingId,
  convertingId,
  deletingId,
}: BillingDocumentListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No quotes or invoices yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {documents.map((doc) => {
        const isQuote = doc.document_type === 'quote'
        // Compute effective status (overdue/expired)
        const effective = effectiveStatus({
          document_type: doc.document_type,
          status: doc.status,
          valid_until: doc.valid_until,
          due_date: doc.due_date,
        } as any)
        const badge = statusBadge(effective)
        const customerName = doc.leads?.contact_name || doc.leads?.caller_phone || 'No customer'
        const isDraft = doc.status === 'draft'
        const isSent = doc.status === 'sent' || effective === 'overdue' || effective === 'expired'
        const isAccepted = doc.status === 'accepted'
        const isPaid = doc.status === 'paid'
        const isCancelled = doc.status === 'cancelled'
        const isDeclined = doc.status === 'declined'
        const dateLabel = doc.sent_at ? `Sent ${formatDate(doc.sent_at)}` : `Updated ${formatDate(doc.updated_at)}`

        // Contextual subline based on status
        let subline = ''
        if (isDraft && isQuote) subline = 'Next: Send quote'
        else if (isAccepted && isQuote) subline = 'Next: Create invoice'
        else if (isSent && !isQuote) subline = 'Waiting for payment'
        else if (isPaid) subline = 'Payment received'
        else if (effective === 'overdue') subline = 'Payment overdue'
        else if (isDeclined) subline = 'Customer declined'

        return (
          <div
            key={doc.id}
            className="flex items-start justify-between gap-3 p-3 rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 hover:shadow-sm transition-all"
          >
            {/* Left: info */}
            <button
              onClick={() => onView(doc)}
              className="min-w-0 flex-1 text-left"
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {isQuote ? (
                  <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                )}
                <span className="text-sm font-semibold text-foreground truncate">{doc.document_number}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{customerName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium text-foreground">{formatCurrency(doc.total_cents, true)}</span>
                <span className="text-xs text-muted-foreground">· {dateLabel}</span>
              </div>
              {subline && (
                <p className="text-[11px] text-muted-foreground/70 dark:text-muted-foreground/60 mt-0.5">{subline}</p>
              )}
            </button>

            {/* Right: actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Draft: Edit + Delete */}
              {isDraft && (
                <>
                  <button
                    onClick={() => onOpen(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="Edit document"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDelete(doc)}
                    disabled={deletingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Delete document"
                    title="Delete"
                  >
                    {deletingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  </button>
                </>
              )}

              {/* Sent Quote: View + Download + Resend + Convert */}
              {isSent && isQuote && (
                <>
                  <button
                    onClick={() => onView(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="View document"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Download PDF"
                    title="Download PDF"
                  >
                    {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => onSend(doc)}
                    disabled={sendingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Resend SMS"
                    title="Resend"
                  >
                    {sendingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </>
              )}

              {/* Sent Invoice: View + Download + Resend */}
              {isSent && !isQuote && (
                <>
                  <button
                    onClick={() => onView(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="View document"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Download PDF"
                    title="Download PDF"
                  >
                    {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => onSend(doc)}
                    disabled={sendingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Resend SMS"
                    title="Resend"
                  >
                    {sendingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  </button>
                </>
              )}

              {/* Accepted Quote: View + Download + Convert */}
              {isAccepted && (
                <>
                  <button
                    onClick={() => onView(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="View document"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Download PDF"
                    title="Download PDF"
                  >
                    {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => onConvert(doc)}
                    disabled={convertingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Convert to Invoice"
                    title="Convert to Invoice"
                  >
                    {convertingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                </>
              )}

              {/* Paid/Cancelled: View + Download only */}
              {(isPaid || isCancelled) && (
                <>
                  <button
                    onClick={() => onView(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="View document"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Download PDF"
                    title="Download PDF"
                  >
                    {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                </>
              )}

              {/* Declined: View + Edit + Download */}
              {isDeclined && (
                <>
                  <button
                    onClick={() => onView(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="View document"
                    title="View"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onOpen(doc)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded"
                    aria-label="Edit document"
                    title="Edit"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDownload(doc)}
                    disabled={downloadingId === doc.id}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors rounded disabled:opacity-50"
                    aria-label="Download PDF"
                    title="Download PDF"
                  >
                    {downloadingId === doc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
