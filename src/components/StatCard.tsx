'use client'

import React from 'react'
import Link from 'next/link'

interface StatCardProps {
  value: string | number
  label: string
  description?: string
  icon?: string
  iconColor?: 'amber' | 'blue' | 'green' | 'purple' | 'slate' | 'orange'
  href?: string
  isInteractive?: boolean
  className?: string
}

export default function StatCard({
  value,
  label,
  description,
  icon,
  iconColor = 'blue',
  href,
  isInteractive = false,
  className = ''
}: StatCardProps) {
  // Unified card foundation
  const baseClasses = `
    bg-card
    border border-slate-300 dark:border-border/60 
    rounded-xl shadow-sm hover:shadow-md
    p-3 sm:p-4 
    h-full
    transition-all duration-200
    hover:-translate-y-[2px]
    hover:border-slate-400/80 dark:hover:border-border
  `

  // Interactive hover states
  const interactiveClasses = isInteractive ? `
    hover:shadow-lg hover:border-slate-400 dark:hover:border-border/90
    cursor-pointer
    ${href ? 'group' : ''}
  ` : ''

  // Icon color gradients
  const iconGradients = {
    amber: 'from-amber-500 to-amber-600/30 dark:from-amber-500/30 dark:to-amber-600/30 border-amber-200/50 dark:border-amber-800/50',
    blue: 'from-blue-500 to-blue-600/30 dark:from-blue-500/30 dark:to-blue-600/30 border-blue-200/50 dark:border-blue-800/50',
    green: 'from-green-500 to-green-600/30 dark:from-green-500/30 dark:to-green-600/30 border-green-200/50 dark:border-green-800/50',
    purple: 'from-purple-500 to-purple-600/30 dark:from-purple-500/30 dark:to-purple-600/30 border-purple-200/50 dark:border-purple-800/50',
    slate: 'from-slate-500 to-slate-600/30 dark:from-slate-500/30 dark:to-slate-600/30 border-slate-200/50 dark:border-slate-800/50',
    orange: 'from-orange-500 to-orange-600/30 dark:from-orange-500/30 dark:to-orange-600/30 border-orange-200/50 dark:border-orange-800/50'
  }

  // Icon text colors
  const iconTextColors = {
    amber: 'text-amber-600 dark:text-amber-400',
    blue: 'text-blue-600 dark:text-blue-400',
    green: 'text-green-600 dark:text-green-400',
    purple: 'text-purple-600 dark:text-purple-400',
    slate: 'text-slate-600 dark:text-slate-400',
    orange: 'text-orange-600 dark:text-orange-400'
  }

  const cardContent = (
    <div className={`${baseClasses} ${interactiveClasses} ${className}`}>
      {/* Icon and Label Header */}
      {(icon || label) && (
        <div className="flex items-center gap-2 mb-3">
          {icon && (
            <span className={`
              w-8 h-8 sm:w-10 sm:h-10 
              bg-gradient-to-br ${iconGradients[iconColor]} 
              rounded-lg sm:rounded-xl 
              flex items-center justify-center 
              text-lg sm:text-xl 
              shadow-sm border
              ${isInteractive && href ? '' : ''}
            `}>
              {icon}
            </span>
          )}
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wide leading-tight">
            {label}
          </h3>
        </div>
      )}

      {/* Primary Metric */}
      <div className="mb-2">
        <p className={`
          text-3xl sm:text-4xl lg:text-5xl 
          font-black 
          ${iconTextColors[iconColor]} 
          tracking-tight 
          leading-none
        `}>
          {value}
        </p>
      </div>

      {/* Description */}
      {description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 font-medium leading-tight">
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
