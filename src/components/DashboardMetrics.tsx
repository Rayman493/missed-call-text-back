'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, Users, MessageSquare, Reply, TrendingUp, Activity, PhoneMissed, HelpCircle } from 'lucide-react'

interface DashboardMetricsProps {
  business: Business | null
}

interface MetricsData {
  missedCallsCaptured: number
  leadsGenerated: number
  messagesSent: number
  followUpsSent: number
  customerReplies: number
  recoveredLeads: number
  recoveryRate: number
  followUpResponseRate: number
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
    followUpsSent: 0,
    customerReplies: 0,
    recoveredLeads: 0,
    recoveryRate: 0,
    followUpResponseRate: 0,
    period: '30 days'
  })
  const [todayMetrics, setTodayMetrics] = useState<TodayMetricsData>({
    missedCalls: 0,
    newLeads: 0,
    messagesSent: 0
  })
  const [loading, setLoading] = useState(true)
  const [isBackgroundRefresh, setIsBackgroundRefresh] = useState(false)

  const fetchMetrics = useCallback(async (background = false) => {
    if (!business) return

    // Skip loading state for background refresh to prevent flicker
    if (background) {
      setIsBackgroundRefresh(true)
    } else {
      setLoading(true)
    }

    try {
      const supabase = createBrowserClient()
      
      // Get data from the last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      
      // Get data from today
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayStartISO = todayStart.toISOString()
      
      // Fetch leads (missed calls captured) - 30 days
      const { data: leads } = await supabase
        .from('leads')
        .select('id, created_at, caller_phone')
        .eq('business_id', business.id)
        .gte('created_at', thirtyDaysAgo)

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

      // Then fetch messages for those leads - only if there are leads
      let messages = []
      if (leadIds.length > 0) {
        const { data: messagesData } = await supabase
          .from('messages')
          .select('*')
          .in('lead_id', leadIds)
          .gte('created_at', thirtyDaysAgo)
        messages = messagesData || []
      }

      // Filter outbound messages more robustly
      const outboundMessages = messages?.filter((m: any) => {
        const isDirectionOutbound = m.direction === 'outbound' || m.direction?.startsWith?.('outbound')
        const isFromBusinessPhone = m.from_phone === business.twilio_phone_number
        return isDirectionOutbound || isFromBusinessPhone
      }) || []

      // Filter inbound messages (customer replies)
      const inboundMessages = messages?.filter((m: any) => {
        const isDirectionInbound = m.direction === 'inbound' || m.direction?.startsWith?.('inbound')
        const isToBusinessPhone = m.to_phone === business.twilio_phone_number
        return isDirectionInbound || isToBusinessPhone
      }) || []

      // Fetch messages sent - today
      const { data: businessLeadsToday } = await supabase
        .from('leads')
        .select('id')
        .eq('business_id', business.id)
        .gte('created_at', todayStartISO)

      const leadIdsToday = businessLeadsToday?.map((l: any) => l.id) || []

      let messagesToday = []
      if (leadIdsToday.length > 0) {
        const { data: messagesTodayData } = await supabase
          .from('messages')
          .select('direction, created_at, from_phone')
          .in('lead_id', leadIdsToday)
          .gte('created_at', todayStartISO)
        messagesToday = messagesTodayData || []
      }

      // Fetch follow-ups sent - 30 days
      const { data: followUpJobs } = await supabase
        .from('follow_up_jobs')
        .select('id, status, cancelled_reason')
        .eq('business_id', business.id)
        .gte('created_at', thirtyDaysAgo)

      const followUpsSent = followUpJobs?.filter((f: any) => f.status === 'sent').length || 0
      const followUpsCancelled = followUpJobs?.filter((f: any) => f.status === 'cancelled' && f.cancelled_reason === 'customer_replied').length || 0
      
      // Calculate follow-up response rate: customer replies / (sent + customer replies)
      const followUpResponseRate = (followUpsSent + followUpsCancelled) > 0 
        ? Math.round((followUpsCancelled / (followUpsSent + followUpsCancelled)) * 100) 
        : 0

      // Calculate metrics - 30 days
      // Exclude manual leads from captured leads count
      // Manual leads are identified by raw_metadata.source = 'manual_entry' or 'manual_backfill'
      const capturedLeads = leads?.filter((l: any) => 
        l.raw_metadata?.source !== 'manual_entry' && l.raw_metadata?.source !== 'manual_backfill'
      ) || []
      const missedCallsCaptured = capturedLeads.length
      const leadsGenerated = missedCallsCaptured
      const messagesSent = outboundMessages.length
      const customerReplies = inboundMessages.length
      
      // Recovery rate: recovered leads / captured leads
      // A lead is recovered if it has at least one inbound customer message (customer replied)
      const recoveredLeadsSet = new Set(inboundMessages?.map((m: any) => m.lead_id) || [])
      const recoveredLeadsCount = recoveredLeadsSet.size
      const recoveryRate = missedCallsCaptured > 0 ? Math.min(100, Math.max(0, Math.round((recoveredLeadsCount / missedCallsCaptured) * 100))) : 0

      // Calculate metrics - today
      // Exclude manual leads from today's captured leads
      const capturedLeadsToday = leadsToday?.filter((l: any) => 
        l.raw_metadata?.source !== 'manual_entry' && l.raw_metadata?.source !== 'manual_backfill'
      ) || []
      const missedCallsToday = capturedLeadsToday.length
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
        followUpsSent,
        customerReplies,
        recoveredLeads: recoveredLeadsCount,
        recoveryRate,
        followUpResponseRate,
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
      setIsBackgroundRefresh(false)
    }
  }, [business])

  // Initial fetch
  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  // Realtime subscription for live metric updates
  useEffect(() => {
    if (!business) return

    const supabase = createBrowserClient()
    const channel = supabase
      .channel('dashboard-metrics-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `business_id=eq.${business.id}`
        },
        () => {
          fetchMetrics(true) // Use background refresh to prevent flicker
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages'
        },
        (payload: any) => {
          // Only refetch if the message belongs to this business's leads
          // We fetch metrics which includes business-scoped queries
          fetchMetrics(true) // Use background refresh to prevent flicker
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follow_up_jobs',
          filter: `business_id=eq.${business.id}`
        },
        () => {
          fetchMetrics(true) // Use background refresh to prevent flicker
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [business, fetchMetrics])

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
        return 'Captured Leads'
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
        return 'No captured leads yet'
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
        return 'Leads captured from missed calls and customer inquiries'
      case 'leads':
        return 'Total leads generated from missed calls and customer inquiries'
      case 'messages':
        return 'Automated and manual text messages sent by ReplyFlow'
      case 'conversations':
        return 'Leads with ongoing conversations that have not been completed'
      case 'recovery':
        return 'Percentage of missed callers successfully engaged by ReplyFlow'
      default:
        return 'Business metric'
    }
  }

  const getMetricTooltip = (type: string) => {
    switch (type) {
      case 'missedCalls':
        return null
      case 'leads':
        return null
      case 'messages':
        return 'Automated and manual text messages sent by ReplyFlow'
      case 'conversations':
        return 'Leads with ongoing conversations that have not been completed'
      case 'recovery':
        return 'Percentage of missed callers successfully engaged by ReplyFlow'
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-3 sm:p-4">
          <div className="animate-pulse">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-slate-200 dark:bg-slate-700 rounded-lg mb-4"></div>
            <div className="h-8 sm:h-10 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
            <div className="h-4 sm:h-5 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {/* Recovery Rate - Key business impact metric */}
      <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 min-h-[7rem] sm:min-h-[8rem] flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-center shadow-sm">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            {metrics.period}
          </div>
        </div>
        <div className="space-y-1.5 flex-1">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
            {metrics.recoveryRate}%
          </div>
          <div className="flex items-center gap-1">
            <div className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-400">
              Recovery Rate
            </div>
            <span className="inline-flex items-center cursor-help" title="Percentage of leads that replied to your messages">
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400 transition-colors" />
            </span>
          </div>
          {metrics.recoveryRate === 0 && (
            <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
              No recovered leads yet
            </div>
          )}
        </div>
      </div>

      {/* Captured Leads - Lead generation metric */}
      <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 min-h-[7rem] sm:min-h-[8rem] flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-center shadow-sm">
            <PhoneMissed className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            {metrics.period}
          </div>
        </div>
        <div className="space-y-1.5 flex-1">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
            {metrics.missedCallsCaptured}
          </div>
          <div className="flex items-center gap-1">
            <div className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-400">
              Captured Leads
            </div>
            <span className="inline-flex items-center cursor-help" title="Leads captured by ReplyFlow from missed calls and customer inquiries">
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400 transition-colors" />
            </span>
          </div>
          {metrics.missedCallsCaptured === 0 && (
            <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
              No captured leads yet
            </div>
          )}
        </div>
      </div>

      {/* Messages Sent - Communication volume metric */}
      <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 min-h-[7rem] sm:min-h-[8rem] flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800 rounded-lg flex items-center justify-center shadow-sm">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            {metrics.period}
          </div>
        </div>
        <div className="space-y-1.5 flex-1">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
            {metrics.messagesSent}
          </div>
          <div className="flex items-center gap-1">
            <div className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-400">
              Messages Sent
            </div>
            <span className="inline-flex items-center cursor-help" title="Automated and manual messages sent to leads">
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400 transition-colors" />
            </span>
          </div>
          {metrics.messagesSent === 0 && (
            <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
              No messages sent yet
            </div>
          )}
        </div>
      </div>

      {/* Customer Replies - Engagement metric */}
      <div className="bg-white dark:bg-card rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 p-3 sm:p-4 min-h-[7rem] sm:min-h-[8rem] flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg flex items-center justify-center shadow-sm">
            <Reply className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
            {metrics.period}
          </div>
        </div>
        <div className="space-y-1.5 flex-1">
          <div className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 dark:text-foreground leading-tight tracking-tight">
            {metrics.customerReplies}
          </div>
          <div className="flex items-center gap-1">
            <div className="text-sm sm:text-base font-medium text-slate-600 dark:text-slate-400">
              Customer Replies
            </div>
            <span className="inline-flex items-center cursor-help" title="Inbound messages received from leads">
              <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400 transition-colors" />
            </span>
          </div>
          {metrics.customerReplies === 0 && (
            <div className="text-xs sm:text-sm text-slate-400 dark:text-slate-500">
              No customer replies yet
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
