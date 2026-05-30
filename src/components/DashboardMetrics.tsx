'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, Users, MessageSquare, Reply, TrendingUp, Activity, PhoneMissed } from 'lucide-react'

interface DashboardMetricsProps {
  business: Business | null
}

interface MetricsData {
  missedCallsCaptured: number
  leadsGenerated: number
  messagesSent: number
  activeConversations: number
  period: string
}

export default function DashboardMetrics({ business }: DashboardMetricsProps) {
  const [metrics, setMetrics] = useState<MetricsData>({
    missedCallsCaptured: 0,
    leadsGenerated: 0,
    messagesSent: 0,
    activeConversations: 0,
    period: '30 days'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get data from the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        
        // Fetch leads (missed calls captured)
        const { data: leads } = await supabase
          .from('leads')
          .select('created_at, phone_number')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch messages sent
        const { data: messages } = await supabase
          .from('messages')
          .select('direction, created_at, phone_number')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch active conversations (leads with recent activity)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: activeConversations } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)

        // Calculate metrics
        const missedCallsCaptured = leads?.length || 0
        const leadsGenerated = missedCallsCaptured // Each missed call captured = lead generated
        const messagesSent = messages?.filter((m: any) => m.direction === 'outbound').length || 0
        const activeConversationsCount = activeConversations?.length || 0

        setMetrics({
          missedCallsCaptured,
          leadsGenerated,
          messagesSent,
          activeConversations: activeConversationsCount,
          period: '30 days'
        })
      } catch (error) {
        console.error('Error fetching dashboard metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [business])

  const getMetricIcon = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return <PhoneMissed className="w-6 h-6" />
      case 'leads':
        return <Users className="w-6 h-6" />
      case 'messages':
        return <MessageSquare className="w-6 h-6" />
      case 'conversations':
        return <Activity className="w-6 h-6" />
      default:
        return <TrendingUp className="w-6 h-6" />
    }
  }

  const getMetricColor = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
      case 'leads':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
      case 'messages':
        return 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800'
      case 'conversations':
        return 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800'
      default:
        return 'bg-slate-100 dark:bg-slate-900/30 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
    }
  }

  const getMetricAccentColor = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return 'bg-blue-500'
      case 'leads':
        return 'bg-emerald-500'
      case 'messages':
        return 'bg-purple-500'
      case 'conversations':
        return 'bg-orange-500'
      default:
        return 'bg-slate-500'
    }
  }

  const getMetricLabel = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return 'Missed Calls Captured'
      case 'leads':
        return 'Leads Generated'
      case 'messages':
        return 'Messages Sent'
      case 'conversations':
        return 'Active Conversations'
      default:
        return 'Metric'
    }
  }

  const getMetricDescription = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return 'Missed calls that were captured and converted to leads'
      case 'leads':
        return 'Total leads generated from missed calls and customer inquiries'
      case 'messages':
        return 'Automated messages sent to customers'
      case 'conversations':
        return 'Active customer conversations in progress'
      default:
        return 'Business metric'
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4">
            <div className="animate-pulse">
              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-lg mb-4"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {[
          { type: 'missedCalls', value: metrics.missedCallsCaptured },
          { type: 'leads', value: metrics.leadsGenerated },
          { type: 'messages', value: metrics.messagesSent },
          { type: 'conversations', value: metrics.activeConversations }
        ].map((metric) => (
          <div key={metric.type} className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
            <div className={`h-1 ${getMetricAccentColor(metric.type)}`}></div>
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 ${getMetricColor(metric.type)} rounded-lg flex items-center justify-center border`}>
                  {getMetricIcon(metric.type)}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                  {metrics.period}
                </div>
              </div>

              <div className="space-y-0.5">
                <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">
                  {metric.value.toLocaleString()}
                </div>
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {getMetricLabel(metric.type)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State Guidance */}
      {metrics.missedCallsCaptured === 0 && metrics.leadsGenerated === 0 && metrics.messagesSent === 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-200 dark:border-blue-800 p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-foreground">
                Ready to capture your first missed call?
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Once your phone forwarding is set up, ReplyFlow will automatically capture missed calls and convert them into leads. 
                These metrics will show your business growth in real-time.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                  <span>Missed calls captured appear here</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
                  <span>Leads are generated automatically</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <span>Messages sent to customers</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
