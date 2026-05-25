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
        return 'text-purple-600 dark:text-purple-400'
      case 'replies':
        return 'text-amber-600 dark:text-amber-400'
      default:
        return 'text-gray-600 dark:text-gray-400'
    }
  }

  const getKPIColorBg = (type: string) => {
    switch (type) {
      case 'calls':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      case 'leads':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'texts':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
      case 'replies':
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
    }
  }

  const kpiItems = [
    {
      type: 'calls',
      label: 'Missed Calls Captured',
      value: kpiData.callsProcessed,
      description: 'Business opportunities recovered'
    },
    {
      type: 'leads',
      label: 'Leads Recovered',
      value: kpiData.leadsCaptured,
      description: 'Customers engaged successfully'
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
      description: 'Conversations started'
    }
  ]

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Business Snapshot</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Business Snapshot</h3>
        <div className="text-xs text-muted-foreground">Last {kpiData.period}</div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {kpiItems.map((item) => (
          <div
            key={item.type}
            className={`border rounded-lg p-3 ${getKPIColorBg(item.type)} hover:shadow-md transition-all duration-200`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={getKPIColor(item.type)}>
                {getKPIIcon(item.type)}
              </div>
              <div className="text-xs text-muted-foreground">{item.label}</div>
            </div>
            
            <div className={`text-2xl font-bold ${getKPIColor(item.type)} mb-1`}>
              {item.value.toLocaleString()}
            </div>
            
            <div className="text-xs text-muted-foreground">
              {item.description}
            </div>
          </div>
        ))}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-border">
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
        
        <div className="flex items-center justify-between text-sm mt-2">
          <div className="text-muted-foreground">
            Lead Conversion
          </div>
          <div className="font-medium text-foreground">
            {kpiData.callsProcessed > 0 
              ? `${Math.round((kpiData.leadsCaptured / kpiData.callsProcessed) * 100)}%`
              : 'N/A'
            }
          </div>
        </div>
      </div>
    </div>
  )
}
