'use client'

import React, { useState, useEffect } from 'react'
import { RefreshCw, Calendar, TrendingUp, User, Clock, ChevronRight } from 'lucide-react'
import { customerReactivationService } from '@/lib/customer-reactivation/customer-reactivation-service'
import type { CustomerReactivation } from '@/lib/customer-reactivation/customer-reactivation-types'
import { CardSkeleton, ListItemSkeleton } from '@/components/ui/Skeleton'
import { useRouter } from 'next/navigation'

interface CustomerReactivationProps {
  business: { id: string } | null
}

export default function CustomerReactivation({ business }: CustomerReactivationProps) {
  const [reactivations, setReactivations] = useState<CustomerReactivation[]>([])
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

    customerReactivationService.getReactivations({ businessId: business.id })
      .then(setReactivations)
      .catch(err => {
        console.error('[CustomerReactivation] Failed to fetch reactivations:', err)
        setError('Unable to load customer reactivations')
      })
      .finally(() => setLoading(false))
  }, [business])

  const handleAction = (reactivation: CustomerReactivation) => {
    switch (reactivation.recommendedAction) {
      case 'open_customer':
      case 'send_message':
      case 'schedule_job':
        router.push(`/dashboard/leads/${reactivation.customerId}`)
        break
    }
  }

  if (!business) return null

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-56 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      </div>
    )
  }

  if (error || reactivations.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Customer Reactivation
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {reactivations.length} customer{reactivations.length !== 1 ? 's' : ''} ready to re-engage
        </p>
      </div>

      {/* Content */}
      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {reactivations.map(reactivation => (
          <ReactivationRow
            key={reactivation.id}
            reactivation={reactivation}
            onAction={() => handleAction(reactivation)}
          />
        ))}
      </div>
    </div>
  )
}

interface ReactivationRowProps {
  reactivation: CustomerReactivation
  onAction: () => void
}

function ReactivationRow({ reactivation, onAction }: ReactivationRowProps) {
  const icon = getReactivationIcon(reactivation.type)
  const typeLabel = getReactivationTypeLabel(reactivation.type)

  return (
    <button
      onClick={onAction}
      className="w-full px-5 py-4 flex items-center justify-between group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getReactivationIconBg(reactivation.type)}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-900 dark:text-foreground">
              {reactivation.customerName}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              • {typeLabel}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
            {reactivation.reason}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0 ml-4">
        {reactivation.potentialValue !== null && (
          <div className="text-right">
            <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
              {formatCurrency(reactivation.potentialValue)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
          <span>View</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </button>
  )
}

function getReactivationIcon(type: string) {
  switch (type) {
    case 'due_for_service':
      return <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    case 'seasonal_return':
      return <Clock className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
    case 'high_lifetime_value':
      return <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
    case 'one_time_customer':
      return <User className="w-5 h-5 text-purple-600 dark:text-purple-400" />
    case 'long_inactive':
      return <RefreshCw className="w-5 h-5 text-orange-600 dark:text-orange-400" />
    default:
      return <RefreshCw className="w-5 h-5 text-slate-600 dark:text-slate-400" />
  }
}

function getReactivationIconBg(type: string): string {
  switch (type) {
    case 'due_for_service':
      return 'bg-blue-100 dark:bg-blue-900/30'
    case 'seasonal_return':
      return 'bg-cyan-100 dark:bg-cyan-900/30'
    case 'high_lifetime_value':
      return 'bg-green-100 dark:bg-green-900/30'
    case 'one_time_customer':
      return 'bg-purple-100 dark:bg-purple-900/30'
    case 'long_inactive':
      return 'bg-orange-100 dark:bg-orange-900/30'
    default:
      return 'bg-slate-100 dark:bg-slate-800'
  }
}

function getReactivationTypeLabel(type: string): string {
  switch (type) {
    case 'due_for_service':
      return 'Due for Service'
    case 'seasonal_return':
      return 'Seasonal'
    case 'high_lifetime_value':
      return 'High Value'
    case 'one_time_customer':
      return 'One-Time'
    case 'long_inactive':
      return 'Inactive'
    default:
      return 'Reactivation'
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
