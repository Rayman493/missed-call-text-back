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
    relative overflow-hidden
    border border-white/10
    bg-slate-900/55
    shadow-[0_1px_0_rgba(255,255,255,0.04),0_18px_50px_rgba(2,6,23,0.22)]
    backdrop-blur-xl
    rounded-2xl
    p-3 sm:p-4 md:p-5
    h-full
    transition-all duration-300
    hover:-translate-y-[2px]
    hover:border-blue-400/25
    hover:bg-slate-900/70
  `

  // Interactive hover states
  const interactiveClasses = isInteractive ? `
    hover:shadow-[0_1px_0_rgba(255,255,255,0.06),0_24px_70px_rgba(37,99,235,0.13)]
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
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl" />
      {/* Icon and Label Header */}
      {(icon || label) && (
        <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
          {icon && (
            <span className={`
              w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 
              bg-gradient-to-br ${iconGradients[iconColor]} 
              rounded-lg sm:rounded-xl 
              flex items-center justify-center 
              text-sm sm:text-lg md:text-xl 
              shadow-[0_10px_24px_rgba(2,6,23,0.25)] border
              ${isInteractive && href ? '' : ''}
            `}>
              {icon}
            </span>
          )}
          <h3 className="text-[10px] sm:text-xs font-bold text-slate-300 uppercase tracking-[0.16em] leading-tight">
            {label}
          </h3>
        </div>
      )}

      {/* Primary Metric */}
      <div className="mb-1.5 sm:mb-2">
        <p className={`
          text-2xl sm:text-3xl md:text-4xl lg:text-5xl 
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
        <p className="text-[10px] sm:text-xs text-slate-400 font-medium leading-snug">
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
