/**
 * Centralized status color mapping for customer cards
 * Provides accent colors, border colors, and badge styles for each status
 * 
 * Semantic color system:
 * - New: Blue (new lead waiting for first contact)
 * - Active: Emerald (conversation in progress)
 * - Scheduled: Violet (appointment booked)
 * - Payment Requested: Amber (waiting on customer payment)
 * - Paid: Green (payment received)
 * - Completed: Sky (job finished successfully)
 * - Lost: Red (customer declined or opportunity lost)
 * - Ignored: Slate (customer ignored)
 */

import { LeadLifecycleStatus } from '@/lib/lead-lifecycle'

export interface StatusColorConfig {
  // Accent color (4px left border, icons, text)
  accent: string
  // Subtle border tint (border-{color}/20)
  border: string
  // Left border class for card accent
  borderLeft: string
  // Badge background color
  badgeBg: string
  // Badge text color
  badgeText: string
  // Badge border color
  badgeBorder: string
  // Text color for dropdown icons and labels
  text: string
  // Icon background color for dropdown
  iconBg: string
}

export const statusColorMap: Record<LeadLifecycleStatus, StatusColorConfig> = {
  'new': {
    accent: 'bg-blue-400',
    border: 'border-blue-500/20',
    borderLeft: 'border-l-blue-400',
    badgeBg: 'bg-blue-500/10 dark:bg-blue-400/10',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'ring-1 ring-inset ring-blue-500/20 dark:ring-blue-400/20',
    text: 'text-blue-400',
    iconBg: 'bg-blue-500/10 dark:bg-blue-400/10'
  },
  'active': {
    accent: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    borderLeft: 'border-l-emerald-400',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20',
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/10'
  },
  'scheduled': {
    accent: 'bg-violet-400',
    border: 'border-violet-500/20',
    borderLeft: 'border-l-violet-400',
    badgeBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20',
    text: 'text-violet-400',
    iconBg: 'bg-violet-500/10 dark:bg-violet-400/10'
  },
  'payment_requested': {
    accent: 'bg-amber-400',
    border: 'border-amber-500/20',
    borderLeft: 'border-l-amber-400',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20',
    text: 'text-amber-400',
    iconBg: 'bg-amber-500/10 dark:bg-amber-400/10'
  },
  'paid': {
    accent: 'bg-green-400',
    border: 'border-green-500/20',
    borderLeft: 'border-l-green-400',
    badgeBg: 'bg-green-500/10 dark:bg-green-400/10',
    badgeText: 'text-green-700 dark:text-green-300',
    badgeBorder: 'ring-1 ring-inset ring-green-500/20 dark:ring-green-400/20',
    text: 'text-green-400',
    iconBg: 'bg-green-500/10 dark:bg-green-400/10'
  },
  'completed': {
    accent: 'bg-sky-400',
    border: 'border-sky-500/20',
    borderLeft: 'border-l-sky-400',
    badgeBg: 'bg-sky-500/10 dark:bg-sky-400/10',
    badgeText: 'text-sky-700 dark:text-sky-300',
    badgeBorder: 'ring-1 ring-inset ring-sky-500/20 dark:ring-sky-400/20',
    text: 'text-sky-400',
    iconBg: 'bg-sky-500/10 dark:bg-sky-400/10'
  },
  'lost': {
    accent: 'bg-red-400',
    border: 'border-red-500/20',
    borderLeft: 'border-l-red-400',
    badgeBg: 'bg-red-500/10 dark:bg-red-400/10',
    badgeText: 'text-red-700 dark:text-red-300',
    badgeBorder: 'ring-1 ring-inset ring-red-500/20 dark:ring-red-400/20',
    text: 'text-red-400',
    iconBg: 'bg-red-500/10 dark:bg-red-400/10'
  },
  'ignored': {
    accent: 'bg-slate-400',
    border: 'border-slate-500/20',
    borderLeft: 'border-l-slate-400',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20',
    text: 'text-slate-400',
    iconBg: 'bg-slate-500/10 dark:bg-slate-400/10'
  }
}

// Legacy status mappings for backward compatibility (not typed as LeadLifecycleStatus)
const legacyStatusMap: Record<string, StatusColorConfig> = {
  'Awaiting Response': {
    accent: 'bg-amber-400',
    border: 'border-amber-500/20',
    borderLeft: 'border-l-amber-400',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20',
    text: 'text-amber-400',
    iconBg: 'bg-amber-500/10 dark:bg-amber-400/10'
  },
  'Contacted': {
    accent: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    borderLeft: 'border-l-emerald-400',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20',
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/10'
  },
  'Appointment Scheduled': {
    accent: 'bg-violet-400',
    border: 'border-violet-500/20',
    borderLeft: 'border-l-violet-400',
    badgeBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20',
    text: 'text-violet-400',
    iconBg: 'bg-violet-500/10 dark:bg-violet-400/10'
  },
  'Archived': {
    accent: 'bg-slate-300',
    border: 'border-slate-500/20',
    borderLeft: 'border-l-slate-300',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20',
    text: 'text-slate-400',
    iconBg: 'bg-slate-500/10 dark:bg-slate-400/10'
  }
}

/**
 * Get color configuration for a given status
 * Falls back to a neutral gray if status not found
 */
export function getStatusColorConfig(status: string): StatusColorConfig {
  // Check if status is a LeadLifecycleStatus
  if (status in statusColorMap) {
    return statusColorMap[status as LeadLifecycleStatus]
  }
  
  // Check legacy status map
  if (status in legacyStatusMap) {
    return legacyStatusMap[status]
  }
  
  // Fallback to neutral gray
  return {
    accent: 'bg-slate-300',
    border: 'border-slate-500/20',
    borderLeft: 'border-l-slate-300',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20',
    text: 'text-slate-400',
    iconBg: 'bg-slate-500/10 dark:bg-slate-400/10'
  }
}

/**
 * Get complete badge classes for a status
 */
export function getStatusBadgeClasses(status: string): string {
  const config = getStatusColorConfig(status)
  return `inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 ${config.badgeBg} ${config.badgeText} ${config.badgeBorder}`
}

/**
 * Get card border classes for a status
 * Returns the subtle border tint
 */
export function getCardBorderClasses(status: string): string {
  const config = getStatusColorConfig(status)
  return config.border
}

/**
 * Get card accent border classes for a status
 * Returns the left border class for the 4px accent stripe
 */
export function getCardAccentBorderClasses(status: string): string {
  const config = getStatusColorConfig(status)
  return `border-l-4 ${config.borderLeft}`
}
