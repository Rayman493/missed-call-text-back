'use client'

import type { ReactNode } from 'react'

interface CustomerDetailPreviewCardProps {
  title: string
  subtitle: string
  badge?: ReactNode
  onClick?: () => void
  ariaLabel?: string
}

/**
 * Shared compact preview card used across Customer Details sections
 * (Jobs, Reminders, Payments, Appointments). Enforces a consistent
 * minimum height, padding, and vertical rhythm so each card family
 * aligns in a mixed list.
 */
export default function CustomerDetailPreviewCard({
  title,
  subtitle,
  badge,
  onClick,
  ariaLabel,
}: CustomerDetailPreviewCardProps) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }
          : undefined
      }
      aria-label={ariaLabel}
      className="flex items-center justify-between gap-3 min-h-[52px] p-3 bg-muted/40 hover:bg-muted/60 rounded-lg transition-colors duration-200 cursor-pointer"
    >
      <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5">
        <p className="text-sm font-medium text-foreground truncate leading-tight">
          {title}
        </p>
        <p className="text-xs text-muted-foreground/80 leading-tight">
          {subtitle}
        </p>
      </div>
      {badge && (
        <div className="flex-shrink-0 ml-2">
          {badge}
        </div>
      )}
    </div>
  )
}
