'use client'

import React, { useState, useEffect } from 'react'
import { FileText, DollarSign, RefreshCw, ArrowRight } from 'lucide-react'
import { workflowService } from '@/lib/smart-workflow/smart-workflow-service'
import type { WorkflowSummary } from '@/lib/smart-workflow/smart-workflow-types'
import { useRouter } from 'next/navigation'

interface WorkflowSummariesProps {
  business: { id: string } | null
}

export default function WorkflowSummaries({ business }: WorkflowSummariesProps) {
  const [summaries, setSummaries] = useState<WorkflowSummary[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (!business) {
      setLoading(false)
      return
    }

    setLoading(true)
    workflowService.getWorkflowSummaries(business.id)
      .then(setSummaries)
      .catch(err => {
        console.error('[WorkflowSummaries] Failed to fetch summaries:', err)
      })
      .finally(() => setLoading(false))
  }, [business])

  const handleSummaryClick = (summary: WorkflowSummary) => {
    router.push(summary.route)
  }

  if (!business) return null

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-12 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
      </div>
    )
  }

  if (summaries.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Workflow Actions
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {summaries.length} workflow{summaries.length !== 1 ? 's' : ''} to complete
        </p>
      </div>

      {/* Content */}
      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {summaries.map(summary => (
          <SummaryItem
            key={summary.type}
            summary={summary}
            onClick={() => handleSummaryClick(summary)}
          />
        ))}
      </div>
    </div>
  )
}

interface SummaryItemProps {
  summary: WorkflowSummary
  onClick: () => void
}

function SummaryItem({ summary, onClick }: SummaryItemProps) {
  const icon = getSummaryIcon(summary.type)
  const bgColor = getSummaryBg(summary.type)

  return (
    <button
      onClick={onClick}
      className="w-full px-5 py-4 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${bgColor}`}>
          {icon}
        </div>
        <div className="text-left">
          <div className="text-sm font-medium text-slate-900 dark:text-foreground">
            {summary.title}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {summary.count} {summary.count === 1 ? 'customer' : 'customers'}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
        <span>View</span>
        <ArrowRight className="w-4 h-4" />
      </div>
    </button>
  )
}

function getSummaryIcon(type: string) {
  switch (type) {
    case 'new_lead':
      return <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    case 'payment_collection':
      return <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
    case 'existing_customer':
    case 'customer_recovery':
      return <RefreshCw className="w-5 h-5 text-purple-600 dark:text-purple-400" />
    default:
      return <RefreshCw className="w-5 h-5 text-slate-600 dark:text-slate-400" />
  }
}

function getSummaryBg(type: string): string {
  switch (type) {
    case 'new_lead':
      return 'bg-blue-100 dark:bg-blue-900/30'
    case 'payment_collection':
      return 'bg-green-100 dark:bg-green-900/30'
    case 'existing_customer':
    case 'customer_recovery':
      return 'bg-purple-100 dark:bg-purple-900/30'
    default:
      return 'bg-slate-100 dark:bg-slate-800'
  }
}
