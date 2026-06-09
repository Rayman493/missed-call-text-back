'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Brain, AlertTriangle, FileEdit, Activity } from 'lucide-react'

interface AIActivityCardProps {
  business: Business | null
}

interface AIActivityData {
  intakesCompleted: number
  urgentLeads: number
  correctionsReceived: number
  completionRate: number
}

export default function AIActivityCard({ business }: AIActivityCardProps) {
  const [activity, setActivity] = useState<AIActivityData>({
    intakesCompleted: 0,
    urgentLeads: 0,
    correctionsReceived: 0,
    completionRate: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAIActivity = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Fetch AI call records
        const { data: aiCallRecords, error: aiError } = await supabase
          .from('ai_call_records')
          .select('id, lead_id, extracted_info, created_at, outcome')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch leads with corrections
        const { data: leads } = await supabase
          .from('leads')
          .select('id, raw_metadata')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Calculate stats
        const intakesCompleted = aiCallRecords?.length || 0
        const completedIntakes = aiCallRecords?.filter((r: any) => r.outcome === 'completed')?.length || 0
        const completionRate = intakesCompleted > 0 ? Math.round((completedIntakes / intakesCompleted) * 100) : 0

        // Count urgent leads
        const urgentLeads = leads?.filter((lead: any) => {
          const extractedInfo = lead.raw_metadata?.extracted_info || lead.raw_metadata?.ai_extracted_info
          const urgency = extractedInfo?.urgencyLevel || extractedInfo?.urgency
          return urgency?.toLowerCase() === 'urgent' || urgency?.toLowerCase() === 'high'
        })?.length || 0

        // Count corrections received
        const correctionsReceived = leads?.filter((lead: any) => lead.raw_metadata?.corrections_count > 0)?.length || 0

        setActivity({
          intakesCompleted,
          urgentLeads,
          correctionsReceived,
          completionRate
        })
      } catch (error) {
        console.error('Error fetching AI activity:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAIActivity()
  }, [business])

  if (loading) {
    return (
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-4">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const stats = [
    {
      label: 'AI Intakes Completed',
      value: activity.intakesCompleted,
      icon: Brain,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/20'
    },
    {
      label: 'Urgent Leads',
      value: activity.urgentLeads,
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
      bgColor: 'bg-amber-100 dark:bg-amber-900/20'
    },
    {
      label: 'Corrections Received',
      value: activity.correctionsReceived,
      icon: FileEdit,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/20'
    },
    {
      label: 'Completion Rate',
      value: `${activity.completionRate}%`,
      icon: Activity,
      color: 'text-emerald-600 dark:text-emerald-400',
      bgColor: 'bg-emerald-100 dark:bg-emerald-900/20'
    }
  ]

  return (
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-4">AI Activity</h3>
      <div className="space-y-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</span>
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-foreground">{stat.value}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
