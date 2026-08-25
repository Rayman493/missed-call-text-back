/**
 * Canonical Customer Status Model
 * Single source of truth for all customer status presentation
 * 
 * Each status has ONE semantic color that drives all styling:
 * - Card gradient and border
 * - Badge
 * - Icon
 * - Dropdown option
 * - Selected state
 * 
 * All Tailwind classes are complete literal strings for production build safety.
 */

import { Phone, MessageCircle, Calendar, CreditCard, CheckSquare, Check, X, Clock, CircleX } from 'lucide-react'

/**
 * Canonical customer status enum
 */
export type CustomerStatus =
  | 'new'
  | 'needs_reply'
  | 'active'
  | 'scheduled'
  | 'payment_requested'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'ignored'
  | 'lost'

/**
 * Simplified status style - one color drives everything
 */
export interface CustomerStatusStyle {
  label: string
  cardClass: string
  accentStripClass: string
  badgeClass: string
  iconClass: string
  textClass: string
  selectedClass: string
  color: string // Hex color for chart rendering
}

/**
 * Canonical customer status configuration
 * Each status has one semantic color applied to all elements
 */
export const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, CustomerStatusStyle> = {
  new: {
    label: 'New',
    cardClass: 'border-blue-500/30 bg-background dark:bg-slate-900/60 hover:border-blue-500/50 dark:hover:border-blue-500/40 shadow-sm hover:shadow-md hover:shadow-blue-500/5 dark:hover:shadow-blue-500/10',
    accentStripClass: 'bg-blue-500',
    badgeClass: 'border-blue-500/40 bg-blue-500/12 text-blue-400',
    iconClass: 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    textClass: 'text-blue-600 dark:text-blue-400',
    selectedClass: 'border-blue-500/40 bg-blue-500/12',
    color: '#3B82F6'
  },
  needs_reply: {
    label: 'Needs Reply',
    cardClass: 'border-cyan-500/30 bg-background dark:bg-slate-900/60 hover:border-cyan-500/50 dark:hover:border-cyan-500/40 shadow-sm hover:shadow-md hover:shadow-cyan-500/5 dark:hover:shadow-cyan-500/10',
    accentStripClass: 'bg-cyan-500',
    badgeClass: 'border-cyan-500/40 bg-cyan-500/12 text-cyan-400',
    iconClass: 'bg-cyan-500/20 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
    textClass: 'text-cyan-600 dark:text-cyan-400',
    selectedClass: 'border-cyan-500/40 bg-cyan-500/12',
    color: '#06B6D4'
  },
  active: {
    label: 'Active',
    cardClass: 'border-green-500/30 bg-background dark:bg-slate-900/60 hover:border-green-500/50 dark:hover:border-green-500/40 shadow-sm hover:shadow-md hover:shadow-green-500/5 dark:hover:shadow-green-500/10',
    accentStripClass: 'bg-green-500',
    badgeClass: 'border-green-500/40 bg-green-500/12 text-green-400',
    iconClass: 'bg-green-500/20 text-green-600 dark:bg-green-500/15 dark:text-green-400',
    textClass: 'text-green-600 dark:text-green-400',
    selectedClass: 'border-green-500/40 bg-green-500/12',
    color: '#22C55E'
  },
  scheduled: {
    label: 'Scheduled',
    cardClass: 'border-purple-500/30 bg-background dark:bg-slate-900/60 hover:border-purple-500/50 dark:hover:border-purple-500/40 shadow-sm hover:shadow-md hover:shadow-purple-500/5 dark:hover:shadow-purple-500/10',
    accentStripClass: 'bg-purple-500',
    badgeClass: 'border-purple-500/40 bg-purple-500/12 text-purple-400',
    iconClass: 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
    textClass: 'text-purple-600 dark:text-purple-400',
    selectedClass: 'border-purple-500/40 bg-purple-500/12',
    color: '#A855F7'
  },
  payment_requested: {
    label: 'Payment Requested',
    cardClass: 'border-amber-500/30 bg-background dark:bg-slate-900/60 hover:border-amber-500/50 dark:hover:border-amber-500/40 shadow-sm hover:shadow-md hover:shadow-amber-500/5 dark:hover:shadow-amber-500/10',
    accentStripClass: 'bg-amber-500',
    badgeClass: 'border-amber-500/40 bg-amber-500/12 text-amber-400',
    iconClass: 'bg-amber-500/20 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    textClass: 'text-amber-700 dark:text-amber-400',
    selectedClass: 'border-amber-500/40 bg-amber-500/12',
    color: '#F59E0B'
  },
  paid: {
    label: 'Paid',
    cardClass: 'border-emerald-500/30 bg-background dark:bg-slate-900/60 hover:border-emerald-500/50 dark:hover:border-emerald-500/40 shadow-sm hover:shadow-md hover:shadow-emerald-500/5 dark:hover:shadow-emerald-500/10',
    accentStripClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/12 text-emerald-400',
    iconClass: 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    selectedClass: 'border-emerald-500/40 bg-emerald-500/12',
    color: '#10B981'
  },
  completed: {
    label: 'Completed',
    cardClass: 'border-slate-400/30 bg-background dark:bg-slate-900/60 hover:border-slate-400/50 dark:hover:border-slate-400/40 shadow-sm hover:shadow-md hover:shadow-slate-400/5 dark:hover:shadow-slate-400/10',
    accentStripClass: 'bg-slate-400',
    badgeClass: 'border-slate-400/40 bg-slate-400/12 text-slate-400',
    iconClass: 'bg-slate-400/20 text-slate-600 dark:bg-slate-400/15 dark:text-slate-400',
    textClass: 'text-slate-600 dark:text-slate-400',
    selectedClass: 'border-slate-400/40 bg-slate-400/12',
    color: '#94A3B8'
  },
  cancelled: {
    label: 'Cancelled',
    cardClass: 'border-amber-400/30 bg-background dark:bg-slate-900/60 hover:border-amber-400/50 dark:hover:border-amber-400/40 shadow-sm hover:shadow-md hover:shadow-amber-400/5 dark:hover:shadow-amber-400/10',
    accentStripClass: 'bg-amber-400',
    badgeClass: 'border-amber-400/40 bg-amber-400/12 text-amber-400',
    iconClass: 'bg-amber-400/20 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
    textClass: 'text-amber-600 dark:text-amber-400',
    selectedClass: 'border-amber-400/40 bg-amber-400/12',
    color: '#FBBF24'
  },
  ignored: {
    label: 'Ignored',
    cardClass: 'border-orange-500/30 bg-background dark:bg-slate-900/60 hover:border-orange-500/50 dark:hover:border-orange-500/40 shadow-sm hover:shadow-md hover:shadow-orange-500/5 dark:hover:shadow-orange-500/10',
    accentStripClass: 'bg-orange-500',
    badgeClass: 'border-orange-500/40 bg-orange-500/12 text-orange-400',
    iconClass: 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
    textClass: 'text-orange-600 dark:text-orange-400',
    selectedClass: 'border-orange-500/40 bg-orange-500/12',
    color: '#F97316'
  },
  lost: {
    label: 'Lost',
    cardClass: 'border-red-500/30 bg-background dark:bg-slate-900/60 hover:border-red-500/50 dark:hover:border-red-500/40 shadow-sm hover:shadow-md hover:shadow-red-500/5 dark:hover:shadow-red-500/10',
    accentStripClass: 'bg-red-500',
    badgeClass: 'border-red-500/40 bg-red-500/12 text-red-400',
    iconClass: 'bg-red-500/20 text-red-600 dark:bg-red-500/15 dark:text-red-400',
    textClass: 'text-red-600 dark:text-red-400',
    selectedClass: 'border-red-500/40 bg-red-500/12',
    color: '#EF4444'
  }
}

