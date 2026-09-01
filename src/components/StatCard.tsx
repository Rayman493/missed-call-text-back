'use client'

import React from 'react'
import Link from 'next/link'

interface StatCardProps {
  value: string | number
  label: string
  description?: string
  icon?: string
  iconNode?: React.ReactNode
  iconColor?: 'amber' | 'blue' | 'green' | 'purple' | 'slate' | 'orange'
  href?: string
  isInteractive?: boolean
  onClick?: () => void
  isSelected?: boolean
  ariaLabel?: string
  className?: string
}

export default function StatCard({
  value,
  label,
  description,
  icon,
  iconNode,
  iconColor = 'blue',
  href,
  isInteractive = false,
  onClick,
  isSelected = false,
  ariaLabel,
  className = ''
}: StatCardProps) {
  // Unified card foundation
  const baseClasses = `
    relative overflow-hidden
    border border-slate-200/60 dark:border-slate-700/40
    bg-white dark:bg-slate-800/60
    rounded-lg
    p-3 sm:p-4
    h-full
  `

  // Interactive hover states
  const interactiveClasses = isInteractive ? `
    cursor-pointer
    transition-all duration-200
    hover:-translate-y-0.5
    hover:shadow-sm
    hover:border-slate-300/80 dark:hover:border-slate-600/60
    ${href ? 'group' : ''}
  ` : ''

  // Selected state
  const selectedClasses = isSelected ? `
    ring-2 ring-primary/50 ring-offset-2 ring-offset-background
    border-primary/50
    bg-primary/5
  ` : ''

  // Icon container backgrounds - more restrained
  const iconBackgrounds = {
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200/40 dark:border-amber-800/30',
    blue: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200/40 dark:border-blue-800/30',
    green: 'bg-green-50 dark:bg-green-950/30 border-green-200/40 dark:border-green-800/30',
    purple: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200/40 dark:border-purple-800/30',
    slate: 'bg-slate-50 dark:bg-slate-950/30 border-slate-200/40 dark:border-slate-800/30',
    orange: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200/40 dark:border-orange-800/30'
  }

  // Icon text colors - slightly more restrained
  const iconTextColors = {
    amber: 'text-amber-700 dark:text-amber-300',
    blue: 'text-blue-700 dark:text-blue-300',
    green: 'text-green-700 dark:text-green-300',
    purple: 'text-purple-700 dark:text-purple-300',
    slate: 'text-slate-700 dark:text-slate-300',
    orange: 'text-orange-700 dark:text-orange-300'
  }

  const cardContent = (
    <div
      className={`${baseClasses} ${interactiveClasses} ${selectedClasses} ${className}`}
      onClick={isInteractive && onClick ? onClick : undefined}
      role={isInteractive && onClick ? 'button' : undefined}
      tabIndex={isInteractive && onClick ? 0 : undefined}
      aria-pressed={isInteractive && onClick ? isSelected : undefined}
      aria-label={ariaLabel}
    >
      {/* Icon and Label Header */}
      {(iconNode || icon || label) && (
        <div className="flex items-center gap-2 mb-2">
          {(iconNode || icon) && (
            <span className={`
              w-7 h-7
              ${iconBackgrounds[iconColor]}
              border
              rounded-md
              flex items-center justify-center
              text-base
              ${isInteractive && href ? '' : ''}
            `}>
              {iconNode || icon}
            </span>
          )}
          <h3 className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-[0.12em] leading-none">
            {label}
          </h3>
        </div>
      )}

      {/* Primary Metric */}
      <div className="mb-1">
        <p className={`
          text-2xl sm:text-3xl
          font-bold
          ${iconTextColors[iconColor]}
          tracking-tight
          leading-none
        `}>
          {value}
        </p>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-normal leading-snug">
          {description}
        </p>
      )}
    </div>
  )

  // Wrap in Link if href provided
  if (href && isInteractive) {
    return (
      <Link href={href}>
        {cardContent}
      </Link>
    )
  }

  return cardContent
}
