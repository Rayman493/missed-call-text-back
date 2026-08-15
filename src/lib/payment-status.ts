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
    label: 'Canceled',
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