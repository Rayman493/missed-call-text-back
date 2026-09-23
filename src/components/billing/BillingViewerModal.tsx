'use client'

import { useState, useEffect } from 'react'
import { Loader2, Download, Send, ArrowRight, Edit, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DocumentRenderer from './DocumentRenderer'
import { DocumentPresentation, effectiveStatus } from '@/lib/billing/document-presentation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { billingCustomerDisplayName } from '@/lib/billing/billing-utils'

interface BillingViewerModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string | null
  onDownload: () => void
  onSend: () => void
  onEdit?: () => void
  onConvert?: () => void
  isSending?: boolean
  isDownloading?: boolean
  // Modal-local download feedback — visible inside the modal without scrolling.
  downloadFeedback?: { type: 'success' | 'error'; message: string } | null
}

export default function BillingViewerModal({
  isOpen,
  onClose,
  documentId,
  onDownload,
  onSend,
  onEdit,
  onConvert,
  isSending = false,
  isDownloading = false,
  downloadFeedback = null,
}: BillingViewerModalProps) {
  const [doc, setDoc] = useState<DocumentPresentation | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !documentId) return
    setLoading(true)
    setDoc(null)
    const fetchDoc = async () => {
      try {
        const supabase = createBrowserClient()
        const { data: { session } } = await supabase.auth.getSession()
        const headers: HeadersInit = {}
        if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`
        const res = await fetch(`/api/billing-documents/${documentId}`, { headers })
        if (!res.ok) return
        const json = await res.json()
        // Build presentation from the fetched doc
        const d = json.document
        const businessLogoUrl = json.business_logo_url || null
        setDoc({
          document_type: d.document_type,
          document_number: d.document_number,
          status: d.status,
          issue_date: d.issue_date,
          valid_until: d.valid_until,
          due_date: d.due_date,
          business_name: d.snapshot_business_name || 'Business',
          business_phone: d.snapshot_business_phone || null,
          business_email: d.snapshot_business_email || null,
          business_address: d.snapshot_business_address || null,
          business_logo_url: d.snapshot_business_logo_url || businessLogoUrl,
          customer_name: d.snapshot_customer_name || billingCustomerDisplayName(d.leads),
          customer_phone: d.snapshot_customer_phone || d.leads?.caller_phone || null,
          customer_email: d.snapshot_customer_email || null,
          customer_address: d.snapshot_customer_address || null,
          line_items: (d.billing_document_items || []).map((item: any) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unit_label: item.unit_label,
            unit_price_cents: item.unit_price_cents,
            line_total_cents: item.line_total_cents,
          })),
          subtotal_cents: d.subtotal_cents,
          discount_cents: d.discount_cents,
          tax_cents: d.tax_cents,
          total_cents: d.total_cents,
          notes: d.notes,
          terms: d.terms,
          payment_url: null,
          payment_request: d.payment_request,
        })
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [isOpen, documentId])

  // Compute action visibility from the fetched document's type + effective status
  const docType = doc?.document_type || null
  const rawStatus = doc?.status || null
  const effective = doc ? effectiveStatus({
    document_type: doc.document_type,
    status: doc.status,
    valid_until: doc.valid_until,
    due_date: doc.due_date,
  } as any) : null

  const paymentRequestStatus = (doc?.payment_request?.status || '').toLowerCase().trim() || null
  const paymentIsPaid = paymentRequestStatus === 'paid'
  const paymentIsCancelled = paymentRequestStatus === 'cancelled' || paymentRequestStatus === 'canceled'
  const paymentIsPending = paymentRequestStatus === 'pending' || paymentRequestStatus === 'draft' || paymentRequestStatus === null

  const isDraft = rawStatus === 'draft'
  const isSent = rawStatus === 'sent'
  const isAccepted = rawStatus === 'accepted'
  const isDeclined = rawStatus === 'declined'
  const isPaid = rawStatus === 'paid' || paymentIsPaid
  const isOverdue = effective === 'overdue'
  const isQuote = docType === 'quote'
  const isInvoice = docType === 'invoice'

  // Action visibility by status
  const showEdit = isDraft || isDeclined
  const showSend = isDraft
  const showResend = isSent || isOverdue
  const showConvert = isQuote && isAccepted
  const showDownload = true // always available

  // "What's next?" guidance
  let nextStepTitle = ''
  let nextStepBody = ''
  let nextStepCta: { label: string; onClick: () => void; icon: typeof Send } | null = null

  if (isDraft && isQuote) {
    nextStepTitle = "What's next?"
    nextStepBody = "Review the quote, then send it when you're ready."
    nextStepCta = { label: 'Send Quote', onClick: onSend, icon: Send }
  } else if (isSent && isQuote && !isOverdue) {
    nextStepTitle = "What's next?"
    nextStepBody = "Waiting for your customer to review the quote."
  } else if (isAccepted && isQuote) {
    nextStepTitle = "What's next?"
    nextStepBody = "Ready to bill for the work?"
    if (onConvert) nextStepCta = { label: 'Create Invoice', onClick: onConvert, icon: ArrowRight }
  } else if (isDeclined && isQuote) {
    nextStepTitle = "What's next?"
    nextStepBody = "The customer declined this quote. Update it if you'd like to send a revision."
    if (onEdit) nextStepCta = { label: 'Edit Quote', onClick: onEdit, icon: Edit }
  } else if (isDraft && isInvoice) {
    nextStepTitle = "What's next?"
    nextStepBody = "Review the invoice, then send it when you're ready to collect payment."
    nextStepCta = { label: 'Send Invoice', onClick: onSend, icon: Send }
  } else if (isSent && isInvoice && !isOverdue) {
    nextStepTitle = "What's next?"
    if (paymentIsCancelled) {
      nextStepBody = "Payment cancelled. You can resend the invoice to request payment again."
      nextStepCta = { label: 'Resend Invoice', onClick: onSend, icon: RefreshCw }
    } else if (paymentIsPaid) {
      nextStepBody = "Payment received."
    } else {
      nextStepBody = "Waiting for payment."
    }
  } else if (isOverdue && isInvoice) {
    nextStepTitle = "What's next?"
    nextStepBody = "Payment is overdue. You can resend the invoice if needed."
    nextStepCta = { label: 'Resend Invoice', onClick: onSend, icon: RefreshCw }
  } else if (isPaid && isInvoice) {
    nextStepTitle = 'Payment received.'
    nextStepBody = ''
  }

  const footer = (
    <div className="flex flex-col gap-2 w-full">
      {/* Modal-local download feedback — always visible above actions */}
      {downloadFeedback && (
        <div
          role="status"
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
            downloadFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-900/25 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-900/25 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300'
          }`}
        >
          {downloadFeedback.type === 'success'
            ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
            : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          <span className="min-w-0 break-words">{downloadFeedback.message}</span>
        </div>
      )}
      <div className="flex gap-2 w-full">
        {showEdit && onEdit && (
          <button
            onClick={onEdit}
            className="flex-1 min-h-11 justify-center px-3 py-2 text-sm font-medium text-foreground border border-border/60 hover:bg-muted/50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 flex items-center gap-1.5"
          >
            <Edit className="w-4 h-4" />
            Edit
          </button>
        )}
        {showDownload && (
          <button
            onClick={onDownload}
            disabled={isDownloading}
            onTouchEnd={(e) => e.currentTarget.blur()}
            className="flex-1 min-h-11 justify-center px-3 py-2 text-sm font-medium text-foreground border border-border/60 hover:bg-muted/50 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 flex items-center gap-1.5 disabled:opacity-50"
          >
            {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isDownloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        )}
      </div>
      {showConvert && onConvert && (
        <button
          onClick={onConvert}
          className="w-full min-h-11 justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm flex items-center gap-1.5"
        >
          <ArrowRight className="w-4 h-4" />
          Create Invoice
        </button>
      )}
      {showSend && (
        <button
          onClick={onSend}
          disabled={isSending}
          className="w-full min-h-11 justify-center px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send to Customer
        </button>
      )}
      {showResend && (
        <button
          onClick={onSend}
          disabled={isSending}
          className="w-full min-h-11 justify-center px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 shadow-sm flex items-center gap-1.5 disabled:opacity-50"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Resend
        </button>
      )}
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Document"
      contentMaxHeight="85vh"
      footer={footer}
    >
      {loading ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : doc ? (
        <div className="space-y-3">
          {/* What's next? guidance */}
          {nextStepTitle && (
            <div className="rounded-lg border border-blue-200/60 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/15 px-3 py-2.5">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-0.5">{nextStepTitle}</p>
              {nextStepBody && (
                <p className="text-xs text-blue-600/90 dark:text-blue-300/80">{nextStepBody}</p>
              )}
              {nextStepCta && (
                <button
                  onClick={nextStepCta.onClick}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
                >
                  <nextStepCta.icon className="w-3.5 h-3.5" />
                  {nextStepCta.label}
                </button>
              )}
            </div>
          )}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-lg overflow-hidden">
            <DocumentRenderer doc={doc} showStatusBadge />
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">Failed to load document</p>
      )}
    </Modal>
  )
}
