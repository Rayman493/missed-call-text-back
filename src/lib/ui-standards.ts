/**
 * UI Standards for ReplyFlow
 * 
 * This file contains standardized utility classes and patterns for consistent UI/UX
 * across the application. Use these constants and helpers to maintain consistency.
 */

// Shadow Standards
export const shadows = {
  sm: 'shadow-sm',
  md: 'shadow-md',
  hover: 'hover:shadow-md',
} as const

// Border Standards
export const borders = {
  opacity: 'border-border/50',
  radius: {
    sm: 'rounded-lg',
    md: 'rounded-xl',
    lg: 'rounded-2xl',
    full: 'rounded-full',
  },
  divider: 'border-border/50',
} as const

// Typography Standards
export const typography = {
  sectionTitle: 'text-lg font-semibold text-foreground',
  cardTitle: 'text-base font-semibold text-foreground',
  label: 'text-sm font-medium text-foreground',
  helperText: 'text-xs text-muted-foreground',
  body: 'text-sm text-foreground',
} as const

// Icon Standards
export const icons = {
  small: 'w-4 h-4',
  standard: 'w-5 h-5',
  large: 'w-6 h-6',
  stroke: 'stroke-[1.5]',
  strokeThick: 'stroke-2',
} as const

// Micro-interaction Standards
export const microInteractions = {
  button: `
    transition-all duration-200
    hover:translate-y-[-1px]
    active:scale-[0.98]
    focus:outline-none
    focus:ring-2
    focus:ring-blue-500/40
    disabled:opacity-50
    disabled:cursor-not-allowed
  `,
  card: `
    transition-all duration-200
    hover:shadow-md
  `,
  interactive: `
    transition-all duration-200
    hover:bg-muted/50
    active:scale-[0.98]
    focus:outline-none
    focus:ring-2
    focus:ring-blue-500/40
  `,
  link: `
    transition-colors duration-200
    hover:text-foreground
    focus:outline-none
    focus:ring-2
    focus:ring-blue-500/40
  `,
} as const

// Spacing Standards
export const spacing = {
  card: 'p-4 sm:p-5',
  section: 'space-y-4',
  list: 'space-y-3',
  compact: 'space-y-2',
} as const

// Status Chip Standards
export const statusChips = {
  base: 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
  pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50',
  paid: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/50',
  cancelled: 'bg-gray-100 dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700/50',
  expired: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50',
  failed: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50',
  success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/50',
  warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50',
  info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50',
} as const

// Card Standards
export const card = {
  base: 'rounded-xl border border-border/50 bg-card shadow-sm',
  hover: 'hover:shadow-md transition-all duration-200',
  compact: 'rounded-lg border border-border/50 bg-card shadow-sm p-3',
  standard: 'rounded-xl border border-border/50 bg-card shadow-sm p-4 sm:p-5',
} as const

// Input Standards
export const input = {
  base: `
    w-full
    rounded-lg
    border border-border/50
    bg-background
    px-3 py-2
    text-sm
    text-foreground
    placeholder:text-muted-foreground
    transition-all duration-200
    focus:outline-none
    focus:ring-2
    focus:ring-blue-500/40
    focus:border-border
    disabled:opacity-50
    disabled:cursor-not-allowed
  `,
  error: 'border-red-500/50 focus:ring-red-500/40',
  success: 'border-green-500/50 focus:ring-green-500/40',
} as const

// Button Standards
export const button = {
  base: `
    inline-flex
    items-center
    justify-center
    gap-2
    rounded-lg
    px-4 py-2
    text-sm
    font-medium
    transition-all duration-200
    focus:outline-none
    focus:ring-2
    focus:ring-blue-500/40
    active:scale-[0.98]
    disabled:opacity-50
    disabled:cursor-not-allowed
  `,
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-muted text-foreground hover:bg-muted/80',
  ghost: 'hover:bg-muted/50 text-foreground',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  sizes: {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  },
} as const

// Helper function to get status chip classes
export function getStatusChipClasses(status: string): string {
  const statusLower = status.toLowerCase()
  switch (statusLower) {
    case 'pending':
      return `${statusChips.base} ${statusChips.pending}`
    case 'paid':
    case 'completed':
    case 'success':
      return `${statusChips.base} ${statusChips.success}`
    case 'cancelled':
      return `${statusChips.base} ${statusChips.cancelled}`
    case 'expired':
    case 'failed':
      return `${statusChips.base} ${statusChips.failed}`
    default:
      return `${statusChips.base} ${statusChips.info}`
  }
}

// Helper function to get icon classes
export function getIconClasses(size: 'small' | 'standard' | 'large' = 'standard', stroke: boolean = true): string {
  const sizeClass = icons[size]
  const strokeClass = stroke ? icons.stroke : ''
  return `${sizeClass} ${strokeClass}`
}