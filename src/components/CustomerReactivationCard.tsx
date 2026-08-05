'use client'

import React, { useState, useEffect } from 'react'
import { RefreshCw, Calendar, TrendingUp, User, Clock } from 'lucide-react'
import { customerReactivationService } from '@/lib/customer-reactivation/customer-reactivation-service'
import type { CustomerReactivation } from '@/lib/customer-reactivation/customer-reactivation-types'
import { formatCurrency } from '@/lib/utils'

interface CustomerReactivationCardProps {
  businessId: string
  customerId: string
}

export default function CustomerReactivationCard({ businessId, customerId }: CustomerReactivationCardProps) {
  const [reactivation, setReactivation] = useState<CustomerReactivation | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    customerReactivationService.getReactivation({ businessId, customerId })
      .then(setReactivation)
      .catch(err => {
        console.error('[CustomerReactivationCard] Failed to fetch reactivation:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  if (loading || !reactivation) {
    return null
  }

  const icon = getReactivationIcon(reactivation.type)
  const typeLabel = getReactivationTypeLabel(reactivation.type)

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200/70 dark:border-emerald-800/50 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getReactivationIconBg(reactivation.type)}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Reactivation Opportunity
            </span>
            <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-full font-medium">
              {typeLabel}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mb-2">
            {reactivation.reason}
          </p>
          
          {reactivation.averageInterval && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Average interval: {reactivation.averageInterval} days
            </div>
          )}
          
          {reactivation.daysSinceLastService && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Last job: {reactivation.daysSinceLastService} days ago
            </div>
          )}

          {reactivation.potentialValue !== null && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-emerald-200/50 dark:border-emerald-800/30">
              <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
                Potential value: {formatCurrency(reactivation.potentialValue)}
              </span>
            </div>
          )}

          {reactivation.suggestedMessage && (
            <div className="mt-3 pt-3 border-t border-emerald-200/50 dark:border-emerald-800/30">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                Suggested message:
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-white/50 dark:bg-slate-900/30 rounded p-2">
                {reactivation.suggestedMessage.text}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
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
    case 'seasonal':
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
