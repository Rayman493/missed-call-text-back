'use client'

import React, { useState, useEffect } from 'react'
import { DollarSign, FileText, Calendar, MessageCircle, Snowflake, ChevronRight } from 'lucide-react'
import { revenueOpportunitiesService } from '@/lib/revenue-opportunities/revenue-opportunities-service'
import type { RevenueOpportunity } from '@/lib/revenue-opportunities/revenue-opportunities-types'
import { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface RevenueOpportunitiesProps {
  business: { id: string } | null
}

export default function RevenueOpportunities({ business }: RevenueOpportunitiesProps) {
  const [opportunities, setOpportunities] = useState<RevenueOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!business) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    revenueOpportunitiesService.getOpportunities({ businessId: business.id })
      .then(setOpportunities)
      .catch(err => {
        console.error('[RevenueOpportunities] Failed to fetch opportunities:', err)
        setError('Unable to load revenue opportunities')
      })
      .finally(() => setLoading(false))
  }, [business])

  const handleAction = (opportunity: RevenueOpportunity) => {
    switch (opportunity.recommendedAction) {
      case 'open_customer':
        router.push(`/dashboard/leads/${opportunity.customerId}`)
        break
      case 'send_estimate':
      case 'request_payment':
      case 'schedule_job':
      case 'send_follow_up':
        router.push(`/dashboard/leads/${opportunity.customerId}`)
        break
    }
  }

  if (!business) return null

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      </div>
    )
  }

  if (error || opportunities.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Revenue Opportunities
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {opportunities.length} opportunity{opportunities.length !== 1 ? 's' : ''} to act on today
        </p>
      </div>

      {/* Content */}
      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {opportunities.map(opportunity => (
          <RevenueOpportunityRow
            key={opportunity.id}
            opportunity={opportunity}
            onAction={() => handleAction(opportunity)}
          />
        ))}
      </div>
    </div>
  )
}

interface RevenueOpportunityRowProps {
  opportunity: RevenueOpportunity
  onAction: () => void
}

function RevenueOpportunityRow({ opportunity, onAction }: RevenueOpportunityRowProps) {
  const icon = getOpportunityIcon(opportunity.type)
  const typeLabel = getOpportunityTypeLabel(opportunity.type)
  const actionLabel = getActionLabel(opportunity.recommendedAction)

  return (
    <button
      onClick={onAction}
      className="w-full px-5 py-4 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getOpportunityIconBg(opportunity.type)}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-900 dark:text-foreground">
              {opportunity.customerName}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              • {typeLabel}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
            {opportunity.whyNow}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
        {opportunity.estimatedValue !== null && (
          <div className="text-right">
            <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
              {formatCurrency(opportunity.estimatedValue)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
          <span>{actionLabel}</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </button>
  )
}

function getOpportunityIcon(type: string) {
  switch (type) {
    case 'repeat_customer':
      return <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
    case 'ready_for_estimate':
      return <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    case 'ready_for_invoice':
      return <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
    case 'follow_up':
      return <MessageCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
    case 'seasonal':
      return <Snowflake className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
    default:
      return <DollarSign className="w-5 h-5 text-slate-600 dark:text-slate-400" />
  }
}

function getOpportunityIconBg(type: string): string {
  switch (type) {
    case 'repeat_customer':
      return 'bg-purple-100 dark:bg-purple-900/30'
    case 'ready_for_estimate':
      return 'bg-blue-100 dark:bg-blue-900/30'
    case 'ready_for_invoice':
      return 'bg-green-100 dark:bg-green-900/30'
    case 'follow_up':
      return 'bg-orange-100 dark:bg-orange-900/30'
    case 'seasonal':
      return 'bg-cyan-100 dark:bg-cyan-900/30'
    default:
      return 'bg-slate-100 dark:bg-slate-800'
  }
}

function getOpportunityTypeLabel(type: string): string {
  switch (type) {
    case 'repeat_customer':
      return 'Repeat Customer'
    case 'ready_for_estimate':
      return 'Ready for Estimate'
    case 'ready_for_invoice':
      return 'Ready for Invoice'
    case 'follow_up':
      return 'Follow Up'
    case 'seasonal':
      return 'Seasonal'
    default:
      return 'Opportunity'
  }
}

function getActionLabel(action: string): string {
  switch (action) {
    case 'send_estimate':
      return 'Send Estimate'
    case 'request_payment':
      return 'Request Payment'
    case 'schedule_job':
      return 'Schedule Job'
    case 'open_customer':
      return 'View'
    case 'send_follow_up':
      return 'Send Follow-up'
    default:
      return 'View'
  }
}
