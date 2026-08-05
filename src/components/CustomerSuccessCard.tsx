'use client'

import React, { useState, useEffect } from 'react'
import { Heart, TrendingUp, Clock, DollarSign, Award, AlertCircle } from 'lucide-react'
import { customerSuccessService } from '@/lib/customer-success/customer-success-service'
import type { CustomerSuccessProfile } from '@/lib/customer-success/customer-success-types'

interface CustomerSuccessCardProps {
  businessId: string
  customerId: string
}

export default function CustomerSuccessCard({ businessId, customerId }: CustomerSuccessCardProps) {
  const [profile, setProfile] = useState<CustomerSuccessProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    customerSuccessService.getSuccessProfile({ businessId, customerId })
      .then(setProfile)
      .catch(err => {
        console.error('[CustomerSuccessCard] Failed to fetch profile:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  if (loading || !profile) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200/70 dark:border-emerald-800/50 rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">
          Success
        </h3>
      </div>

      {/* Health Status */}
      <div className="mb-3">
        <HealthBadge health={profile.health} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900 dark:text-foreground">
            {profile.completedJobs}
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Jobs
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900 dark:text-foreground">
            {formatCurrency(profile.lifetimeRevenue)}
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Revenue
          </div>
        </div>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900 dark:text-foreground">
            {profile.relationshipAge}
          </div>
          <div className="text-[9px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Age
          </div>
        </div>
      </div>

      {/* Next Opportunity */}
      {profile.nextOpportunity && (
        <div className="bg-white/50 dark:bg-slate-900/30 rounded-lg p-2">
          <div className="text-[10px] font-medium text-slate-900 dark:text-foreground mb-1">
            {profile.nextOpportunity.title}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-slate-500 dark:text-slate-400">
            <Clock className="w-3 h-3" />
            <span>{profile.nextOpportunity.timing}</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface HealthBadgeProps {
  health: 'excellent' | 'healthy' | 'needs_attention' | 'at_risk'
}

function HealthBadge({ health }: HealthBadgeProps) {
  const colors = getHealthColors(health)

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${colors.bg}`}>
      <div className={`w-2 h-2 rounded-full ${colors.dotBg}`} />
      <span className={`text-xs font-medium ${colors.text}`}>
        {capitalizeFirst(health.replace('_', ' '))}
      </span>
    </div>
  )
}

interface MilestoneBadgeProps {
  milestone: any
}

function MilestoneBadge({ milestone }: MilestoneBadgeProps) {
  return (
    <div className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-md text-[10px] font-medium">
      {milestone.title}
    </div>
  )
}

function getHealthColors(health: string): { bg: string; text: string; dotBg: string } {
  switch (health) {
    case 'excellent':
      return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dotBg: 'bg-emerald-500' }
    case 'healthy':
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dotBg: 'bg-blue-500' }
    case 'needs_attention':
      return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dotBg: 'bg-amber-500' }
    case 'at_risk':
      return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', dotBg: 'bg-red-500' }
    default:
      return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', dotBg: 'bg-slate-500' }
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
