'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, MessageSquare, Send, Users, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface PerformanceMetrics {
  missedCallsCaptured: number
  customerReplies: number
  followUpsSent: number
  activeLeads: number
}

export default function ReplyFlowPerformanceCard() {
  const { business } = useBusiness()
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get date range for last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Fetch leads
        const { data: leads } = await supabase
          .from('leads')
          .select('id, status, created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch messages
        const { data: messages } = await supabase
          .from('messages')
          .select('id, direction, created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch follow-ups
        const { data: followUps } = await supabase
          .from('follow_ups')
          .select('id, status, created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        const leadCount = leads?.length || 0
        const activeLeads = leads?.filter((l: any) => l.status === 'active' || l.status === 'new').length || 0
        const customerReplies = messages?.filter((m: any) => m.direction === 'inbound').length || 0
        const followUpsSent = followUps?.filter((f: any) => f.status === 'sent').length || 0

        setMetrics({
          missedCallsCaptured: leadCount,
          customerReplies,
          followUpsSent,
          activeLeads
        })
      } catch (error) {
        console.error('[ReplyFlowPerformanceCard] Error fetching metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [business])

  if (loading) {
    return (
      <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-sm p-5 sm:p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-1/3"></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                <div className="h-8 bg-slate-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-900/60 backdrop-blur-sm rounded-xl border border-slate-700/50 shadow-sm hover:shadow-md transition-all duration-200 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">
          ReplyFlow Performance
        </h3>
        <Link
          href="/analytics"
          className="text-xs sm:text-sm text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
        >
          View Analytics <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricItem
          label="Missed Calls Captured"
          value={metrics?.missedCallsCaptured || 0}
          icon={Phone}
          color="blue"
        />
        <MetricItem
          label="Customer Replies"
          value={metrics?.customerReplies || 0}
          icon={MessageSquare}
          color="green"
        />
        <MetricItem
          label="Follow-Ups Sent"
          value={metrics?.followUpsSent || 0}
          icon={Send}
          color="purple"
        />
        <MetricItem
          label="Active Leads"
          value={metrics?.activeLeads || 0}
          icon={Users}
          color="amber"
        />
      </div>
    </div>
  )
}

function MetricItem({ 
  label, 
  value, 
  icon: Icon, 
  color 
}: { 
  label: string
  value: number
  icon: any
  color: 'blue' | 'green' | 'purple' | 'amber'
}) {
  const colorClasses = {
    blue: 'bg-blue-900/30 text-blue-400',
    green: 'bg-green-900/30 text-green-400',
    purple: 'bg-purple-900/30 text-purple-400',
    amber: 'bg-amber-900/30 text-amber-400'
  }

  return (
    <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
      <div className={`p-2 rounded-lg ${colorClasses[color]} mb-2`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-foreground">
        {value}
      </p>
      <p className="text-xs text-muted-foreground mt-1">
        {label}
      </p>
    </div>
  )
}
