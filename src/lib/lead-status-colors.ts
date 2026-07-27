/**
 * Centralized status color mapping for customer cards
 * Provides accent colors, border colors, and badge styles for each status
 */

export interface StatusColorConfig {
  // Accent border color (left border, 3-4px)
  accentBorder: string
  // Subtle glow color (5-10% opacity, soft blur)
  glow: string
  // Badge background color
  badgeBg: string
  // Badge text color
  badgeText: string
  // Badge border color
  badgeBorder: string
}

const statusColorMap: Record<string, StatusColorConfig> = {
  'New': {
    accentBorder: 'border-l-blue-500 dark:border-l-blue-400',
    glow: 'shadow-[0_0_0_1px_rgba(59,130,246,0.05),0_4px_12px_rgba(59,130,246,0.08)] dark:shadow-[0_0_0_1px_rgba(96,165,250,0.05),0_4px_12px_rgba(96,165,250,0.08)]',
    badgeBg: 'bg-blue-500/10 dark:bg-blue-400/10',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBorder: 'ring-1 ring-inset ring-blue-500/20 dark:ring-blue-400/20'
  },
  'Awaiting Response': {
    accentBorder: 'border-l-amber-500 dark:border-l-amber-400',
    glow: 'shadow-[0_0_0_1px_rgba(245,158,11,0.05),0_4px_12px_rgba(245,158,11,0.08)] dark:shadow-[0_0_0_1px_rgba(251,191,36,0.05),0_4px_12px_rgba(251,191,36,0.08)]',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBorder: 'ring-1 ring-inset ring-amber-500/20 dark:ring-amber-400/20'
  },
  'Contacted': {
    accentBorder: 'border-l-emerald-500 dark:border-l-emerald-400',
    glow: 'shadow-[0_0_0_1px_rgba(16,185,129,0.05),0_4px_12px_rgba(16,185,129,0.08)] dark:shadow-[0_0_0_1px_rgba(52,211,153,0.05),0_4px_12px_rgba(52,211,153,0.08)]',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20'
  },
  // Additional statuses for future use
  'Appointment Scheduled': {
    accentBorder: 'border-l-purple-500 dark:border-l-purple-400',
    glow: 'shadow-[0_0_0_1px_rgba(168,85,247,0.05),0_4px_12px_rgba(168,85,247,0.08)] dark:shadow-[0_0_0_1px_rgba(192,132,252,0.05),0_4px_12px_rgba(192,132,252,0.08)]',
    badgeBg: 'bg-purple-500/10 dark:bg-purple-400/10',
    badgeText: 'text-purple-700 dark:text-purple-300',
    badgeBorder: 'ring-1 ring-inset ring-purple-500/20 dark:ring-purple-400/20'
  },
  'Payment Requested': {
    accentBorder: 'border-l-cyan-500 dark:border-l-cyan-400',
    glow: 'shadow-[0_0_0_1px_rgba(6,182,212,0.05),0_4px_12px_rgba(6,182,212,0.08)] dark:shadow-[0_0_0_1px_rgba(34,211,238,0.05),0_4px_12px_rgba(34,211,238,0.08)]',
    badgeBg: 'bg-cyan-500/10 dark:bg-cyan-400/10',
    badgeText: 'text-cyan-700 dark:text-cyan-300',
    badgeBorder: 'ring-1 ring-inset ring-cyan-500/20 dark:ring-cyan-400/20'
  },
  'Paid': {
    accentBorder: 'border-l-emerald-500 dark:border-l-emerald-400',
    glow: 'shadow-[0_0_0_1px_rgba(16,185,129,0.05),0_4px_12px_rgba(16,185,129,0.08)] dark:shadow-[0_0_0_1px_rgba(52,211,153,0.05),0_4px_12px_rgba(52,211,153,0.08)]',
    badgeBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBorder: 'ring-1 ring-inset ring-emerald-500/20 dark:ring-emerald-400/20'
  },
  'Completed': {
    accentBorder: 'border-l-green-500 dark:border-l-green-400',
    glow: 'shadow-[0_0_0_1px_rgba(34,197,94,0.05),0_4px_12px_rgba(34,197,94,0.08)] dark:shadow-[0_0_0_1px_rgba(74,222,128,0.05),0_4px_12px_rgba(74,222,128,0.08)]',
    badgeBg: 'bg-green-500/10 dark:bg-green-400/10',
    badgeText: 'text-green-700 dark:text-green-300',
    badgeBorder: 'ring-1 ring-inset ring-green-500/20 dark:ring-green-400/20'
  },
  'Archived': {
    accentBorder: 'border-l-slate-500 dark:border-l-slate-400',
    glow: 'shadow-[0_0_0_1px_rgba(100,116,139,0.05),0_4px_12px_rgba(100,116,139,0.08)] dark:shadow-[0_0_0_1px_rgba(148,163,184,0.05),0_4px_12px_rgba(148,163,184,0.08)]',
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
    accentBorder: 'border-l-slate-400 dark:border-l-slate-500',
    glow: 'shadow-[0_0_0_1px_rgba(148,163,184,0.05),0_4px_12px_rgba(148,163,184,0.08)]',
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
 * Includes left border and subtle glow
 */
export function getCardAccentClasses(status: string): string {
  const config = getStatusColorConfig(status)
  return `border-l-4 ${config.accentBorder} ${config.glow}`
}
