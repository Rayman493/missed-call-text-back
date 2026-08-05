'use client'

import React, { useState, useEffect } from 'react'
import { Heart, Clock, DollarSign, MessageSquare, CreditCard, TrendingUp, Award, Activity, CheckCircle } from 'lucide-react'
import { relationshipService } from '@/lib/relationship-memory/relationship-memory-service'
import type { RelationshipProfile } from '@/lib/relationship-memory/relationship-memory-types'

interface RelationshipProfileProps {
  businessId: string
  customerId: string
}

export default function RelationshipProfile({ businessId, customerId }: RelationshipProfileProps) {
  const [profile, setProfile] = useState<RelationshipProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    relationshipService.getRelationshipProfile({ businessId, customerId })
      .then(setProfile)
      .catch(err => {
        console.error('[RelationshipProfile] Failed to fetch profile:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  if (loading || !profile) {
    return null
  }

  return (
    <div className="bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 border border-rose-200/70 dark:border-rose-800/50 rounded-xl p-3 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Heart className="w-4 h-4 text-rose-600 dark:text-rose-400" />
        <h3 className="text-xs font-semibold text-slate-900 dark:text-foreground">
          Relationship
        </h3>
      </div>

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

      <div className="space-y-2">
        {profile.favoriteService && (
          <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400">
            <Award className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{profile.favoriteService}</span>
          </div>
        )}
        {profile.nextLikelyService && (
          <div className="flex items-center gap-2 text-[10px] text-slate-600 dark:text-slate-400">
            <TrendingUp className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{profile.nextLikelyService}</span>
          </div>
        )}
      </div>
    </div>
  )
}

interface ProfileItemProps {
  icon: React.ReactNode
  label: string
  value: string
}

function ProfileItem({ icon, label, value }: ProfileItemProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </div>
        <div className="text-xs font-medium text-slate-900 dark:text-foreground truncate">
          {value}
        </div>
      </div>
    </div>
  )
}

interface QualityBadgeProps {
  label: string
  level: 'excellent' | 'good' | 'fair' | 'poor'
}

function QualityBadge({ label, level }: QualityBadgeProps) {
  const colors = getQualityColors(level)

  return (
    <div className="flex items-center gap-2">
      <div className="flex-shrink-0">
        <div className={`w-4 h-4 rounded-full ${colors.bg}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </div>
        <div className={`text-xs font-medium ${colors.text}`}>
          {capitalizeFirst(level)}
        </div>
      </div>
    </div>
  )
}

function getQualityColors(level: string): { bg: string; text: string } {
  switch (level) {
    case 'excellent':
      return { bg: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' }
    case 'good':
      return { bg: 'bg-blue-500', text: 'text-blue-600 dark:text-blue-400' }
    case 'fair':
      return { bg: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
    case 'poor':
      return { bg: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-400' }
    default:
      return { bg: 'bg-slate-500', text: 'text-slate-600 dark:text-slate-400' }
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
