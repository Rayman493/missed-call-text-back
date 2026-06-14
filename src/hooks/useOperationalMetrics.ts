'use client'

import { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'

export interface OperationalMetrics {
  totalLeads: number
  totalSmsSent: number
  totalRepliesReceived: number
  missedCallsCaptured: number
  hasLatestLead: boolean
  hasRecentMissedCallActivity: boolean
  loading: boolean
}

export function useOperationalMetrics(business: Business | null) {
  const [metrics, setMetrics] = useState<OperationalMetrics>({
    totalLeads: 0,
    totalSmsSent: 0,
    totalRepliesReceived: 0,
    missedCallsCaptured: 0,
    hasLatestLead: false,
    hasRecentMissedCallActivity: false,
    loading: true
  })

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!business) {
        setMetrics(prev => ({ ...prev, loading: false }))
        return
      }

      try {
        const supabase = createBrowserClient()

        // Fetch ALL leads (no time restriction for verification)
        const { data: allLeads } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('business_id', business.id)

        // Fetch ALL outbound messages (no time restriction)
        const { data: allMessages } = await supabase
          .from('messages')
          .select('id, direction, created_at')
          .eq('business_id', business.id)

        // Fetch leads from last 30 days for recent activity check
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        const { data: recentLeads } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        const totalLeads = allLeads?.length || 0
        const totalSmsSent = allMessages?.filter((m: any) => m.direction === 'outbound').length || 0
        const totalRepliesReceived = allMessages?.filter((m: any) => m.direction === 'inbound').length || 0
        const missedCallsCaptured = totalLeads // All leads = missed calls captured
        const hasLatestLead = totalLeads > 0
        const hasRecentMissedCallActivity = (recentLeads?.length || 0) > 0

        const computedMetrics = {
          totalLeads,
          totalSmsSent,
          totalRepliesReceived,
          missedCallsCaptured,
          hasLatestLead,
          hasRecentMissedCallActivity,
          loading: false
        }

        setMetrics(computedMetrics)
      } catch (error) {
        console.error('[OPERATIONAL METRICS] Error fetching:', error)
        setMetrics(prev => ({ ...prev, loading: false }))
      }
    }

    fetchMetrics()
  }, [business])

  return metrics
}
