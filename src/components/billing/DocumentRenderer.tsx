'use client'

import {
  DocumentPresentation,
  formatDate,
  formatMoney,
  formatQuantity,
  effectiveStatus,
} from '@/lib/billing/document-presentation'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  sent: 'Sent',
  cancelled: 'Cancelled',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
  paid: 'Paid',
  overdue: 'Overdue',
}

interface DocumentRendererProps {
  doc: DocumentPresentation
  showStatusBadge?: boolean
  isPreview?: boolean
}

export default function DocumentRenderer({ doc, showStatusBadge = false, isPreview = false }: DocumentRendererProps) {
  const isQuote = doc.document_type === 'quote'
  const status = effectiveStatus(doc)
  const statusLabel = STATUS_LABELS[status] || doc.status

  return (
    <div className={`max-w-2xl mx-auto bg-white ${isPreview ? '' : 'min-h-screen'} p-6 sm:p-10`}>
      {/* Business header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div className="min-w-0 flex-1">
          {doc.business_logo_url && (
            <img
              src={doc.business_logo_url}
              alt={doc.business_name}
              className="h-16 w-auto object-contain mb-3"
            />
          )}
          <h1 className="text-lg font-bold text-slate-900">{doc.business_name}</h1>
          {doc.business_phone && <p className="text-sm text-slate-600">{doc.business_phone}</p>}
          {doc.business_email && <p className="text-sm text-slate-600">{doc.business_email}</p>}
          {doc.business_address && <p className="text-sm text-slate-600">{doc.business_address}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-2xl font-bold ${isQuote ? 'text-blue-700' : 'text-emerald-700'}`}>
            {isQuote ? 'QUOTE' : 'INVOICE'}
          </p>
          <p className="text-lg font-semibold text-slate-700 mt-1">{doc.document_number}</p>
          {showStatusBadge && (
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${statusBadgeClass(status)}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Customer + dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
            {isQuote ? 'Quote To' : 'Bill To'}
          </p>
          <p className="text-sm font-medium text-slate-900">{doc.customer_name || 'No customer specified'}</p>
          {doc.customer_phone && <p className="text-sm text-slate-600">{doc.customer_phone}</p>}
          {doc.customer_email && <p className="text-sm text-slate-600">{doc.customer_email}</p>}
          {doc.customer_address && <p className="text-sm text-slate-600">{doc.customer_address}</p>}
        </div>
        <div className="sm:text-right">
          <div className="space-y-1">
            <div>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Issue Date: </span>
              <span className="text-sm text-slate-700">{formatDate(doc.issue_date)}</span>
            </div>
            {isQuote && doc.valid_until && (
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Valid Until: </span>
                <span className="text-sm text-slate-700">{formatDate(doc.valid_until)}</span>
              </div>
            )}
            {!isQuote && doc.due_date && (
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Due Date: </span>
                <span className="text-sm text-slate-700">{formatDate(doc.due_date)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Line items table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-2 px-1 font-semibold text-slate-700">Description</th>
              <th className="text-right py-2 px-1 font-semibold text-slate-700 whitespace-nowrap">Qty</th>
              <th className="text-left py-2 px-1 font-semibold text-slate-700 hidden sm:table-cell">Unit</th>
              <th className="text-right py-2 px-1 font-semibold text-slate-700 whitespace-nowrap">Rate</th>
              <th className="text-right py-2 px-1 font-semibold text-slate-700 whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.line_items.map((item, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 px-1 text-slate-700">{item.description || '\u00A0'}</td>
                <td className="py-2 px-1 text-right text-slate-700 whitespace-nowrap">{formatQuantity(item.quantity)}</td>
                <td className="py-2 px-1 text-slate-600 hidden sm:table-cell">{item.unit_label || ''}</td>
                <td className="py-2 px-1 text-right text-slate-700 whitespace-nowrap">{formatMoney(item.unit_price_cents)}</td>
                <td className="py-2 px-1 text-right text-slate-700 whitespace-nowrap font-medium">{formatMoney(item.line_total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-8">
        <div className="w-full sm:w-64 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="text-slate-900 font-medium">{formatMoney(doc.subtotal_cents)}</span>
          </div>
          {doc.discount_cents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Discount</span>
              <span className="text-red-600">-{formatMoney(doc.discount_cents)}</span>
            </div>
          )}
          {doc.tax_cents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Tax</span>
              <span className="text-slate-900">{formatMoney(doc.tax_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold pt-2 border-t border-slate-200">
            <span className="text-slate-900">Total</span>
            <span className={isQuote ? 'text-blue-700' : 'text-emerald-700'}>{formatMoney(doc.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {doc.notes && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notes</p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{doc.notes}</p>
        </div>
      )}

      {/* Terms */}
      {doc.terms && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Terms</p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{doc.terms}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-4 border-t border-slate-100 text-center">
        <p className="text-xs text-slate-400">Powered by ReplyFlow</p>
      </div>
    </div>
  )
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    sent: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
    expired: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700',
    overdue: 'bg-red-100 text-red-700',
  }
  return map[status] || 'bg-slate-100 text-slate-600'
}
