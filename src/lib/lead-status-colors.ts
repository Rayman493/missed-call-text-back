/**
 * Centralized status color mapping for customer cards
 * Provides accent colors, border colors, and badge styles for each status
 * 
 * Semantic color system:
 * - New: Blue (new lead waiting for first contact)
 * - Active: Emerald (conversation in progress)
 * - Scheduled: Violet (appointment booked)
 * - Payment Requested: Amber (waiting on customer payment)
 * - Paid: Teal (payment received)
 * - Completed: Slate (job finished successfully)
 * - Lost: Red (customer declined or opportunity lost)
 */

export interface StatusColorConfig {
  // Accent color (4px left border, icons, text)
  accent: string
  // Subtle border tint (border-{color}/20)
  border: string
  // Badge background color
  badgeBg: string
  // Badge text color
  badgeText: string
  // Badge border color
  badgeBorder: string
}

const statusColorMap: Record<string, StatusColorConfig> = {
  'new': {
    accent: 'bg-blue-400',
    border: 'border-blue-500/20',
    badgeBg: 'bg-blue-500/10 dark:bg-blue-400/10',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'ring-1 ring-inset ring-blue-500/20 dark:ring-blue-400/20'
  },
  'active': {
    accent: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20'
  },
  'scheduled': {
    accent: 'bg-violet-400',
    border: 'border-violet-500/20',
    badgeBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20'
  },
  'payment_requested': {
    accent: 'bg-amber-400',
    border: 'border-amber-500/20',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20'
  },
  'paid': {
    accent: 'bg-teal-400',
    border: 'border-teal-500/20',
    badgeBg: 'bg-teal-500/10 dark:bg-teal-400/10',
    badgeText: 'text-teal-700 dark:text-teal-300',
    badgeBorder: 'ring-1 ring-inset ring-teal-500/20 dark:ring-teal-400/20'
  },
  'completed': {
    accent: 'bg-slate-300',
    border: 'border-slate-500/20',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20'
  },
  'lost': {
    accent: 'bg-red-400',
    border: 'border-red-500/20',
    badgeBg: 'bg-red-500/10 dark:bg-red-400/10',
    badgeText: 'text-red-700 dark:text-red-300',
    badgeBorder: 'ring-1 ring-inset ring-red-500/20 dark:ring-red-400/20'
  },
  'ignored': {
    accent: 'bg-red-400',
    border: 'border-red-500/20',
    badgeBg: 'bg-red-500/10 dark:bg-red-400/10',
    badgeText: 'text-red-700 dark:text-red-300',
    badgeBorder: 'ring-1 ring-inset ring-red-500/20 dark:ring-red-400/20'
  },
  // Legacy status mappings for backward compatibility
  'Awaiting Response': {
    accent: 'bg-amber-400',
    border: 'border-amber-500/20',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20'
  },
  'Contacted': {
    accent: 'bg-emerald-400',
    border: 'border-emerald-500/20',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20'
  },
  'Appointment Scheduled': {
    accent: 'bg-violet-400',
    border: 'border-violet-500/20',
    badgeBg: 'bg-violet-500/10 dark:bg-violet-400/10',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBorder: 'ring-1 ring-inset ring-violet-500/20 dark:ring-violet-400/20'
  },
  'Archived': {
    accent: 'bg-slate-300',
    border: 'border-slate-500/20',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20'
  }
}

/**
 * Get color configuration for a given status
 * Falls back to a neutral gray if status not found
 */
export function getStatusColorConfig(status: string): StatusColorConfig {
  return statusColorMap[status] || {
    accent: 'bg-slate-300',
    border: 'border-slate-500/20',
    badgeBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    badgeText: 'text-slate-700 dark:text-slate-300',
    badgeBorder: 'ring-1 ring-inset ring-slate-500/20 dark:ring-slate-400/20'
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
 * Get card accent classes for a status
 * Returns the accent color for the 4px left border
 */
export function getCardAccentClasses(status: string): string {
  const config = getStatusColorConfig(status)
  return config.accent
}

/**
 * Get card border classes for a status
 * Returns the subtle border tint
 */
export function getCardBorderClasses(status: string): string {
  const config = getStatusColorConfig(status)
  return config.border
}
