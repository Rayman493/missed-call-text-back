'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { MessageSquare, Users, TrendingUp, BarChart } from 'lucide-react'

interface LeadEngagementCardProps {
  business: Business | null
}

interface EngagementMetrics {
  totalLeads: number
  repliedLeads: number
  engagementRate: number
  recentReplies: number
}

export default function LeadEngagementCard({ business }: LeadEngagementCardProps) {
  const [metrics, setMetrics] = useState<EngagementMetrics>({
    totalLeads: 0,
    repliedLeads: 0,
    engagementRate: 0,
    recentReplies: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchEngagementMetrics = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Get all leads
        const { data: allLeads } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('business_id', business.id)

        // Get leads with replies (inbound messages)
        const { data: leadsWithReplies } = await supabase
          .from('messages')
          .select('lead_id')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')

        // Get recent replies (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: recentReplies } = await supabase
          .from('messages')
          .select('lead_id')
          .eq('business_id', business.id)
          .eq('direction', 'inbound')
          .gte('created_at', sevenDaysAgo)

        const totalLeads = allLeads?.length || 0
        const repliedLeadsSet = new Set(leadsWithReplies?.map((m: any) => m.lead_id) || [])
        const repliedLeads = repliedLeadsSet.size
        const engagementRate = totalLeads > 0 ? Math.round((repliedLeads / totalLeads) * 100) : 0
        const recentRepliesCount = recentReplies?.length || 0

        setMetrics({
          totalLeads,
          repliedLeads,
          engagementRate,
          recentReplies: recentRepliesCount
        })
      } catch (error) {
        console.error('Error fetching engagement metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchEngagementMetrics()
  }, [business])

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Lead Engagement</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="space-y-3">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-muted rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  const getEngagementColor = (rate: number) => {
    if (rate >= 30) return 'text-green-600 dark:text-green-400'
    if (rate >= 15) return 'text-amber-600 dark:text-amber-400'
    return 'text-slate-600 dark:text-slate-400'
  }

  const getEngagementBg = (rate: number) => {
    if (rate >= 30) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
    if (rate >= 15) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
    return 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-800'
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Customer Responses</h3>
        <div className="text-xs text-muted-foreground">
          Last 30 days
        </div>
      </div>

      {metrics.repliedLeads > 0 ? (
        <div className="space-y-4">
          {/* Main response metric */}
          <div className={`p-4 rounded-lg border ${getEngagementBg(metrics.engagementRate)}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Customer Responses</p>
                <div className="flex items-baseline gap-2">
                  <span className={`text-2xl font-bold ${getEngagementColor(metrics.engagementRate)}`}>
                    {metrics.repliedLeads}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    of {metrics.totalLeads} leads
                  </span>
                </div>
                {metrics.engagementRate > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics.engagementRate}% engagement rate
                  </p>
                )}
              </div>
              <div className="flex items-center justify-center w-12 h-12 bg-white dark:bg-slate-800 rounded-full">
                <MessageSquare className={`w-6 h-6 ${getEngagementColor(metrics.engagementRate)}`} />
              </div>
            </div>
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full mx-auto mb-2">
                <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">{metrics.totalLeads}</p>
              <p className="text-xs text-muted-foreground">Total Leads</p>
            </div>

            <div className="text-center p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-full mx-auto mb-2">
                <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <p className="text-lg font-semibold text-foreground">{metrics.recentReplies}</p>
              <p className="text-xs text-muted-foreground">Recent Replies</p>
            </div>
          </div>

          {/* Positive insight */}
          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              {metrics.engagementRate >= 30 
                ? 'Excellent customer engagement! Your follow-up strategy is working well.'
                : metrics.engagementRate >= 15
                ? 'Good customer engagement. Continue following up with leads.'
                : 'ReplyFlow is still following up automatically.'
              }
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">No customer replies yet</p>
          <p className="text-xs text-muted-foreground">
            ReplyFlow is still following up automatically.
          </p>
        </div>
      )}
    </div>
  )
}
