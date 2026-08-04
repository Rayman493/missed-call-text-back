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
  selectedClass: string
}

/**
 * Canonical customer status configuration
 * Each status has one semantic color applied to all elements
 */
export const CUSTOMER_STATUS_STYLES: Record<CustomerStatus, CustomerStatusStyle> = {
  new: {
    label: 'New',
    cardClass: 'border-blue-500/14 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(59,130,246,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-blue-500/80 to-blue-500/60',
    badgeClass: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    iconClass: 'bg-blue-500/12 text-blue-300',
    selectedClass: 'border-blue-400/40 bg-blue-500/10'
  },
  needs_reply: {
    label: 'Needs Reply',
    cardClass: 'border-cyan-500/14 bg-gradient-to-br from-cyan-500/10 via-cyan-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(6,182,212,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-cyan-500/80 to-cyan-500/60',
    badgeClass: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
    iconClass: 'bg-cyan-500/12 text-cyan-300',
    selectedClass: 'border-cyan-400/40 bg-cyan-500/10'
  },
  active: {
    label: 'Active',
    cardClass: 'border-green-500/14 bg-gradient-to-br from-green-500/10 via-green-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(34,197,94,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-green-500/80 to-green-500/60',
    badgeClass: 'border-green-500/30 bg-green-500/10 text-green-300',
    iconClass: 'bg-green-500/12 text-green-300',
    selectedClass: 'border-green-400/40 bg-green-500/10'
  },
  scheduled: {
    label: 'Scheduled',
    cardClass: 'border-purple-500/14 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(168,85,247,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-purple-500/80 to-purple-500/60',
    badgeClass: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    iconClass: 'bg-purple-500/12 text-purple-300',
    selectedClass: 'border-purple-400/40 bg-purple-500/10'
  },
  payment_requested: {
    label: 'Payment Requested',
    cardClass: 'border-amber-500/14 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(245,158,11,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-amber-500/80 to-amber-500/60',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    iconClass: 'bg-amber-500/12 text-amber-300',
    selectedClass: 'border-amber-400/40 bg-amber-500/10'
  },
  paid: {
    label: 'Paid',
    cardClass: 'border-emerald-500/14 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(16,185,129,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-emerald-500/80 to-emerald-500/60',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    iconClass: 'bg-emerald-500/12 text-emerald-300',
    selectedClass: 'border-emerald-400/40 bg-emerald-500/10'
  },
  completed: {
    label: 'Completed',
    cardClass: 'border-slate-500/14 bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(100,116,139,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-slate-500/80 to-slate-500/60',
    badgeClass: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    iconClass: 'bg-slate-500/12 text-slate-300',
    selectedClass: 'border-slate-400/40 bg-slate-500/10'
  },
  ignored: {
    label: 'Ignored',
    cardClass: 'border-orange-500/14 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(249,115,22,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-orange-500/80 to-orange-500/60',
    badgeClass: 'border-orange-500/30 bg-orange-500/10 text-orange-300',
    iconClass: 'bg-orange-500/12 text-orange-300',
    selectedClass: 'border-orange-400/40 bg-orange-500/10'
  },
  lost: {
    label: 'Lost',
    cardClass: 'border-red-500/14 bg-gradient-to-br from-red-500/10 via-red-500/5 to-slate-900/95 shadow-[0_0_18px_rgba(239,68,68,0.05)]',
    accentStripClass: 'bg-gradient-to-r from-red-500/80 to-red-500/60',
    badgeClass: 'border-red-500/30 bg-red-500/10 text-red-300',
    iconClass: 'bg-red-500/12 text-red-300',
    selectedClass: 'border-red-400/40 bg-red-500/10'
  }
}

/**
 * Normalize a raw status value from the database to a canonical CustomerStatus
 */
export function normalizeCustomerStatus(rawStatus: string | null | undefined): CustomerStatus {
  if (!rawStatus) return 'new'
  
  const status = rawStatus.toLowerCase().trim()
  
  // Direct canonical mappings
  if (status === 'new') return 'new'
  if (status === 'needs_reply') return 'needs_reply'
  if (status === 'active') return 'active'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'payment_requested') return 'payment_requested'
  if (status === 'paid') return 'paid'
  if (status === 'completed') return 'completed'
  if (status === 'ignored') return 'ignored'
  if (status === 'lost') return 'lost'
  
  // Legacy mappings from production data
  if (status === 'awaiting response') return 'needs_reply'
  if (status === 'contacted') return 'active'
  if (status === 'appointment scheduled') return 'scheduled'
  if (status === 'archived') return 'completed'
  if (status === 'replied') return 'active'
  
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
