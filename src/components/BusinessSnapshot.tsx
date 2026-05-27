'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, Users, MessageSquare, Reply } from 'lucide-react'

interface BusinessSnapshotProps {
  business: Business | null
}

interface KPIData {
  callsProcessed: number
  leadsCaptured: number
  textsSent: number
  repliesReceived: number
  period: string
}

export default function BusinessSnapshot({ business }: BusinessSnapshotProps) {
  const [kpiData, setKpiData] = useState<KPIData>({
    callsProcessed: 0,
    leadsCaptured: 0,
    textsSent: 0,
    repliesReceived: 0,
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
        
        // Fetch leads (calls processed)
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

        // Calculate KPIs
        const callsProcessed = leads?.length || 0
        const leadsCaptured = leads?.length || 0
        const textsSent = messages?.filter((m: any) => m.direction === 'outbound').length || 0
        const repliesReceived = messages?.filter((m: any) => m.direction === 'inbound').length || 0

        setKpiData({
          callsProcessed,
          leadsCaptured,
          textsSent,
          repliesReceived,
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
      case 'calls':
        return <Phone className="w-5 h-5" />
      case 'leads':
        return <Users className="w-5 h-5" />
      case 'texts':
        return <MessageSquare className="w-5 h-5" />
      case 'replies':
        return <Reply className="w-5 h-5" />
      default:
        return null
    }
  }

  const getKPIColor = (type: string) => {
    switch (type) {
      case 'calls':
        return 'text-blue-600 dark:text-blue-400'
      case 'leads':
        return 'text-green-600 dark:text-green-400'
      case 'texts':
        return 'text-blue-600 dark:text-blue-400'
      case 'replies':
        return 'text-amber-600 dark:text-amber-400'
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
      type: 'calls',
      label: 'Missed Calls Captured',
      value: kpiData.callsProcessed,
      description: 'Business opportunities captured'
    },
    {
      type: 'leads',
      label: 'Recovered Leads',
      value: kpiData.leadsCaptured,
      description: 'Customers successfully engaged'
    },
    {
      type: 'texts',
      label: 'Texts Sent',
      value: kpiData.textsSent,
      description: 'Automated outreach messages'
    },
    {
      type: 'replies',
      label: 'Customer Replies',
      value: kpiData.repliesReceived,
      description: 'Customers who responded'
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
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-3.5 min-h-[200px]">
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

      {/* Summary Stats */}
      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            Response Rate
          </div>
          <div className="font-medium text-foreground">
            {kpiData.textsSent > 0 
              ? `${Math.round((kpiData.repliesReceived / kpiData.textsSent) * 100)}%`
              : 'N/A'
            }
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm mt-1.5">
          <div className="text-muted-foreground">
            Lead Conversion
          </div>
          <div className="font-medium text-foreground">
            {kpiData.callsProcessed > 0 && kpiData.repliesReceived > 0
              ? `${Math.round((kpiData.repliesReceived / kpiData.callsProcessed) * 100)}%`
              : kpiData.callsProcessed > 0
              ? 'Not enough data'
              : 'N/A'
            }
          </div>
        </div>
      </div>
    </div>
  )
}
