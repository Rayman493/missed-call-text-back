'use client'

import React, { useState, useEffect } from 'react'
import { Heart, ArrowRight, Star, Users, AlertCircle, Calendar } from 'lucide-react'
import { customerSuccessService } from '@/lib/customer-success/customer-success-service'
import type { CustomerSuccessOpportunity } from '@/lib/customer-success/customer-success-types'
import { useRouter } from 'next/navigation'

interface CustomerSuccessProps {
  business: { id: string } | null
}

export default function CustomerSuccess({ business }: CustomerSuccessProps) {
  const [opportunities, setOpportunities] = useState<CustomerSuccessOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    if (!business) {
      setLoading(false)
      return
    }

    setLoading(true)
    customerSuccessService.getOpportunities(business.id)
      .then(setOpportunities)
      .catch(err => {
        console.error('[CustomerSuccess] Failed to fetch opportunities:', err)
      })
      .finally(() => setLoading(false))
  }, [business])

  const handleOpportunityClick = (opportunity: CustomerSuccessOpportunity) => {
    router.push(`/dashboard/leads/${opportunity.customerId}`)
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

  if (opportunities.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Customer Success
          </h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {opportunities.length} opportunity{opportunities.length !== 1 ? 's' : ''} to grow relationships
        </p>
      </div>

      {/* Content */}
      <div className="divide-y divide-slate-200/70 dark:divide-slate-700/50">
        {opportunities.map(opportunity => (
          <OpportunityItem
            key={opportunity.id}
            opportunity={opportunity}
            onClick={() => handleOpportunityClick(opportunity)}
          />
        ))}
      </div>
    </div>
  )
}

interface OpportunityItemProps {
  opportunity: CustomerSuccessOpportunity
  onClick: () => void
}

function OpportunityItem({ opportunity, onClick }: OpportunityItemProps) {
  const icon = getOpportunityIcon(opportunity.type)
  const bgColor = getOpportunityBg(opportunity.type)
  const priorityColor = getPriorityColor(opportunity.priority)

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
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-900 dark:text-foreground">
              {opportunity.title}
            </div>
            <div className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${priorityColor}`}>
              {capitalizeFirst(opportunity.priority)}
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {opportunity.customerName} • {opportunity.reason}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {opportunity.timing}
            </span>
            {opportunity.potentialValue > 0 && (
              <span>{formatCurrency(opportunity.potentialValue)} value</span>
            )}
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

function getOpportunityIcon(type: string) {
  switch (type) {
    case 'review_request':
      return <Star className="w-5 h-5 text-amber-600 dark:text-amber-400" />
    case 'referral':
      return <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
    case 'maintenance':
      return <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
    case 'loyalty_milestone':
      return <Heart className="w-5 h-5 text-rose-600 dark:text-rose-400" />
    default:
      return <Heart className="w-5 h-5 text-slate-600 dark:text-slate-400" />
  }
}

function getOpportunityBg(type: string): string {
  switch (type) {
    case 'review_request':
      return 'bg-amber-100 dark:bg-amber-900/30'
    case 'referral':
      return 'bg-blue-100 dark:bg-blue-900/30'
    case 'maintenance':
      return 'bg-purple-100 dark:bg-purple-900/30'
    case 'loyalty_milestone':
      return 'bg-rose-100 dark:bg-rose-900/30'
    default:
      return 'bg-slate-100 dark:bg-slate-800'
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
    case 'medium':
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
    case 'low':
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
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

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}
