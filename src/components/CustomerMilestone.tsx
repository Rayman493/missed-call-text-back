'use client'

import React, { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { businessWinsService } from '@/lib/business-wins/business-wins-service'
import type { CustomerMilestone } from '@/lib/business-wins/business-wins-types'

interface CustomerMilestoneProps {
  businessId: string
  customerId: string
}

export default function CustomerMilestone({ businessId, customerId }: CustomerMilestoneProps) {
  const [milestone, setMilestone] = useState<CustomerMilestone | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    businessWinsService.getCustomerMilestone({ businessId, customerId })
      .then(setMilestone)
      .catch(err => {
        console.error('[CustomerMilestone] Failed to fetch milestone:', err)
      })
      .finally(() => setLoading(false))
  }, [businessId, customerId])

  if (loading || !milestone) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/50 rounded-lg">
      <Star className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-900 dark:text-foreground">
          {milestone.title}
        </div>
        <div className="text-[10px] text-slate-600 dark:text-slate-400">
          {milestone.description}
        </div>
      </div>
    </div>
  )
}
