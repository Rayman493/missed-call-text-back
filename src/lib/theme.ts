/**
 * Shared theme tokens for light/dark mode
 * 
 * These classes provide consistent styling across the app while preserving
 * the polished dark mode experience and adding clean light mode support.
 */

// Background tokens
export const bgTokens = {
  app: 'bg-slate-950 dark:bg-slate-950',
  card: 'bg-slate-900 dark:bg-slate-900',
  cardHover: 'bg-slate-800 dark:bg-slate-800',
  muted: 'bg-slate-950 dark:bg-slate-950',
  input: 'bg-slate-800 dark:bg-slate-800',
  modal: 'bg-slate-900 dark:bg-slate-900',
  banner: 'bg-blue-900/20 dark:bg-blue-900/20',
  error: 'bg-red-900/20 dark:bg-red-900/20',
  success: 'bg-green-900/20 dark:bg-green-900/20',
  warning: 'bg-yellow-900/20 dark:bg-yellow-900/20',
}

// Text tokens
export const textTokens = {
  primary: 'text-slate-900 dark:text-white',
  secondary: 'text-slate-600 dark:text-slate-300',
  muted: 'text-slate-500 dark:text-slate-400',
  inverse: 'text-white dark:text-slate-900',
  link: 'text-blue-600 dark:text-blue-400',
  error: 'text-red-600 dark:text-red-400',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-yellow-600 dark:text-yellow-400',
}

// Border tokens
export const borderTokens = {
  default: 'border-slate-200 dark:border-slate-700',
  light: 'border-slate-100 dark:border-slate-800',
  heavy: 'border-slate-300 dark:border-slate-600',
  focus: 'border-blue-500 dark:border-blue-400',
  error: 'border-red-300 dark:border-red-600',
  success: 'border-green-300 dark:border-green-600',
  warning: 'border-yellow-300 dark:border-yellow-600',
}

// Button tokens
export const buttonTokens = {
  primary: 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white',
  secondary: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white',
  outline: 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700',
  danger: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white',
  ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300',
}

// Shadow tokens
export const shadowTokens = {
  card: 'shadow-sm dark:shadow-lg dark:shadow-black/20',
  modal: 'shadow-lg dark:shadow-xl dark:shadow-black/30',
  dropdown: 'shadow-md dark:shadow-lg dark:shadow-black/20',
}

// Combined utility classes
export const themeClasses = {
  // Card styles
  card: `${bgTokens.card} ${borderTokens.default} ${shadowTokens.card}`,
  cardInteractive: `${bgTokens.card} ${borderTokens.default} ${shadowTokens.card} hover:${bgTokens.cardHover} transition-colors`,
  
  // Input styles
  input: `${bgTokens.input} ${borderTokens.default} ${textTokens.primary} focus:${borderTokens.focus} outline-none`,
  
  // Modal styles
  modal: `${bgTokens.modal} ${borderTokens.light} ${shadowTokens.modal}`,
  
  // Banner styles
  banner: `${bgTokens.banner} ${borderTokens.focus} ${textTokens.primary}`,
  errorBanner: `${bgTokens.error} ${borderTokens.error} ${textTokens.error}`,
  successBanner: `${bgTokens.success} ${borderTokens.success} ${textTokens.success}`,
  warningBanner: `${bgTokens.warning} ${borderTokens.warning} ${textTokens.warning}`,
  
  // Button styles
  buttonPrimary: `${buttonTokens.primary} ${shadowTokens.card}`,
  buttonSecondary: `${buttonTokens.secondary} ${shadowTokens.card}`,
  buttonOutline: `${buttonTokens.outline} ${shadowTokens.card}`,
  buttonDanger: `${buttonTokens.danger} ${shadowTokens.card}`,
  buttonGhost: `${buttonTokens.ghost}`,
}

// Helper function to combine theme classes safely
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Theme-aware component props
export interface ThemeProps {
  className?: string
  variant?: 'default' | 'muted' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}
