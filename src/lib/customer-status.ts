/**
 * Canonical Customer Status Model
 * Single source of truth for all customer status presentation
 * 
 * This file consolidates:
 * - Status normalization
 * - Display labels
 * - Icons
 * - Badge classes
 * - Card styling (gradient, border, accent)
 * - Text colors
 * - Selected menu state
 * 
 * All status-driven components must consume this model.
 */

import { Phone, MessageCircle, Calendar, CreditCard, CheckSquare, Check, X, Clock } from 'lucide-react'

/**
 * Canonical customer status enum
 * These are the only valid status values that should exist in the system
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
 * Complete presentation configuration for a customer status
 * All Tailwind classes are static strings to ensure production build inclusion
 */
export interface CustomerStatusConfig {
  // Display label (user-facing)
  label: string
  // Short description
  description: string
  // Icon component
  icon: any
  // Badge classes (complete static string)
  badgeClass: string
  // Card gradient classes (complete static string)
  cardGradientClass: string
  // Card border classes (complete static string)
  cardBorderClass: string
  // Card accent/left border classes (complete static string)
  cardAccentClass: string
  // Text color for dropdown and labels
  textClass: string
  // Icon background class for dropdown
  iconBgClass: string
  // Selected menu state class
  selectedClass: string
  // Filter label (for filter UI)
  filterLabel: string
}

/**
 * Canonical customer status configuration
 * Every status has all presentation data defined here
 * 
 * Color scheme:
 * - New: blue
 * - Needs Reply: cyan/sky
 * - Active: green/emerald
 * - Scheduled: indigo/violet
 * - Payment Requested: amber
 * - Paid: teal/emerald
 * - Completed: slate
 * - Ignored: orange
 * - Lost: red
 */
export const CUSTOMER_STATUS_CONFIG: Record<CustomerStatus, CustomerStatusConfig> = {
  new: {
    label: 'New',
    description: 'Recently received missed call',
    icon: Phone,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-blue-500/10 dark:bg-blue-400/10 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-500/20 dark:ring-blue-400/20',
    cardGradientClass: 'bg-gradient-to-br from-blue-500/5 via-blue-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-blue-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-blue-400',
    textClass: 'text-blue-400',
    iconBgClass: 'bg-blue-500/10 dark:bg-blue-400/10',
    selectedClass: 'bg-blue-50 dark:bg-blue-950/30',
    filterLabel: 'New'
  },
  needs_reply: {
    label: 'Needs Reply',
    description: 'Waiting for response',
    icon: MessageCircle,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-sky-500/10 dark:bg-sky-400/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-500/20 dark:ring-sky-400/20',
    cardGradientClass: 'bg-gradient-to-br from-sky-500/5 via-sky-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-sky-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-sky-400',
    textClass: 'text-sky-400',
    iconBgClass: 'bg-sky-500/10 dark:bg-sky-400/10',
    selectedClass: 'bg-sky-50 dark:bg-sky-950/30',
    filterLabel: 'Needs Reply'
  },
  active: {
    label: 'Active',
    description: 'Conversation in progress',
    icon: MessageCircle,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20',
    cardGradientClass: 'bg-gradient-to-br from-emerald-500/5 via-emerald-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-emerald-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-emerald-400',
    textClass: 'text-emerald-400',
    iconBgClass: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    selectedClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    filterLabel: 'Active'
  },
  scheduled: {
    label: 'Scheduled',
    description: 'Appointment scheduled',
    icon: Calendar,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-violet-500/10 dark:bg-violet-400/10 text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20',
    cardGradientClass: 'bg-gradient-to-br from-violet-500/5 via-violet-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-violet-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-violet-400',
    textClass: 'text-violet-400',
    iconBgClass: 'bg-violet-500/10 dark:bg-violet-400/10',
    selectedClass: 'bg-violet-50 dark:bg-violet-950/30',
    filterLabel: 'Scheduled'
  },
  payment_requested: {
    label: 'Payment Requested',
    description: 'Payment request sent',
    icon: CreditCard,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-amber-500/10 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20',
    cardGradientClass: 'bg-gradient-to-br from-amber-500/5 via-amber-500/10 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-amber-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-amber-400',
    textClass: 'text-amber-400',
    iconBgClass: 'bg-amber-500/10 dark:bg-amber-400/10',
    selectedClass: 'bg-amber-50 dark:bg-amber-950/30',
    filterLabel: 'Payment Requested'
  },
  paid: {
    label: 'Paid',
    description: 'Payment received',
    icon: CheckSquare,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-teal-500/10 dark:bg-teal-400/10 text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-teal-500/20 dark:ring-teal-400/20',
    cardGradientClass: 'bg-gradient-to-br from-teal-500/5 via-teal-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-teal-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-teal-400',
    textClass: 'text-teal-400',
    iconBgClass: 'bg-teal-500/10 dark:bg-teal-400/10',
    selectedClass: 'bg-teal-50 dark:bg-teal-950/30',
    filterLabel: 'Paid'
  },
  completed: {
    label: 'Completed',
    description: 'Handled and resolved',
    icon: Check,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-slate-500/20 dark:bg-slate-400/20 text-slate-700 dark:text-slate-300 ring-1 ring-inset ring-slate-400/30 dark:ring-slate-400/30',
    cardGradientClass: 'bg-gradient-to-br from-slate-500/5 via-slate-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-slate-400/30',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-slate-400',
    textClass: 'text-slate-300',
    iconBgClass: 'bg-slate-500/20 dark:bg-slate-400/20',
    selectedClass: 'bg-slate-50 dark:bg-slate-800/50',
    filterLabel: 'Completed'
  },
  ignored: {
    label: 'Ignored',
    description: 'Customer ignored',
    icon: Clock,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-orange-500/10 dark:bg-orange-400/10 text-orange-700 dark:text-orange-300 ring-1 ring-inset ring-orange-500/20 dark:ring-orange-400/20',
    cardGradientClass: 'bg-gradient-to-br from-orange-500/5 via-orange-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-orange-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-orange-400',
    textClass: 'text-orange-400',
    iconBgClass: 'bg-orange-500/10 dark:bg-orange-400/10',
    selectedClass: 'bg-orange-50 dark:bg-orange-950/30',
    filterLabel: 'Ignored'
  },
  lost: {
    label: 'Lost',
    description: 'Customer lost',
    icon: X,
    badgeClass: 'inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 bg-red-500/10 dark:bg-red-400/10 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-500/20 dark:ring-red-400/20',
    cardGradientClass: 'bg-gradient-to-br from-red-500/5 via-red-500/5 to-slate-50/50 dark:to-slate-900/50',
    cardBorderClass: 'border-red-500/20',
    cardAccentClass: 'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none before:bg-red-400',
    textClass: 'text-red-400',
    iconBgClass: 'bg-red-500/10 dark:bg-red-400/10',
    selectedClass: 'bg-red-50 dark:bg-red-950/30',
    filterLabel: 'Lost'
  }
}

