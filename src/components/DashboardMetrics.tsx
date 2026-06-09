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
      {/* Primary KPI Cards - Leads Generated and Recovery Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { type: 'leads', value: metrics.leadsGenerated },
          { type: 'recovery', value: metrics.recoveryRate }
        ].map((metric) => (
          <div key={metric.type} className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-12 h-12 ${getMetricColor(metric.type)} rounded-lg flex items-center justify-center border shadow-sm`}>
                {getMetricIcon(metric.type)}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {metrics.period}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
                {metric.type === 'recovery' ? `${metric.value}%` : metric.value.toLocaleString()}
              </div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                {getMetricLabel(metric.type)}
              </div>
              {metric.value === 0 && metric.type !== 'recovery' && (
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  {getEmptyStateText(metric.type)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Secondary KPI Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { type: 'missedCalls', value: metrics.missedCallsCaptured },
          { type: 'messages', value: metrics.messagesSent },
          { type: 'conversations', value: metrics.activeConversations }
        ].map((metric) => (
          <div key={metric.type} className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-8 h-8 ${getMetricColor(metric.type)} rounded-lg flex items-center justify-center border`}>
                {getMetricIcon(metric.type)}
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-2xl font-bold text-slate-900 dark:text-foreground leading-tight">
                {metric.value.toLocaleString()}
              </div>
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {getMetricLabel(metric.type)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Business Activity Card */}
      <div className="bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/50 dark:to-slate-900/30 rounded-xl border border-slate-200/70 dark:border-slate-700/50 shadow-sm p-4 sm:p-5">
        <h3 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-foreground mb-4">Business Activity</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
          {/* Today */}
          <div>
            <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Today</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">Missed Calls</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{todayMetrics.missedCalls}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">New Leads</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{todayMetrics.newLeads}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">Messages Sent</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{todayMetrics.messagesSent}</span>
              </div>
            </div>
          </div>
          {/* Last 30 Days */}
          <div>
            <h4 className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-3">Last 30 Days</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">Leads Captured</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{metrics.leadsGenerated}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">Conversations Started</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{metrics.activeConversations}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 dark:text-slate-400">Recovery Rate</span>
                <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{metrics.recoveryRate}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Simplified Empty State - only show when no leads exist */}
      {metrics.leadsGenerated === 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-200 dark:border-blue-800 p-4 sm:p-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground">
                You're ready to start capturing leads
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Follow these steps to see your first lead appear
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-semibold">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">Verify call forwarding</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Ensure your business phone is forwarding to ReplyFlow</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-semibold">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">Place a test call</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Call your business number from another phone</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-semibold">3</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-foreground">Watch your first lead appear</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">The lead will show up in your dashboard</p>
                </div>
              </div>
            </div>
            <button
              onClick={() => window.location.href = '/dashboard/test-setup'}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm hover:shadow-md"
            >
              <Phone className="w-4 h-4" />
              Run Test Call
            </button>
          </div>
        </div>
      )}

      {/* ReplyFlow is Live - show when leads exist */}
      {metrics.leadsGenerated > 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800 p-4 sm:p-6">
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-foreground flex items-center gap-2">
                <span className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></span>
                ReplyFlow is Live
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
                Your lead capture system is active and working
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">{metrics.leadsGenerated}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Leads Captured</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">{metrics.activeConversations}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">Active Conversations</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-foreground">{todayMetrics.newLeads}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">New Today</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
