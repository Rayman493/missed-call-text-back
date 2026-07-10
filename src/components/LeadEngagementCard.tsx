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
        
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Get leads from the last 30 days
        const { data: allLeads } = await supabase
          .from('leads')
          .select('id, created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        const businessPhone = business.twilio_phone_number || ''

        // Get leads with replies (inbound messages to business phone)
        // Use dual filter for consistency with DashboardMetrics and AnalyticsContent
        const leadIds = allLeads?.map((l: any) => l.id) || []
        const { data: allMessages } = leadIds.length > 0 ? await supabase
          .from('messages')
          .select('lead_id, direction, to_phone, created_at')
          .in('lead_id', leadIds)
          .gte('created_at', thirtyDaysAgo) : { data: [] }

        const leadsWithReplies = allMessages?.filter((m: any) => {
          const isDirectionInbound = m.direction === 'inbound' || m.direction?.startsWith?.('inbound')
          const isToBusinessPhone = m.to_phone === businessPhone
          return isDirectionInbound || isToBusinessPhone
        }) || []

        // Get recent replies (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const recentReplies = leadsWithReplies.filter((m: any) => new Date(m.created_at) >= new Date(sevenDaysAgo))

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
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Customer Responses</h3>
          <div className="text-xs text-slate-500 dark:text-slate-400">Loading...</div>
        </div>
        <div className="space-y-3">
          <div className="animate-pulse">
            <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
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

  // Hide card entirely if there are no customer responses (low-value empty state)
  if (metrics.repliedLeads === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Customer Responses</h3>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Last 30 days
        </div>
      </div>

      {metrics.repliedLeads > 0 && (
        <div className="space-y-3">
          {/* Main response metric */}
          <div className={`p-3 rounded-lg border ${getEngagementBg(metrics.engagementRate)}`}>
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
      )}
    </div>
  )
}
