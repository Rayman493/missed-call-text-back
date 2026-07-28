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
 * - Completed: Slate (job finished successfully)
 * - Lost: Red (customer declined or opportunity lost)
 * - Ignored: Slate (customer ignored)
 */

import { LeadLifecycleStatus } from '@/lib/lead-lifecycle'

export interface StatusColorConfig {
  // Accent color (4px left border, icons, text)
  accent: string
  // Subtle border tint (border-{color}/20)
  border: string
  // Accent color for pseudo-element (RGB values for inset shadow or background)
  accentColor: string
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
    accentColor: 'rgb(96 165 250)',
    badgeBg: 'bg-blue-500/10 dark:bg-blue-400/10',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'ring-1 ring-inset ring-blue-500/20 dark:ring-blue-400/20',
    text: 'text-blue-400',
    iconBg: 'bg-blue-500/10 dark:bg-blue-400/10'
  },
  'active': {
    accent: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    accentColor: 'rgb(52 211 153)',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20',
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/10'
  },
  'scheduled': {
    accent: 'bg-violet-400',
    border: 'border-violet-500/20',
    accentColor: 'rgb(192 132 252)',
    badgeBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20',
    text: 'text-violet-400',
    iconBg: 'bg-violet-500/10 dark:bg-violet-400/10'
  },
  'payment_requested': {
    accent: 'bg-amber-400',
    border: 'border-amber-500/20',
    accentColor: 'rgb(251 191 36)',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20',
    text: 'text-amber-400',
    iconBg: 'bg-amber-500/10 dark:bg-amber-400/10'
  },
  'paid': {
    accent: 'bg-green-400',
    border: 'border-green-500/20',
    accentColor: 'rgb(74 222 128)',
    badgeBg: 'bg-green-500/10 dark:bg-green-400/10',
    badgeText: 'text-green-700 dark:text-green-300',
    badgeBorder: 'ring-1 ring-inset ring-green-500/20 dark:ring-green-400/20',
    text: 'text-green-400',
    iconBg: 'bg-green-500/10 dark:bg-green-400/10'
  },
  'completed': {
    accent: 'bg-slate-400',
    border: 'border-slate-500/20',
    accentColor: 'rgb(148 163 184)',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20',
    text: 'text-slate-400',
    iconBg: 'bg-slate-500/10 dark:bg-slate-400/10'
  },
  'lost': {
    accent: 'bg-red-400',
    border: 'border-red-500/20',
    accentColor: 'rgb(248 113 113)',
    badgeBg: 'bg-red-500/10 dark:bg-red-400/10',
    badgeText: 'text-red-700 dark:text-red-300',
    badgeBorder: 'ring-1 ring-inset ring-red-500/20 dark:ring-red-400/20',
    text: 'text-red-400',
    iconBg: 'bg-red-500/10 dark:bg-red-400/10'
  },
  'ignored': {
    accent: 'bg-slate-400',
    border: 'border-slate-500/20',
    accentColor: 'rgb(148 163 184)',
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
    accentColor: 'rgb(251 191 36)',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20',
    text: 'text-amber-400',
    iconBg: 'bg-amber-500/10 dark:bg-amber-400/10'
  },
  'Contacted': {
    accent: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    accentColor: 'rgb(52 211 153)',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20',
    text: 'text-emerald-400',
    iconBg: 'bg-emerald-500/10 dark:bg-emerald-400/10'
  },
  'Appointment Scheduled': {
    accent: 'bg-violet-400',
    border: 'border-violet-500/20',
    accentColor: 'rgb(192 132 252)',
    badgeBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20',
    text: 'text-violet-400',
    iconBg: 'bg-violet-500/10 dark:bg-violet-400/10'
  },
  'Archived': {
    accent: 'bg-slate-300',
    border: 'border-slate-500/20',
    accentColor: 'rgb(203 213 225)',
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
    accentColor: 'rgb(203 213 225)',
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
 * Get card accent pseudo-element classes for a status
 * Returns classes for the left accent stripe using before: pseudo-element
 */
export function getCardAccentClasses(status: string): string {
  const config = getStatusColorConfig(status)
  const accentMap: Record<string, string> = {
    'rgb(96 165 250)': 'before:bg-blue-400',
    'rgb(52 211 153)': 'before:bg-emerald-400',
    'rgb(192 132 252)': 'before:bg-violet-400',
    'rgb(251 191 36)': 'before:bg-amber-400',
    'rgb(74 222 128)': 'before:bg-green-400',
    'rgb(148 163 184)': 'before:bg-slate-400',
    'rgb(248 113 113)': 'before:bg-red-400',
    'rgb(203 213 225)': 'before:bg-slate-300'
  }
  const bgClass = accentMap[config.accentColor] || 'before:bg-slate-400'
  return `before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full before:pointer-events-none ${bgClass}`
}
