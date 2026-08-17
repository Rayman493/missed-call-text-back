'use client'

import React, { useState, useEffect } from 'react'
import { Trophy, Clock } from 'lucide-react'
import { businessWinsService } from '@/lib/business-wins/business-wins-service'
import type { BusinessWin } from '@/lib/business-wins/business-wins-types'

interface RecentWinsProps {
  business: { id: string } | null
}

export default function RecentWins({ business }: RecentWinsProps) {
  const [wins, setWins] = useState<BusinessWin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) {
      setLoading(false)
      return
    }

    setLoading(true)
    businessWinsService.getRecentWins({ businessId: business.id })
      .then(setWins)
      .catch(err => {
        console.error('[RecentWins] Failed to fetch wins:', err)
      })
      .finally(() => setLoading(false))
  }, [business])

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (wins.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Recent Wins
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Meaningful business milestones
        </p>
      </div>

      {/* Content */}
      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {wins.map(win => (
          <WinItem key={win.id} win={win} />
        ))}
      </div>
    </div>
  )
}

interface WinItemProps {
  win: BusinessWin
}

function WinItem({ win }: WinItemProps) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-100 dark:bg-amber-900/30">
          <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-900 dark:text-foreground mb-0.5">
            {win.title}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
            {win.description}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
            <Clock className="w-3 h-3" />
            <span>{formatRelativeTime(win.achievedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatRelativeTime(timestamp: string): string {
  const now = new Date()
  const then = new Date(timestamp)
  const diffMs = now.getTime() - then.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return 'Recently'
}
