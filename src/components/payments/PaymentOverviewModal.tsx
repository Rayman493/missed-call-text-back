'use client'

import Modal from '@/components/ui/Modal'
import { formatCurrency, formatPhoneNumber } from '@/lib/utils'
import { getEffectivePaymentStatusStyle, getDisputeStatusLabel, getDisputeStatusBadgeClass } from '@/lib/payment-status'
import { getPaymentMethodBadge } from '@/lib/payment-method-badge'
import { formatForDisplay } from '@/utils/phone-formatting'
import { suppressNextHistoryBackCleanup } from '@/lib/modalBackButton'
import { appendNativeDiagnostic, isNativeDiagnosticEnabled } from '@/lib/native-diagnostics'

/**
 * [RF_PAYMENTS_NAV] diagnostic logger — off in production unless a native
 * build enables the `rf_payments_nav_debug` flag. Logs only navigation
 * lifecycle data; no payment amounts, names, or identifiers are emitted.
 */
const logPaymentsNav = (stage: string, extra: Record<string, unknown> = {}) => {
  const nativeDebug = isNativeDiagnosticEnabled('rf_payments_nav_debug')
  if (process.env.NODE_ENV === 'production' && !nativeDebug) return
  const payload = {
    stage,
    timestamp: Date.now(),
    pathname: typeof window !== 'undefined' ? window.location.pathname : null,
    ...extra,
  }
  console.log('[RF_PAYMENTS_NAV]', payload)
  void appendNativeDiagnostic('[RF_PAYMENTS_NAV]', payload, 'rf_payments_nav_debug')
}

export interface PaymentOverviewItem {
  id: string
  amount_cents: number
  description: string | null
  status: string
  created_at: string
  paid_at: string | null
  payment_provider: string | null
  payment_method_type: string | null
  display_name: string | null
  reference_number: string | null
  refund_status?: string | null
  refunded_amount_cents?: number | null
  dispute_status?: string | null
  leads: {
    id: string
    contact_name?: string | null
    caller_phone?: string | null
  } | null
  jobs: {
    id: string
    title: string
  } | null
  invoices?: {
    document_number: string
  } | null
}

interface PaymentOverviewModalProps {
  isOpen: boolean
  onClose: () => void
  payment: PaymentOverviewItem | null
}

export default function PaymentOverviewModal({ isOpen, onClose, payment }: PaymentOverviewModalProps) {
  if (!payment) return null

  const statusStyle = getEffectivePaymentStatusStyle(payment)
  const disputeLabel = getDisputeStatusLabel(payment.dispute_status)
  const dateLabel = new Date(payment.created_at).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const paidLabel = payment.paid_at
    ? new Date(payment.paid_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Overview"
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-2xl font-semibold text-foreground">
            {formatCurrency(payment.amount_cents / 100)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {getPaymentMethodBadge(payment.payment_method_type, payment.payment_provider)}
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusStyle.badgeClass}`}>
              {statusStyle.label}
            </span>
            {disputeLabel && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getDisputeStatusBadgeClass(payment.dispute_status)}`}>
                {disputeLabel}
              </span>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="space-y-1">
          <DetailRow label="Requested" value={dateLabel} />
          {paidLabel && <DetailRow label="Paid" value={paidLabel} />}
          {!!payment.refunded_amount_cents && payment.refunded_amount_cents > 0 && (
            <DetailRow label="Refunded" value={formatCurrency(payment.refunded_amount_cents / 100)} />
          )}
          {payment.leads?.contact_name && (
            <DetailRow label="Customer" value={payment.leads.contact_name} />
          )}
          {payment.leads?.caller_phone && (
            <DetailRow label="Phone" value={formatForDisplay(payment.leads.caller_phone)} />
          )}
          {payment.jobs?.title && (
            <DetailRow label="Job" value={payment.jobs.title} />
          )}
          {payment.invoices?.document_number && (
            <DetailRow label="Invoice" value={payment.invoices.document_number} />
          )}
          {payment.reference_number && (
            <DetailRow label="Reference" value={payment.reference_number} />
          )}
          {payment.description && <DetailRow label="Description" value={payment.description} />}
          {payment.display_name && <DetailRow label="Label" value={payment.display_name} />}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onPointerDown={() => logPaymentsNav('pointerdown')}
            onClick={() => {
              logPaymentsNav('click-handler-start', { target: '/dashboard/payments' })
              // The modal's useModalBackButton pushes a synthetic history entry
              // when it opens. Without suppression, its cleanup calls
              // history.back() and races with this navigation — the root cause
              // of the native "View in Payments" bounce-back.
              suppressNextHistoryBackCleanup()
              onClose()
              window.location.assign('/dashboard/payments')
              logPaymentsNav('navigation-issued', { target: '/dashboard/payments' })
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 hover:underline underline-offset-4 transition-colors"
          >
            View in Payments
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border/30 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right max-w-[60%]">{value}</span>
    </div>
  )
}
