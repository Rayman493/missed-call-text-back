'use client'

import React from 'react'
import { LucideIcon } from 'lucide-react'

interface PremiumEmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  height?: string
}

export default function PremiumEmptyState({
  icon: Icon,
  title,
  description,
  height = '260px'
}: PremiumEmptyStateProps) {
  return (
    <div 
      className="flex flex-col items-center justify-center text-center px-6"
      style={{ height }}
    >
      <div className="mb-4">
        <Icon className="w-10 h-10 text-muted-foreground/25" strokeWidth={1.5} />
      </div>
      <div className="space-y-1.5 max-w-[240px]">
        <p className="text-sm font-medium text-muted-foreground/80">
          {title}
        </p>
        <p className="text-xs text-muted-foreground/50 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  )
}
