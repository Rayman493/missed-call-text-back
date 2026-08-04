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

import { Phone, MessageCircle, Calendar, CreditCard, CheckSquare, Check, X, Clock } from 'lucide-react'

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
}

/**
 * Canonical customer status configuration
 * Each status has one semantic color applied to all elements
 */
export const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, CustomerStatusStyle> = {
  new: {
    label: 'New',
    cardClass: 'border-blue-500/35 bg-gradient-to-br from-blue-500/22 via-blue-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(59,130,246,0.10)]',
    accentStripClass: 'bg-blue-500',
    badgeClass: 'border-blue-500/35 bg-blue-500/12 text-blue-400',
    iconClass: 'bg-blue-500/15 text-blue-400',
    textClass: 'text-blue-400',
    selectedClass: 'border-blue-500/35 bg-blue-500/12'
  },
  needs_reply: {
    label: 'Needs Reply',
    cardClass: 'border-cyan-500/35 bg-gradient-to-br from-cyan-500/22 via-cyan-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(6,182,212,0.10)]',
    accentStripClass: 'bg-cyan-500',
    badgeClass: 'border-cyan-500/35 bg-cyan-500/12 text-cyan-400',
    iconClass: 'bg-cyan-500/15 text-cyan-400',
    textClass: 'text-cyan-400',
    selectedClass: 'border-cyan-500/35 bg-cyan-500/12'
  },
  active: {
    label: 'Active',
    cardClass: 'border-green-500/35 bg-gradient-to-br from-green-500/22 via-green-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(34,197,94,0.10)]',
    accentStripClass: 'bg-green-500',
    badgeClass: 'border-green-500/35 bg-green-500/12 text-green-400',
    iconClass: 'bg-green-500/15 text-green-400',
    textClass: 'text-green-400',
    selectedClass: 'border-green-500/35 bg-green-500/12'
  },
  scheduled: {
    label: 'Scheduled',
    cardClass: 'border-purple-500/35 bg-gradient-to-br from-purple-500/22 via-purple-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(168,85,247,0.10)]',
    accentStripClass: 'bg-purple-500',
    badgeClass: 'border-purple-500/35 bg-purple-500/12 text-purple-400',
    iconClass: 'bg-purple-500/15 text-purple-400',
    textClass: 'text-purple-400',
    selectedClass: 'border-purple-500/35 bg-purple-500/12'
  },
  payment_requested: {
    label: 'Payment Requested',
    cardClass: 'border-amber-500/35 bg-gradient-to-br from-amber-500/22 via-amber-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(245,158,11,0.10)]',
    accentStripClass: 'bg-amber-500',
    badgeClass: 'border-amber-500/35 bg-amber-500/12 text-amber-400',
    iconClass: 'bg-amber-500/15 text-amber-400',
    textClass: 'text-amber-400',
    selectedClass: 'border-amber-500/35 bg-amber-500/12'
  },
  paid: {
    label: 'Paid',
    cardClass: 'border-emerald-500/35 bg-gradient-to-br from-emerald-500/22 via-emerald-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(16,185,129,0.10)]',
    accentStripClass: 'bg-emerald-500',
    badgeClass: 'border-emerald-500/35 bg-emerald-500/12 text-emerald-400',
    iconClass: 'bg-emerald-500/15 text-emerald-400',
    textClass: 'text-emerald-400',
    selectedClass: 'border-emerald-500/35 bg-emerald-500/12'
  },
  completed: {
    label: 'Completed',
    cardClass: 'border-slate-400/35 bg-gradient-to-br from-slate-400/22 via-slate-400/10 to-slate-900/95 shadow-[0_0_18px_rgba(148,163,184,0.10)]',
    accentStripClass: 'bg-slate-400',
    badgeClass: 'border-slate-400/35 bg-slate-400/12 text-slate-400',
    iconClass: 'bg-slate-400/15 text-slate-400',
    textClass: 'text-slate-400',
    selectedClass: 'border-slate-400/35 bg-slate-400/12'
  },
  ignored: {
    label: 'Ignored',
    cardClass: 'border-orange-500/35 bg-gradient-to-br from-orange-500/22 via-orange-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(249,115,22,0.10)]',
    accentStripClass: 'bg-orange-500',
    badgeClass: 'border-orange-500/35 bg-orange-500/12 text-orange-400',
    iconClass: 'bg-orange-500/15 text-orange-400',
    textClass: 'text-orange-400',
    selectedClass: 'border-orange-500/35 bg-orange-500/12'
  },
  lost: {
    label: 'Lost',
    cardClass: 'border-red-500/35 bg-gradient-to-br from-red-500/22 via-red-500/10 to-slate-900/95 shadow-[0_0_18px_rgba(239,68,68,0.10)]',
    accentStripClass: 'bg-red-500',
    badgeClass: 'border-red-500/35 bg-red-500/12 text-red-400',
    iconClass: 'bg-red-500/15 text-red-400',
    textClass: 'text-red-400',
    selectedClass: 'border-red-500/35 bg-red-500/12'
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
  return ['ignored', 'lost']
}
