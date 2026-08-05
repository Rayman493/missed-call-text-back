'use client'

import React, { useState, useEffect } from 'react'
import { DollarSign, FileText, Calendar, MessageCircle, Snowflake } from 'lucide-react'
import { revenueOpportunitiesService } from '@/lib/revenue-opportunities/revenue-opportunities-service'
import type { RevenueOpportunity } from '@/lib/revenue-opportunities/revenue-opportunities-types'
import { useRouter } from 'next/navigation'

interface RevenueOpportunityCardProps {
  businessId: string
  customerId: string
}

export default function RevenueOpportunityCard({ businessId, customerId }: RevenueOpportunityCardProps) {
  const [opportunity, setOpportunity] = useState<RevenueOpportunity | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    setLoading(true)
    revenueOpportunitiesService.getOpportunity({ businessId, customerId })
      .then(setOpportunity)
      .catch(err => {
        console.error('[RevenueOpportunityCard] Failed to fetch opportunity:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  if (loading) {
    return null
  }

  if (!opportunity) {
    return null
  }

  const handleAction = () => {
    router.push(`/dashboard/leads/${customerId}`)
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200/70 dark:border-amber-800/50 rounded-xl p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${getOpportunityIconBg(opportunity.type)}`}>
          {getOpportunityIcon(opportunity.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
              Opportunity
            </span>
            <span className="text-xs px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full font-medium">
              {getOpportunityTypeLabel(opportunity.type)}
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mb-2">
            {opportunity.whyNow}
          </p>
          
          {opportunity.metadata.lastJobDate && opportunity.metadata.normalInterval && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Usually books every {opportunity.metadata.normalInterval} days
            </div>
          )}
          
          {opportunity.metadata.lastJobDate && (
            <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              Last job: {opportunity.metadata.daysSinceLastInteraction} days ago
            </div>
          )}

          {opportunity.estimatedValue !== null && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/30">
              <DollarSign className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
                Potential value: {formatCurrency(opportunity.estimatedValue)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
