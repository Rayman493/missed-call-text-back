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
  recoveryRate: number
  period: string
}

export default function DashboardMetrics({ business }: DashboardMetricsProps) {
  const [metrics, setMetrics] = useState<MetricsData>({
    missedCallsCaptured: 0,
    leadsGenerated: 0,
    messagesSent: 0,
    activeConversations: 0,
    recoveryRate: 0,
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
        const recoveryRate = leadsGenerated > 0 ? Math.round((messagesSent / leadsGenerated) * 100) : 0

        setMetrics({
          missedCallsCaptured,
          leadsGenerated,
          messagesSent,
          activeConversations: activeConversationsCount,
          recoveryRate,
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
      case 'recovery':
        return <TrendingUp className="w-6 h-6" />
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
      case 'recovery':
        return 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
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
      case 'recovery':
        return 'bg-rose-500'
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
      case 'recovery':
        return 'Recovery Rate'
      default:
        return 'Metric'
    }
  }

  const getEmptyStateText = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return 'No missed calls yet'
      case 'leads':
        return 'Waiting for first lead'
      case 'messages':
        return 'No conversations yet'
      case 'conversations':
        return 'No active conversations'
      default:
        return ''
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { type: 'missedCalls', value: metrics.missedCallsCaptured },
          { type: 'leads', value: metrics.leadsGenerated },
          { type: 'messages', value: metrics.messagesSent },
          { type: 'conversations', value: metrics.activeConversations },
          { type: 'recovery', value: metrics.recoveryRate }
        ].map((metric) => (
          <div key={metric.type} className="bg-gradient-to-br from-card to-muted/30 dark:from-card dark:to-slate-900/30 rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm hover:shadow-lg hover:shadow-slate-200/50 dark:hover:shadow-slate-900/50 transition-all duration-300 overflow-hidden flex flex-col">
            <div className={`h-1.5 bg-gradient-to-r ${getMetricAccentColor(metric.type)} to-transparent opacity-80`}></div>
            <div className="p-3.5 sm:p-4 flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 ${getMetricColor(metric.type)} rounded-lg flex items-center justify-center border shadow-sm`}>
                  {getMetricIcon(metric.type)}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full font-medium">
                  {metrics.period}
                </div>
              </div>

              <div className="space-y-0.5 flex-1 flex flex-col justify-center">
                <div className="text-2.5xl sm:text-3xl md:text-3.5xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
                  {metric.type === 'recovery' ? `${metric.value}%` : metric.value.toLocaleString()}
                </div>
                <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {getMetricLabel(metric.type)}
                </div>
                {metric.value === 0 && metric.type !== 'recovery' && (
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    {getEmptyStateText(metric.type)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Simplified Empty State */}
      {metrics.missedCallsCaptured === 0 && metrics.leadsGenerated === 0 && metrics.messagesSent === 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground">
                No missed calls captured yet
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Run a test call to verify your setup and see your first lead appear here.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/dashboard/test-setup'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
            >
              Run Test Call
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