/**
 * Normalize a raw status value from the database to a canonical CustomerStatus
 * Handles legacy values, case variations, and unknown values
 */
export function normalizeCustomerStatus(rawStatus: string | null | undefined): CustomerStatus {
  if (!rawStatus) return 'new'
  
  const status = rawStatus.toLowerCase().trim()
  
  // Direct canonical mappings
  if (status === 'new') return 'new'
  if (status === 'needs_reply') return 'needs_reply'
  if (status === 'active') return 'active'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'payment_requested') return 'paid' // Legacy: payment_requested often means paid
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
  
  // Snake case variations
  if (status === 'payment_requested') return 'payment_requested'
  
  // Log unknown values in development only
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[normalizeCustomerStatus] Unknown status value: "${rawStatus}", falling back to "new"`)
  }
  
  // Fallback to 'new' for unknown values
  return 'new'
}

/**
 * Get the status configuration for a given raw status value
 * This is the main entry point for components to get status presentation data
 */
export function getCustomerStatusConfig(rawStatus: string | null | undefined): CustomerStatusConfig {
  const canonicalStatus = normalizeCustomerStatus(rawStatus)
  return CUSTOMER_STATUS_CONFIG[canonicalStatus]
}

/**
 * Get the display label for a raw status value
 */
export function getCustomerStatusLabel(rawStatus: string | null | undefined): string {
  return getCustomerStatusConfig(rawStatus).label
}

/**
 * Get the icon component for a raw status value
 */
export function getCustomerStatusIcon(rawStatus: string | null | undefined): any {
  return getCustomerStatusConfig(rawStatus).icon
}

/**
 * Get all canonical customer statuses
 */
export function getAllCustomerStatuses(): CustomerStatus[] {
  return Object.keys(CUSTOMER_STATUS_CONFIG) as CustomerStatus[]
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
