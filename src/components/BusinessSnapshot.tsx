'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, Users, MessageSquare, Reply, Clock } from 'lucide-react'

interface BusinessSnapshotProps {
  business: Business | null
}

interface KPIData {
  leadsRecovered: number
  textsSent: number
  repliesReceived: number
  activeFollowUps: number
  period: string
}

export default function BusinessSnapshot({ business }: BusinessSnapshotProps) {
  const [kpiData, setKpiData] = useState<KPIData>({
    leadsRecovered: 0,
    textsSent: 0,
    repliesReceived: 0,
    activeFollowUps: 0,
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

        // Fetch messages sent
        const { data: messages } = await supabase
          .from('messages')
          .select('direction, created_at')
          .eq('from_phone', business.twilio_phone_number || '')
          .gte('created_at', thirtyDaysAgo)

        // Fetch active follow-ups
        const { data: followUpJobs } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('business_id', business.id)
          .in('status', ['pending', 'scheduled', 'in_progress'])

        // Calculate KPIs
        const leadsRecovered = leads?.length || 0
        const textsSent = messages?.filter((m: any) => m.direction === 'outbound').length || 0
        const repliesReceived = messages?.filter((m: any) => m.direction === 'inbound').length || 0
        const activeFollowUps = followUpJobs?.length || 0

        setKpiData({
          leadsRecovered,
          textsSent,
          repliesReceived,
          activeFollowUps,
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
      label: 'Leads Recovered',
      value: kpiData.leadsRecovered,
      description: 'Customers engaged'
    },
    {
      type: 'texts',
      label: 'Texts Sent',
      value: kpiData.textsSent,
      description: 'Outreach messages'
    },
    {
      type: 'replies',
      label: 'Replies',
      value: kpiData.repliesReceived,
      description: 'Customer responses'
    },
    {
      type: 'followups',
      label: 'Active Follow-Ups',
      value: kpiData.activeFollowUps,
      description: 'In progress'
    }
  ]

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Business Snapshot</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3">
          {[1, 2, 3, 4].map((i) => (
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
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-slate-300 dark:border-slate-700/60 rounded-xl p-2 sm:p-3 min-h-[180px] shadow-sm dark:shadow-md hover:shadow-md dark:hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-base font-semibold text-foreground">Business Snapshot</h3>
        <div className="text-xs text-muted-foreground">Last {kpiData.period}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3">
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
              {item.value.toLocaleString()}
            </div>
            
            <div className="text-xs text-muted-foreground/60">
              {item.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
