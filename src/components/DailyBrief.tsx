'use client'

import React, { useState, useEffect } from 'react'
import { AlertCircle, DollarSign, Calendar, Users, Activity, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { dailyBriefService } from '@/lib/daily-brief/daily-brief-service'
import { analyticsService } from '@/lib/analytics/analytics-service'
import type { DailyBrief, BriefSection } from '@/lib/daily-brief/daily-brief-types'
import { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'

interface DailyBriefProps {
  business: { id: string } | null
}

export default function DailyBrief({ business }: DailyBriefProps) {
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['priorities', 'schedule'])) // Expand key sections by default

  useEffect(() => {
    if (!business) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    dailyBriefService.generateBrief({ businessId: business.id, view: 'dashboard' })
      .then(brief => {
        setBrief(brief)
        // Track Daily Brief opened event
        analyticsService.track('daily_brief_opened', { itemCount: brief.sections.length }, business.id).catch(error => {
          console.error('[Analytics] Failed to track daily_brief_opened:', error)
        })
      })
      .catch(err => {
        console.error('[DailyBrief] Failed to generate brief:', err)
        setError('Unable to load daily brief')
      })
      .finally(() => setLoading(false))
  }, [business])

  const toggleSection = (sectionType: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(sectionType)) {
      newExpanded.delete(sectionType)
    } else {
      newExpanded.add(sectionType)
    }
    setExpandedSections(newExpanded)
  }

  if (!business) return null

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      </div>
    )
  }

  if (error || !brief) {
    return null
  }

  // All-clear state: no meaningful sections
  if (brief.sections.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">
              You're all caught up
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Nothing needs your attention right now.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/50">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-foreground">
          Daily Brief
        </h2>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
          What you need to know today
        </p>
      </div>

      {/* Sections */}
      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {brief.sections.map(section => (
          <BriefSectionItem
            key={section.type}
            section={section}
            isExpanded={expandedSections.has(section.type)}
            onToggle={() => toggleSection(section.type)}
          />
        ))}
      </div>
    </div>
  )
}

interface BriefSectionItemProps {
  section: BriefSection
  isExpanded: boolean
  onToggle: () => void
}

function BriefSectionItem({ section, isExpanded, onToggle }: BriefSectionItemProps) {
  const icon = getSectionIcon(section.type)
  const isHealthSection = section.type === 'health'
  const itemCount = section.items.length
  const isExpandable = !isHealthSection && itemCount > 0

  return (
    <div className="px-4 py-2.5">
      <button
        onClick={isExpandable ? onToggle : undefined}
        className={`w-full flex items-center justify-between group ${!isExpandable ? 'cursor-default' : ''}`}
      >
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${getSectionIconBg(section.type)}`}>
            {icon}
          </div>
          <span className="text-xs font-medium text-slate-900 dark:text-foreground">
            {section.title}
          </span>
        </div>
        {isExpandable && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {itemCount}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </div>
        )}
      </button>

      {/* Content */}
      {isExpanded && !isHealthSection && (
        <div className="mt-2 ml-9.5 space-y-1.5">
          {section.items.map(item => (
            <BriefItem key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Health summary (always visible) */}
      {isHealthSection && section.summary && (
        <div className="mt-2 ml-9.5">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            {section.summary}
          </p>
        </div>
      )}
    </div>
  )
}

interface BriefItemProps {
  item: {
    id: string
    summary: string
    priority: 'urgent' | 'high' | 'medium' | 'low'
  }
}

function BriefItem({ item }: BriefItemProps) {
  const priorityColor = getPriorityColor(item.priority)

  return (
    <div className="flex items-start gap-2">
      <div className={`w-1 h-1 rounded-full mt-1.5 ${priorityColor}`} />
      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
        {item.summary}
      </p>
    </div>
  )
}

function getSectionIcon(type: string) {
  switch (type) {
    case 'priorities':
      return <AlertCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
    case 'money':
      return <DollarSign className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
    case 'schedule':
      return <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
    case 'customers':
      return <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
    case 'health':
      return <Activity className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
    default:
      return <Activity className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
  }
}

function getSectionIconBg(type: string): string {
  switch (type) {
    case 'priorities':
      return 'bg-red-100 dark:bg-red-900/30'
    case 'money':
      return 'bg-green-100 dark:bg-green-900/30'
    case 'schedule':
      return 'bg-blue-100 dark:bg-blue-900/30'
    case 'customers':
      return 'bg-purple-100 dark:bg-purple-900/30'
    case 'health':
      return 'bg-slate-100 dark:bg-slate-800'
    default:
      return 'bg-slate-100 dark:bg-slate-800'
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-red-500'
    case 'high':
      return 'bg-orange-500'
    case 'medium':
      return 'bg-yellow-500'
    case 'low':
      return 'bg-slate-400'
    default:
      return 'bg-slate-400'
  }
}
