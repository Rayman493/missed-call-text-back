/**
 * Payment Status Model
 * Single source of truth for payment request status presentation
 *
 * Payment statuses are distinct from customer/lead statuses.
 * This utility provides canonical styling and labels for payment_requests.status.
 */

/**
 * Canonical payment status enum (from database CHECK constraint)
 */
export type PaymentStatus =
  | 'draft'
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'

/**
 * Payment status style configuration
 */
export interface PaymentStatusStyle {
  label: string
  badgeClass: string
  color: string // Hex color for chart rendering
}

/**
 * Canonical payment status configuration
 */
export const PAYMENT_STATUS_STYLES: Record<PaymentStatus, PaymentStatusStyle> = {
  draft: {
    label: 'Draft',
    badgeClass: 'border-gray-200/40 bg-gray-100/12 text-gray-400 dark:border-gray-700/40 dark:bg-gray-800/12 dark:text-gray-300',
    color: '#94A3B8'
  },
  pending: {
    label: 'Pending',
    badgeClass: 'border-yellow-200/40 bg-yellow-100/12 text-yellow-600 dark:border-yellow-800/40 dark:bg-yellow-900/12 dark:text-yellow-300',
    color: '#F59E0B'
  },
  paid: {
    label: 'Paid',
    badgeClass: 'border-green-200/40 bg-green-100/12 text-green-600 dark:border-green-800/40 dark:bg-green-900/12 dark:text-green-300',
    color: '#10B981'
  },
  failed: {
    label: 'Failed',
    badgeClass: 'border-red-200/40 bg-red-100/12 text-red-600 dark:border-red-800/40 dark:bg-red-900/12 dark:text-red-300',
    color: '#EF4444'
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'border-gray-200/40 bg-gray-100/12 text-gray-400 dark:border-gray-700/40 dark:bg-gray-800/12 dark:text-gray-300',
    color: '#94A3B8'
  },
  expired: {
    label: 'Expired',
    badgeClass: 'border-red-200/40 bg-red-100/12 text-red-600 dark:border-red-800/40 dark:bg-red-900/12 dark:text-red-300',
    color: '#EF4444'
  }
}

/**
 * Normalize a raw status value from the database to a canonical PaymentStatus
 * Handles both 'cancelled' and 'canceled' for historical compatibility
 */
export function normalizePaymentStatus(rawStatus: string | null | undefined): PaymentStatus {
  if (!rawStatus) return 'draft'

  const status = rawStatus.toLowerCase().trim()

  // Direct canonical mappings
  if (status === 'draft') return 'draft'
  if (status === 'pending') return 'pending'
  if (status === 'paid') return 'paid'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled' || status === 'canceled') return 'cancelled'
  if (status === 'expired') return 'expired'

  // Log unknown values in development only
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[normalizePaymentStatus] Unknown payment status value: "${rawStatus}", falling back to "draft"`)
  }

  return 'draft'
}

/**
 * Get the status style for a given raw status value
 */
export function getPaymentStatusStyle(rawStatus: string | null | undefined): PaymentStatusStyle {
  const canonicalStatus = normalizePaymentStatus(rawStatus)
  return PAYMENT_STATUS_STYLES[canonicalStatus]
}

/**
 * Get the display label for a raw status value
 */
export function getPaymentStatusLabel(rawStatus: string | null | undefined): string {
  return getPaymentStatusStyle(rawStatus).label
}

/**
 * Get all canonical payment statuses
 */
export function getAllPaymentStatuses(): PaymentStatus[] {
  return Object.keys(PAYMENT_STATUS_STYLES) as PaymentStatus[]
}

/**
 * Display-only statuses derived from Stripe-managed refund/dispute state.
 * These are NOT stored in payment_requests.status — the lifecycle status
 * remains 'paid' while refund/dispute fields carry the financial truth.
 */
export type DerivedPaymentStatus = PaymentStatus | 'partially_refunded' | 'refunded'

const DERIVED_STATUS_STYLES: Record<'partially_refunded' | 'refunded', PaymentStatusStyle> = {
  partially_refunded: {
    label: 'Partially refunded',
    badgeClass: 'border-amber-200/40 bg-amber-100/12 text-amber-600 dark:border-amber-800/40 dark:bg-amber-900/12 dark:text-amber-300',
    color: '#F59E0B'
  },
  refunded: {
    label: 'Refunded',
    badgeClass: 'border-purple-200/40 bg-purple-100/12 text-purple-600 dark:border-purple-800/40 dark:bg-purple-900/12 dark:text-purple-300',
    color: '#8B5CF6'
  }
}

export interface PaymentRefundFields {
  status: string | null | undefined
  refund_status?: string | null
}

/**
 * Derive the display status for a payment, folding Stripe refund state into
 * the stored lifecycle status. A paid payment that was refunded displays
 * 'Refunded'/'Partially refunded' on every surface that uses this helper.
 * A pending refund displays as 'Partially refunded' only when money moved;
 * pending with zero refunded shows as 'Paid' (nothing lost yet) — but the
 * refund_status field still carries 'pending' for consumers that need it.
 */
export function getEffectivePaymentStatus(payment: PaymentRefundFields): DerivedPaymentStatus {
  const canonical = normalizePaymentStatus(payment.status)
  if (canonical === 'paid') {
    if (payment.refund_status === 'refunded') return 'refunded'
    if (payment.refund_status === 'partially_refunded') return 'partially_refunded'
  }
  return canonical
}

export function getEffectivePaymentStatusStyle(payment: PaymentRefundFields): PaymentStatusStyle {
  const derived = getEffectivePaymentStatus(payment)
  if (derived === 'refunded' || derived === 'partially_refunded') {
    return DERIVED_STATUS_STYLES[derived]
  }
  return PAYMENT_STATUS_STYLES[derived]
}

/**
 * Dispute status display — stored in payment_requests.dispute_status,
 * business-facing only.
 */
export function getDisputeStatusLabel(disputeStatus: string | null | undefined): string | null {
  if (disputeStatus === 'open') return 'Disputed'
  if (disputeStatus === 'won') return 'Dispute won'
  if (disputeStatus === 'lost') return 'Dispute lost'
  return null
}

export function getDisputeStatusBadgeClass(disputeStatus: string | null | undefined): string {
  if (disputeStatus === 'open') {
    return 'border-red-200/40 bg-red-100/12 text-red-600 dark:border-red-800/40 dark:bg-red-900/12 dark:text-red-300'
  }
  if (disputeStatus === 'won') {
    return 'border-green-200/40 bg-green-100/12 text-green-600 dark:border-green-800/40 dark:bg-green-900/12 dark:text-green-300'
  }
  return 'border-gray-200/40 bg-gray-100/12 text-gray-400 dark:border-gray-700/40 dark:bg-gray-800/12 dark:text-gray-300'
}