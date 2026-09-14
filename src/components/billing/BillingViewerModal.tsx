'use client'

import { useState, useEffect } from 'react'
import { Loader2, Download, Send, ArrowRight } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DocumentRenderer from './DocumentRenderer'
import { DocumentPresentation, effectiveStatus } from '@/lib/billing/document-presentation'
import { createBrowserClient } from '@/lib/supabase/browser'

interface BillingViewerModalProps {
  isOpen: boolean
  onClose: () => void
  documentId: string | null
  onDownload: () => void
  onSend: () => void
  onConvert?: () => void
  showConvert?: boolean
  showSend?: boolean
}

export default function BillingViewerModal({
  isOpen,
  onClose,
  documentId,
  onDownload,
  onSend,
  onConvert,
  showConvert = false,
  showSend = false,
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
          business_logo_url: d.snapshot_business_logo_url || null,
          customer_name: d.snapshot_customer_name || d.leads?.contact_name || d.leads?.name || null,
          customer_phone: d.snapshot_customer_phone || d.leads?.caller_phone || null,
          customer_email: d.snapshot_customer_email || d.leads?.email || null,
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
        })
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    fetchDoc()
  }, [isOpen, documentId])

  const footer = (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onDownload}
        className="px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg transition-colors flex items-center gap-1.5"
      >
        <Download className="w-4 h-4" />
        Download
      </button>
      {showSend && (
        <button
          onClick={onSend}
          className="px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" />
          Resend
        </button>
      )}
      {showConvert && (
        <button
          onClick={onConvert}
          className="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm flex items-center gap-1.5"
        >
          <ArrowRight className="w-4 h-4" />
          Convert to Invoice
        </button>
      )}
    </div>
  )

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Document"
      bottomSheetOnMobile
      contentMaxHeight="85vh"
      footer={footer}
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : doc ? (
        <div className="bg-slate-50 dark:bg-slate-950 rounded-lg overflow-hidden">
          <DocumentRenderer doc={doc} showStatusBadge />
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">Failed to load document</p>
      )}
    </Modal>
  )
}
