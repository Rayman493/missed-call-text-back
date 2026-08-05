'use client'

import React from 'react'
import Link from 'next/link'
import { FocusItem, FocusPriority } from '@/lib/focus/focus-types'
import { DollarSign, Clock, Calendar, MessageSquare, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'

interface FocusCardProps {
  item: FocusItem
  onDismiss?: (item: FocusItem) => void
  onComplete?: (item: FocusItem) => void
  compact?: boolean
}

export default function FocusCard({ item, onDismiss, onComplete, compact = false }: FocusCardProps) {
  const getPriorityColor = (priority: FocusPriority) => {
    switch (priority) {
      case FocusPriority.URGENT:
        return 'text-red-600 dark:text-red-400'
      case FocusPriority.HIGH:
        return 'text-orange-600 dark:text-orange-400'
      case FocusPriority.MEDIUM:
        return 'text-blue-600 dark:text-blue-400'
      case FocusPriority.LOW:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  const getPriorityBadge = (priority: FocusPriority) => {
    switch (priority) {
      case FocusPriority.URGENT:
        return <span className="text-[10px] font-medium text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30 px-1.5 py-0.5 rounded">Urgent</span>
      case FocusPriority.HIGH:
        return <span className="text-[10px] font-medium text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">High</span>
      case FocusPriority.MEDIUM:
        return <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">Medium</span>
      case FocusPriority.LOW:
        return <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-900/30 px-1.5 py-0.5 rounded">Low</span>
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'money':
        return <DollarSign className="w-3.5 h-3.5" />
      case 'customers':
        return <TrendingUp className="w-3.5 h-3.5" />
      case 'scheduling':
        return <Calendar className="w-3.5 h-3.5" />
      case 'communication':
        return <MessageSquare className="w-3.5 h-3.5" />
      case 'growth':
        return <TrendingUp className="w-3.5 h-3.5" />
      case 'efficiency':
        return <AlertCircle className="w-3.5 h-3.5" />
      default:
        return <CheckCircle className="w-3.5 h-3.5" />
    }
  }

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'money':
        return 'text-amber-600 dark:text-amber-400'
      case 'customers':
        return 'text-purple-600 dark:text-purple-400'
      case 'scheduling':
        return 'text-violet-600 dark:text-violet-400'
      case 'communication':
        return 'text-green-600 dark:text-green-400'
      case 'growth':
        return 'text-cyan-600 dark:text-cyan-400'
      case 'efficiency':
        return 'text-orange-600 dark:text-orange-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  if (compact) {
    return (
      <div className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/20 transition-colors">
        <div className={`flex-shrink-0 mt-0.5 ${getCategoryColor(item.category)}`}>
          {getCategoryIcon(item.category)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground leading-snug">
            {item.title}
          </p>
          <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5">
            {item.summary}
          </p>
        </div>
        {item.recommendedAction && (
          <Link
            href={item.recommendedAction.destination}
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex-shrink-0"
          >
            →
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/20 transition-colors group">
      <div className={`flex-shrink-0 mt-0.5 ${getCategoryColor(item.category)}`}>
        {getCategoryIcon(item.category)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-[11px] font-semibold text-foreground leading-snug">
            {item.title}
          </h4>
          {getPriorityBadge(item.priority)}
        </div>
        <p className="text-[10px] text-muted-foreground/80 leading-snug mb-1">
          {item.summary}
        </p>
        <p className="text-[9px] text-muted-foreground/60 leading-snug italic">
          {item.reason}
        </p>
        {item.recommendedAction && (
          <Link
            href={item.recommendedAction.destination}
            onClick={(e) => {
              e.preventDefault()
              onComplete?.(item)
            }}
            className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
          >
            {item.recommendedAction.label} →
          </Link>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={(e) => {
            e.preventDefault()
            onDismiss(item)
          }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted rounded"
        >
          <span className="text-muted-foreground/50 hover:text-muted-foreground text-xs">×</span>
        </button>
      )}
    </div>
  )
}
