'use client'

import { Check } from 'lucide-react'

export interface PickerListRowProps {
  primary: string
  secondary?: string | null
  tertiary?: string | null
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  className?: string
  role?: string
}

/**
 * Shared list-row primitive for picker/dropdown options.
 *
 * Enforces a consistent visual rhythm across customer, job, and generic
 * selection dropdowns: one primary line, optional secondary context, optional
 * tertiary metadata, a subtle bottom divider, and a right-aligned checkmark
 * when selected. Missing metadata renders as intentional muted fallback text
 * rather than blank or raw values.
 */
export default function PickerListRow({
  primary,
  secondary,
  tertiary,
  selected = false,
  disabled = false,
  onClick,
  className = '',
  role,
}: PickerListRowProps) {
  return (
    <button
      type="button"
      role={role}
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full px-3 py-2.5 min-h-[44px] text-left flex items-center justify-between gap-2',
        'border-b border-border/10 last:border-b-0',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-accent/40',
        selected ? 'bg-accent/40' : '',
        className,
      ].join(' ')}
    >
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground truncate">
          {primary || '—'}
        </span>
        {secondary !== undefined && secondary !== null && (
          <span className="text-xs text-muted-foreground truncate">
            {secondary}
          </span>
        )}
        {tertiary !== undefined && tertiary !== null && (
          <span className="text-xs text-muted-foreground/70 truncate">
            {tertiary}
          </span>
        )}
      </div>
      {selected && (
        <Check className="w-4 h-4 text-primary flex-shrink-0" />
      )}
    </button>
  )
}
