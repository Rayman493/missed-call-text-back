'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, Users, MessageSquare, Reply, Clock, PhoneMissed, TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface BusinessSnapshotProps {
  business: Business | null
}

interface KPIData {
  leadsRecovered: number
  textsSent: number
  repliesReceived: number
  activeFollowUps: number
  missedCallsCaptured: number
  avgResponseTime: number | null
  period: string
}

export default function BusinessSnapshot({ business }: BusinessSnapshotProps) {
  const [kpiData, setKpiData] = useState<KPIData>({
    leadsRecovered: 0,
    textsSent: 0,
    repliesReceived: 0,
    activeFollowUps: 0,
    missedCallsCaptured: 0,
    avgResponseTime: null,
    period: '30 days'
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchKPIData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Get data from the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Fetch leads (leads recovered)
        const { data: leads } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch missed calls from call_events (actual missed calls, not leads)
        const { count: missedCallsCount } = await supabase
          .from('call_events')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch messages sent and received
        const { data: messages } = await supabase
          .from('messages')
          .select('direction, created_at, from_phone, to_phone')
          .or(`from_phone.eq.${business.twilio_phone_number || ''},to_phone.eq.${business.twilio_phone_number || ''}`)
          .gte('created_at', thirtyDaysAgo)

        // Fetch active follow-ups
        const { data: followUpJobs } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('business_id', business.id)
          .in('status', ['pending', 'scheduled', 'in_progress'])

        // Calculate KPIs
        const leadsRecovered = leads?.length || 0
        const missedCallsCaptured = missedCallsCount || 0

        // Filter outbound messages more robustly (consistent with DashboardMetrics)
        const textsSent = messages?.filter((m: any) => {
          const isDirectionOutbound = m.direction === 'outbound' || m.direction?.startsWith?.('outbound')
          const isFromBusinessPhone = m.from_phone === business.twilio_phone_number
          return isDirectionOutbound || isFromBusinessPhone
        }).length || 0

        // Filter inbound messages (customer replies) more robustly (consistent with DashboardMetrics)
        const repliesReceived = messages?.filter((m: any) => {
          const isDirectionInbound = m.direction === 'inbound' || m.direction?.startsWith?.('inbound')
          const isToBusinessPhone = m.to_phone === business.twilio_phone_number
          return isDirectionInbound || isToBusinessPhone
        }).length || 0

        const activeFollowUps = followUpJobs?.length || 0
        const avgResponseTime = null // Would need more complex query to calculate

        setKpiData({
          leadsRecovered,
          textsSent,
          repliesReceived,
          activeFollowUps,
          missedCallsCaptured,
          avgResponseTime,
          period: '30 days'
        })
      } catch (error) {
        console.error('Error fetching KPI data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchKPIData()
  }, [business])

  const getKPIIcon = (type: string) => {
    switch (type) {
      case 'leads':
        return <Users className="w-5 h-5" />
      case 'texts':
        return <MessageSquare className="w-5 h-5" />
      case 'replies':
        return <Reply className="w-5 h-5" />
      case 'followups':
        return <Clock className="w-5 h-5" />
      case 'missed':
        return <PhoneMissed className="w-5 h-5" />
      case 'response':
        return <Clock className="w-5 h-5" />
      default:
        return null
    }
  }

  const getKPIColor = (type: string) => {
    switch (type) {
      case 'leads':
        return 'text-green-600 dark:text-green-400'
      case 'texts':
        return 'text-blue-600 dark:text-blue-400'
      case 'replies':
        return 'text-amber-600 dark:text-amber-400'
      case 'followups':
        return 'text-purple-600 dark:text-purple-400'
      case 'missed':
        return 'text-red-600 dark:text-red-400'
      case 'response':
        return 'text-cyan-600 dark:text-cyan-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getKPIColorBg = (type: string) => {
    // Use consistent dark card styling for all cards
    return 'bg-slate-800/50 dark:bg-slate-900/60 border-slate-700 dark:border-slate-700'
  }

  const kpiItems = [
    {
      type: 'leads',
      label: 'Total Customers',
      value: kpiData.leadsRecovered,
      description: 'Customers generated',
      trend: null
    },
    {
      type: 'missed',
      label: 'Forwarded Missed Calls',
      value: kpiData.missedCallsCaptured,
      description: 'Calls handled',
      trend: null
    },
    {
      type: 'replies',
      label: 'Customer Replies',
      value: kpiData.repliesReceived,
      description: 'Responses',
      trend: null
    },
  ]

  const hasEnoughActivity = kpiData.leadsRecovered > 0 || kpiData.textsSent > 0 || kpiData.repliesReceived > 0

  if (loading) {
    return (
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Business Snapshot</h3>
          <div className="text-xs text-slate-500 dark:text-slate-400">Loading...</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2.5 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">Business Snapshot</h3>
        <div className="text-xs text-slate-500 dark:text-slate-400">Last {kpiData.period}</div>
      </div>

      {!hasEnoughActivity ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 text-center">
          <p className="text-sm text-slate-300">Not enough activity yet</p>
          <p className="text-xs text-slate-400 mt-1">Metrics will appear once you start receiving calls</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-3">
          {kpiItems.map((item) => (
            <div
              key={item.type}
              className="border border-white/8 bg-slate-900 dark:bg-slate-900/60 rounded-lg p-2.5 hover:border-white/20 hover:bg-slate-800/50 transition-all duration-200"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-4 h-4 ${getKPIColor(item.type)}`}>
                  {getKPIIcon(item.type)}
                </div>
                <div className="text-xs text-muted-foreground/80 font-medium">{item.label}</div>
              </div>
              
              <div className={`text-xl font-bold ${getKPIColor(item.type)} mb-1.5`}>
                {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
              </div>
              
              <div className="text-xs text-muted-foreground/60">
                {item.description}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
