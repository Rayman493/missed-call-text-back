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

interface TodayMetricsData {
  missedCalls: number
  newLeads: number
  messagesSent: number
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
  const [todayMetrics, setTodayMetrics] = useState<TodayMetricsData>({
    missedCalls: 0,
    newLeads: 0,
    messagesSent: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get data from the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        
        // Get data from today
        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const todayStartISO = todayStart.toISOString()
        
        console.log('[DASHBOARD METRICS QUERY]', { 
          businessId: business.id, 
          thirtyDaysAgo, 
          todayStartISO 
        })
        
        // Fetch leads (missed calls captured) - 30 days
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('id, created_at, caller_phone')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        console.log('[DASHBOARD LEAD COUNT]', { 
          count: leads?.length || 0, 
          leads, 
          error: leadsError 
        })

        // Fetch leads (missed calls captured) - today
        const { data: leadsToday } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', todayStartISO)

        // Fetch messages sent - 30 days
        // First get lead IDs for this business
        const { data: businessLeads } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        const leadIds = businessLeads?.map((l: any) => l.id) || []

        console.log('[DASHBOARD LEAD IDS]', {
          businessId: business.id,
          leadIds,
          count: leadIds.length
        })

        // Then fetch messages for those leads
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .in('lead_id', leadIds)
          .gte('created_at', thirtyDaysAgo)

        console.log('[DASHBOARD ALL MESSAGES RAW]', {
          businessId: business.id,
          leadIds,
          totalMessages: messages?.length || 0,
          messages: messages,
          error: messagesError
        })

        // Filter outbound messages more robustly
        const outboundMessages = messages?.filter((m: any) => {
          const isDirectionOutbound = m.direction === 'outbound' || m.direction?.startsWith?.('outbound')
          const isFromBusinessPhone = m.from_phone === business.twilio_phone_number
          const result = isDirectionOutbound || isFromBusinessPhone
          console.log('[DASHBOARD MESSAGE FILTER]', {
            messageId: m.id,
            direction: m.direction,
            fromPhone: m.from_phone,
            toPhone: m.to_phone,
            isDirectionOutbound,
            isFromBusinessPhone,
            result,
            businessPhone: business.twilio_phone_number
          })
          return result
        }) || []

        console.log('[DASHBOARD MESSAGE COUNT]', {
          totalCount: messages?.length || 0,
          outboundCount: outboundMessages.length,
          businessPhone: business.twilio_phone_number,
          outboundSample: outboundMessages.slice(0, 3),
          error: messagesError
        })

        // Fetch messages sent - today
        const { data: businessLeadsToday } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', todayStartISO)

        const leadIdsToday = businessLeadsToday?.map((l: any) => l.id) || []

        const { data: messagesToday } = await supabase
          .from('messages')
          .select('direction, created_at, from_phone')
          .in('lead_id', leadIdsToday)
          .gte('created_at', todayStartISO)

        // Fetch active conversations (leads with recent activity)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: activeConversations } = await supabase
          .from('leads')
          .select('id')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)

        console.log('[DASHBOARD ACTIVE CONVERSATIONS]', { 
          count: activeConversations?.length || 0, 
          sevenDaysAgo 
        })

        // Calculate metrics - 30 days
        const missedCallsCaptured = leads?.length || 0
        const leadsGenerated = missedCallsCaptured
        const messagesSent = outboundMessages.length
        const activeConversationsCount = activeConversations?.length || 0
        // Recovery rate should be recovered leads / captured leads, not messages sent / captured leads
        const recoveryRate = missedCallsCaptured > 0 ? Math.min(100, Math.max(0, Math.round((activeConversationsCount / missedCallsCaptured) * 100))) : 0

        console.log('[DASHBOARD RECOVERY RATE]', {
          numerator: activeConversationsCount,
          denominator: missedCallsCaptured,
          finalRate: recoveryRate
        })

        // Calculate metrics - today
        const missedCallsToday = leadsToday?.length || 0
        const newLeadsToday = missedCallsToday
        const messagesSentToday = messagesToday?.filter((m: any) => {
          const isDirectionOutbound = m.direction === 'outbound' || m.direction?.startsWith?.('outbound')
          const isFromBusinessPhone = m.from_phone === business.twilio_phone_number
          return isDirectionOutbound || isFromBusinessPhone
        }).length || 0

        setMetrics({
          missedCallsCaptured,
          leadsGenerated,
          messagesSent,
          activeConversations: activeConversationsCount,
          recoveryRate,
          period: '30 days'
        })
        
        setTodayMetrics({
          missedCalls: missedCallsToday,
          newLeads: newLeadsToday,
          messagesSent: messagesSentToday
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
        return <PhoneMissed className="w-4 h-4 sm:w-5 sm:h-5" />
      case 'leads':
        return <Users className="w-4 h-4 sm:w-5 sm:h-5" />
      case 'messages':
        return <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
      case 'conversations':
        return <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
      case 'recovery':
        return <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
      default:
        return <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
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
        return 'Missed Calls'
      case 'leads':
        return 'Leads'
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-3 sm:p-4">
            <div className="animate-pulse">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-200 dark:bg-slate-700 rounded-lg mb-3 sm:mb-4"></div>
              <div className="h-6 sm:h-8 bg-slate-200 dark:bg-slate-700 rounded mb-1.5 sm:mb-2"></div>
              <div className="h-3 sm:h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Primary KPI Cards - Leads Generated and Recovery Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {[
          { type: 'leads', value: metrics.leadsGenerated },
          { type: 'recovery', value: metrics.recoveryRate }
        ].map((metric) => (
          <div key={metric.type} className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 h-28 sm:h-32 flex flex-col">
            <div className="flex items-start justify-between mb-1.5 sm:mb-2">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 ${getMetricColor(metric.type)} rounded-lg flex items-center justify-center border shadow-sm`}>
                {getMetricIcon(metric.type)}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-medium">
                {metrics.period}
              </div>
            </div>
            <div className="space-y-0.5 sm:space-y-1 flex-1">
              <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
                {metric.type === 'recovery' ? `${metric.value}%` : metric.value.toLocaleString()}
              </div>
              <div className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
                {getMetricLabel(metric.type)}
              </div>
              {metric.value === 0 && metric.type !== 'recovery' && (
                <div className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5 sm:mt-1">
                  {getEmptyStateText(metric.type)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary KPI Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { type: 'missedCalls', value: metrics.missedCallsCaptured },
          { type: 'messages', value: metrics.messagesSent },
          { type: 'conversations', value: metrics.activeConversations }
        ].map((metric) => (
          <div key={metric.type} className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-2.5 sm:p-3 h-24 sm:h-28 flex flex-col">
            <div className="flex items-center justify-between mb-1.5 sm:mb-2">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 ${getMetricColor(metric.type)} rounded-lg flex items-center justify-center border`}>
                {getMetricIcon(metric.type)}
              </div>
              <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                {metrics.period}
              </div>
            </div>
            <div className="space-y-0.5 flex-1">
              <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-foreground leading-tight">
                {metric.value.toLocaleString()}
              </div>
              <div className="text-[9px] sm:text-[10px] font-medium text-slate-500 dark:text-slate-400">
                {getMetricLabel(metric.type)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
