'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Users, MessageSquare, TrendingUp } from 'lucide-react'

interface ReplyFlowImpactProps {
  business: Business | null
}

interface ImpactMetrics {
  recoveredLeads: number
  textsSent: number
  customerReplies: number
}

export default function ReplyFlowImpact({ business }: ReplyFlowImpactProps) {
  const [metrics, setMetrics] = useState<ImpactMetrics>({
    recoveredLeads: 0,
    textsSent: 0,
    customerReplies: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchImpactMetrics = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Get last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        
        // Fetch recovered leads
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch texts sent
        const { data: messagesData } = await supabase
          .from('messages')
          .select('id')
          .eq('business_id', business.id)
          .eq('direction', 'outbound')
          .gte('created_at', thirtyDaysAgo)

        // Fetch customer replies
        const { data: repliesData } = await supabase
          .from('messages')
          .select('id')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')
          .gte('created_at', thirtyDaysAgo)

        setMetrics({
          recoveredLeads: leadsData?.length || 0,
          textsSent: messagesData?.length || 0,
          customerReplies: repliesData?.length || 0
        })
      } catch (error) {
        console.error('Error fetching impact metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchImpactMetrics()
  }, [business])

  const hasImpact = metrics.recoveredLeads > 0 || metrics.textsSent > 0 || metrics.customerReplies > 0

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">ReplyFlow Impact</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-6 bg-muted rounded w-8 mb-1"></div>
              <div className="h-3 bg-muted rounded w-12"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
            <TrendingUp className="w-3 h-3 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-sm font-medium text-foreground">ReplyFlow Impact</span>
        </div>
        <div className="text-xs text-muted-foreground">Last 30 days</div>
      </div>
      
      {hasImpact ? (
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <span className="text-blue-600 dark:text-blue-400 font-medium">
            {metrics.recoveredLeads} recovered
          </span>
          <span className="text-green-600 dark:text-green-400 font-medium">
            {metrics.textsSent} sent
          </span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">
            {metrics.customerReplies} replies
          </span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground mt-2">
          No missed calls yet. Metrics will appear automatically when customers call.
        </div>
      )}
    </div>
  )
}