/**
 * Normalize a raw status value from the database to a canonical CustomerStatus
 */
export function normalizeCustomerStatus(rawStatus: string | null | undefined): CustomerStatus {
  if (!rawStatus) return 'new'
  
  const status = rawStatus.toLowerCase().trim()
  
  // Direct canonical mappings only - no legacy translations
  if (status === 'new') return 'new'
  if (status === 'needs_reply') return 'needs_reply'
  if (status === 'active') return 'active'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'payment_requested') return 'payment_requested'
  if (status === 'paid') return 'paid'
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'ignored') return 'ignored'
  if (status === 'lost') return 'lost'

  // Log unknown values in development only
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[normalizeCustomerStatus] Unknown status value: "${rawStatus}", falling back to "new"`)
  }
  
  return 'new'
}

/**
 * Get the status style for a given raw status value
 */
export function getCustomerStatusStyle(rawStatus: string | null | undefined): CustomerStatusStyle {
  const canonicalStatus = normalizeCustomerStatus(rawStatus)
  return CUSTOMER_STATUS_STYLES[canonicalStatus]
}

/**
 * Get the display label for a raw status value
 */
export function getCustomerStatusLabel(rawStatus: string | null | undefined): string {
  return getCustomerStatusStyle(rawStatus).label
}

/**
 * Get the icon component for a raw status value
 */
export function getCustomerStatusIcon(rawStatus: string | null | undefined): any {
  const canonicalStatus = normalizeCustomerStatus(rawStatus)
  switch (canonicalStatus) {
    case 'new': return Phone
    case 'needs_reply': return MessageCircle
    case 'active': return MessageCircle
    case 'scheduled': return Calendar
    case 'payment_requested': return CreditCard
    case 'paid': return CheckSquare
    case 'completed': return Check
    case 'cancelled': return CircleX
    case 'ignored': return Clock
    case 'lost': return X
    default: return Phone
  }
}

/**
 * Get all canonical customer statuses
 */
export function getAllCustomerStatuses(): CustomerStatus[] {
  return Object.keys(CUSTOMER_STATUS_STYLES) as CustomerStatus[]
}

/**
 * Get workflow statuses (non-terminal states)
 */
export function getWorkflowStatuses(): CustomerStatus[] {
  return ['new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid', 'completed']
}

/**
 * Get terminal statuses (end states)
 */
export function getTerminalStatuses(): CustomerStatus[] {
  return ['cancelled', 'ignored', 'lost']
}
