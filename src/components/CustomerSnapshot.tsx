'use client'

import React from 'react'
import { User, Clock, Calendar, ArrowRight } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { getCustomerSourceInfo } from '@/lib/customer-source'
import { getLeadLifecycleStatus, getLeadStatusLabel } from '@/lib/lead-lifecycle'
import { getLeadDisplayName } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'

interface CustomerSnapshotProps {
  lead: any
  leadData: any
}

export default function CustomerSnapshot({ lead, leadData }: CustomerSnapshotProps) {
  const displayName = getLeadDisplayName(leadData || lead)
  const intake = getLeadAIIntake(leadData || lead)
  const customerName = intake.customerName || leadData?.name || lead?.name || displayName

  // Get customer status
  const lifecycleStatus = getLeadLifecycleStatus(leadData || lead)
  const statusLabel = getLeadStatusLabel(lifecycleStatus)

  // Get customer source
  const sourceInfo = getCustomerSourceInfo(leadData || lead)

  // Get customer since (created date)
  const createdAt = leadData?.created_at || lead?.created_at
  const customerSince = createdAt ? formatRelativeTime(createdAt) : null

  // Get last activity
  const lastActivity = leadData?.last_activity_at || lead?.last_activity_at
  const lastActivityText = lastActivity ? formatRelativeTime(lastActivity) : null

  return (
    <div className="bg-muted/30 rounded-xl border border-border/30 p-4">
      <div className="flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Customer Snapshot
        </h3>
      </div>

      <div className="space-y-2">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Status</span>
          <span className="text-xs font-medium text-foreground">
            {statusLabel}
          </span>
        </div>

        {/* Source */}
        {sourceInfo && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Source</span>
            <span className="text-xs font-medium text-foreground">
              {sourceInfo.label}
            </span>
          </div>
        )}

        {/* Customer Since */}
        {customerSince && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Customer since</span>
            <span className="text-xs font-medium text-foreground">
              {customerSince}
            </span>
          </div>
        )}

        {/* Last Activity */}
        {lastActivityText && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Last activity</span>
            <span className="text-xs font-medium text-foreground">
              {lastActivityText}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
