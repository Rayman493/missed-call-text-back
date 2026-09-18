'use client'

import React from 'react'

interface ChartHeaderControlsProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

/**
 * Shared header rail for dashboard analytics cards.
 *
 * Layout contract:
 * - Title/subtitle stack on the left.
 * - Controls (filter button, time range, etc.) sit in a single right-aligned
 *   flex rail with a consistent 8px gap.
 * - Title and controls stay on the same row at all supported phone widths;
 *   the title truncates before controls can collide or wrap.
 * - No per-chart arbitrary margins, offsets, or alignment tricks.
 */
export function ChartHeaderControls({
  title,
  subtitle,
  children,
  className = '',
}: ChartHeaderControlsProps) {
  return (
    <div
      className={`
        flex flex-row items-center justify-between gap-2 mb-3
        ${className}
      `}
    >
      <div className="min-w-0 flex-1">
        {typeof title === 'string' ? (
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
        ) : (
          title
        )}
        {subtitle && (
          <p className="text-xs text-muted-foreground/80 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center justify-end gap-2 flex-shrink-0">
          {children}
        </div>
      )}
    </div>
  )
}
