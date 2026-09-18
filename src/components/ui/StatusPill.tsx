'use client'

import { cn } from '@/lib/theme'

export type StatusPillVariant = 'green' | 'amber' | 'gray' | 'red' | 'blue' | 'purple' | 'emerald'

interface StatusPillProps {
  children: React.ReactNode
  variant: StatusPillVariant
  className?: string
}

const variantClass: Record<StatusPillVariant, string> = {
  green: 'bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
  gray: 'bg-muted/80 text-muted-foreground border-border/50',
  red: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20',
  blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20',
  purple: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20',
}

/**
 * Shared status pill used across customer-detail preview cards, jobs,
 * payments, appointments, and billing documents.
 *
 * Enforces a single visual contract:
 * - fixed height (24px)
 * - consistent horizontal padding / radius / font
 * - semantic color only through variant
 */
export default function StatusPill({ children, variant, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center h-6 px-2.5 rounded-full text-[11px] font-medium border whitespace-nowrap',
        variantClass[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
