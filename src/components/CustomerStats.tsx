'use client'

import React, { useState, useEffect } from 'react'
import { Briefcase, DollarSign, Calendar } from 'lucide-react'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'

interface CustomerStatsProps {
  businessId: string
  customerId: string
}

export default function CustomerStats({ businessId, customerId }: CustomerStatsProps) {
  const [stats, setStats] = useState<{ jobs: number; revenue: number; customerSince: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // Use the existing relationship service to get stats
    import('@/lib/relationship-memory/relationship-memory-service').then(({ relationshipService }) => {
      relationshipService.getRelationshipProfile({ businessId, customerId })
        .then(profile => {
          if (profile) {
            setStats({
              jobs: profile.completedJobs || 0,
              revenue: profile.lifetimeRevenue || 0,
              customerSince: profile.relationshipAge || null
            })
          }
        })
        .catch(err => {
          console.error('[CustomerStats] Failed to fetch profile:', err)
        })
        .finally(() => setLoading(false))
    })
  }, [businessId, customerId])

  if (loading || !stats) {
    return null
  }

  return (
    <div className="bg-muted/30 rounded-xl border border-border/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Briefcase className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Customer Activity
        </h3>
      </div>

      <div className="space-y-2">
        {/* Jobs */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Jobs</span>
          <span className="text-xs font-medium text-foreground">
            {stats.jobs}
          </span>
        </div>

        {/* Revenue */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Revenue</span>
          <span className="text-xs font-medium text-foreground">
            {formatCurrency(stats.revenue)}
          </span>
        </div>

        {/* Customer Since */}
        {stats.customerSince && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Customer since</span>
            <span className="text-xs font-medium text-foreground">
              {stats.customerSince}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
