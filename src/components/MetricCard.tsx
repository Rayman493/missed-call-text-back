'use client'

import React from 'react'
import { useMobilePressGuard } from '@/hooks/useMobilePressGuard'

interface MetricCardProps {
  id: string
  label: string
  value: number
  icon: React.ElementType
  color: string
  bgColor: string
  href?: string
  description?: string
  onClick?: () => void
}

export default function MetricCard({
  id,
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  href,
  description,
  onClick
}: MetricCardProps) {
  // Hook must be called at the top level of the component
  const pressGuard = useMobilePressGuard({
    onActivate: () => {
      if (onClick) {
        onClick()
      }
    },
    threshold: 10
  })

  const hasValue = value > 0

  return (
    <button
      onPointerDown={pressGuard.onPointerDown}
      onPointerMove={pressGuard.onPointerMove}
      onPointerUp={pressGuard.onPointerUp}
      onPointerCancel={pressGuard.onPointerCancel}
      className={`text-left p-3 rounded-lg border border-border/30 hover:border-border/60 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all duration-200 ${href ? 'cursor-pointer' : ''} ${pressGuard.isPressed ? 'bg-slate-100 dark:bg-slate-700/50 scale-[0.98]' : ''}`}
      style={{ touchAction: 'pan-y' }}
    >
      <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center mb-2`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className={`text-2xl font-bold mb-0.5 ${hasValue ? 'text-slate-900 dark:text-foreground' : 'text-slate-400 dark:text-slate-600'}`}>
        {value}
      </div>
      <div className={`text-xs font-medium mb-0.5 ${hasValue ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-600'}`}>
        {label}
      </div>
      <div className="text-[10px] text-slate-500 dark:text-slate-500">
        {description}
      </div>
    </button>
  )
}