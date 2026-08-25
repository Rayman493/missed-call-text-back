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
  gradientClass: string // Subtle background gradient for premium SaaS feel
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
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-blue-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-blue-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-blue-500',
    badgeClass: 'border-blue-500/40 bg-blue-500/12 text-blue-400',
    iconClass: 'bg-blue-500/20 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
    textClass: 'text-blue-600 dark:text-blue-400',
    selectedClass: 'border-blue-500/40 bg-blue-500/12',
    color: '#3B82F6'
  },
  needs_reply: {
    label: 'Needs Reply',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-cyan-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-cyan-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-cyan-500',
    badgeClass: 'border-cyan-500/40 bg-cyan-500/12 text-cyan-400',
    iconClass: 'bg-cyan-500/20 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400',
    textClass: 'text-cyan-600 dark:text-cyan-400',
    selectedClass: 'border-cyan-500/40 bg-cyan-500/12',
    color: '#06B6D4'
  },
  active: {
    label: 'Active',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-green-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-green-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-green-500',
    badgeClass: 'border-green-500/40 bg-green-500/12 text-green-400',
    iconClass: 'bg-green-500/20 text-green-600 dark:bg-green-500/15 dark:text-green-400',
    textClass: 'text-green-600 dark:text-green-400',
    selectedClass: 'border-green-500/40 bg-green-500/12',
    color: '#22C55E'
  },
  scheduled: {
    label: 'Scheduled',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-purple-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-purple-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-purple-500',
    badgeClass: 'border-purple-500/40 bg-purple-500/12 text-purple-400',
    iconClass: 'bg-purple-500/20 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400',
    textClass: 'text-purple-600 dark:text-purple-400',
    selectedClass: 'border-purple-500/40 bg-purple-500/12',
    color: '#A855F7'
  },
  payment_requested: {
    label: 'Payment Requested',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-amber-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-amber-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-amber-500',
    badgeClass: 'border-amber-500/40 bg-amber-500/12 text-amber-400',
    iconClass: 'bg-amber-500/20 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    textClass: 'text-amber-700 dark:text-amber-400',
    selectedClass: 'border-amber-500/40 bg-amber-500/12',
    color: '#F59E0B'
  },
  paid: {
    label: 'Paid',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-emerald-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-emerald-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/12 text-emerald-400',
    iconClass: 'bg-emerald-500/20 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    textClass: 'text-emerald-600 dark:text-emerald-400',
    selectedClass: 'border-emerald-500/40 bg-emerald-500/12',
    color: '#10B981'
  },
  completed: {
    label: 'Completed',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-slate-400/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-slate-400/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-slate-400',
    badgeClass: 'border-slate-400/40 bg-slate-400/12 text-slate-400',
    iconClass: 'bg-slate-400/20 text-slate-600 dark:bg-slate-400/15 dark:text-slate-400',
    textClass: 'text-slate-600 dark:text-slate-400',
    selectedClass: 'border-slate-400/40 bg-slate-400/12',
    color: '#94A3B8'
  },
  cancelled: {
    label: 'Cancelled',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-amber-400/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-amber-400/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-amber-400',
    badgeClass: 'border-amber-400/40 bg-amber-400/12 text-amber-400',
    iconClass: 'bg-amber-400/20 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400',
    textClass: 'text-amber-600 dark:text-amber-400',
    selectedClass: 'border-amber-400/40 bg-amber-400/12',
    color: '#FBBF24'
  },
  ignored: {
    label: 'Ignored',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-orange-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-orange-500/[0.04] dark:to-slate-900/60',
    accentStripClass: 'bg-orange-500',
    badgeClass: 'border-orange-500/40 bg-orange-500/12 text-orange-400',
    iconClass: 'bg-orange-500/20 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400',
    textClass: 'text-orange-600 dark:text-orange-400',
    selectedClass: 'border-orange-500/40 bg-orange-500/12',
    color: '#F97316'
  },
  lost: {
    label: 'Lost',
    cardClass: 'border-border/30 bg-background dark:bg-slate-900/60 hover:border-border/50 dark:hover:border-border/40 shadow-sm hover:shadow-md',
    gradientClass: 'bg-gradient-to-br from-slate-50/90 via-red-500/[0.04] to-slate-50/90 dark:from-slate-900/60 dark:via-red-500/[0.04] dark:to-slate-900/60',
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
