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
    <div className={`max-w-2xl mx-auto bg-white p-6 sm:p-10`}>
      {/* Business header */}
      <div className="flex items-start justify-between gap-6 mb-10">
        <div className="min-w-0 flex-1">
          {doc.business_logo_url && (
            <img
              src={doc.business_logo_url}
              alt={doc.business_name}
              className="h-12 sm:h-14 w-auto object-contain mb-4 max-w-[180px]"
            />
          )}
          <h1 className="text-base font-bold text-slate-900 leading-tight">{doc.business_name}</h1>
          {doc.business_phone && <p className="text-xs text-slate-500 mt-0.5">{doc.business_phone}</p>}
          {doc.business_email && <p className="text-xs text-slate-500">{doc.business_email}</p>}
          {doc.business_address && <p className="text-xs text-slate-500">{doc.business_address}</p>}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-xl sm:text-2xl font-bold tracking-tight ${isQuote ? 'text-blue-700' : 'text-emerald-700'}`}>
            {isQuote ? 'QUOTE' : 'INVOICE'}
          </p>
          <p className="text-sm font-semibold text-slate-700 mt-1">{doc.document_number}</p>
          {showStatusBadge && (
            <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${statusBadgeClass(status)}`}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>

      {/* Customer + dates */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            {isQuote ? 'Quote To' : 'Bill To'}
          </p>
          <p className="text-sm font-medium text-slate-900 break-words">{doc.customer_name || 'No customer specified'}</p>
          {doc.customer_phone && <p className="text-sm text-slate-500 mt-0.5 break-words">{doc.customer_phone}</p>}
          {doc.customer_email && <p className="text-sm text-slate-500 break-words">{doc.customer_email}</p>}
          {doc.customer_address && <p className="text-sm text-slate-500 break-words">{doc.customer_address}</p>}
        </div>
        <div className="sm:text-right min-w-0">
          {/* Deliberate 2-column metadata grid: labels left, values right-aligned */}
          <div className="grid grid-cols-[auto_minmax(0,auto)] justify-between sm:justify-end gap-x-6 gap-y-1 items-baseline">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Issue Date</span>
            <span className="text-sm text-slate-700 text-right break-words min-w-0">{formatDate(doc.issue_date)}</span>
            {isQuote && doc.valid_until && (
              <>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Valid Until</span>
                <span className="text-sm text-slate-700 text-right break-words min-w-0">{formatDate(doc.valid_until)}</span>
              </>
            )}
            {!isQuote && doc.due_date && (
              <>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Due Date</span>
                <span className="text-sm text-slate-700 text-right break-words min-w-0">{formatDate(doc.due_date)}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Line items table */}
      <div className="overflow-x-auto mb-8 -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-slate-200">
              <th className="text-left py-2 px-1 font-semibold text-slate-600 text-xs uppercase tracking-wider">Description</th>
              <th className="text-right py-2 px-1 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Qty</th>
              <th className="text-left py-2 px-1 font-semibold text-slate-600 text-xs uppercase tracking-wider hidden sm:table-cell">Unit</th>
              <th className="text-right py-2 px-1 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Rate</th>
              <th className="text-right py-2 px-1 font-semibold text-slate-600 text-xs uppercase tracking-wider whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.line_items.map((item, i) => {
              const isFlatRate = item.quantity === 1 && !item.unit_label
              return (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-3 px-1 text-slate-700 align-top break-words">{item.description || '\u00A0'}</td>
                <td className="py-3 px-1 text-right text-slate-700 whitespace-nowrap align-top">{isFlatRate ? '\u2014' : formatQuantity(item.quantity)}</td>
                <td className="py-3 px-1 text-slate-500 hidden sm:table-cell align-top">{item.unit_label || ''}</td>
                <td className="py-3 px-1 text-right text-slate-700 whitespace-nowrap align-top">{formatMoney(item.unit_price_cents)}</td>
                <td className="py-3 px-1 text-right text-slate-900 whitespace-nowrap font-medium align-top">{formatMoney(item.line_total_cents)}</td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="flex justify-end mb-10">
        <div className="w-full sm:w-72 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Subtotal</span>
            <span className="text-slate-900 font-medium">{formatMoney(doc.subtotal_cents)}</span>
          </div>
          {doc.discount_cents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Discount</span>
              <span className="text-red-600">-{formatMoney(doc.discount_cents)}</span>
            </div>
          )}
          {doc.tax_cents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Tax</span>
              <span className="text-slate-900">{formatMoney(doc.tax_cents)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold pt-3 mt-1 border-t-2 border-slate-300">
            <span className="text-slate-900">Total</span>
            <span className={isQuote ? 'text-blue-700' : 'text-emerald-700'}>{formatMoney(doc.total_cents)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      {doc.notes && (
        <div className="mb-6">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Notes</p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{doc.notes}</p>
        </div>
      )}

      {/* Terms */}
      {doc.terms && (
        <div className="mb-6">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Terms</p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{doc.terms}</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-16 pt-4 border-t border-slate-100 text-center">
        <p className="text-[11px] text-slate-300">Powered by ReplyFlow</p>
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
