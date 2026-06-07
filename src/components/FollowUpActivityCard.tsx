'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { MessageSquare, Clock, CheckCircle, AlertTriangle, Calendar } from 'lucide-react'
import Link from 'next/link'

interface FollowUpActivityCardProps {
  business: Business | null
}

interface FollowUpMetrics {
  scheduled: number
  sentThisWeek: number
  pending: number
  failed: number
}

export default function FollowUpActivityCard({ business }: FollowUpActivityCardProps) {
  const [metrics, setMetrics] = useState<FollowUpMetrics>({
    scheduled: 0,
    sentThisWeek: 0,
    pending: 0,
    failed: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchFollowUpMetrics = async () => {
      try {
        const supabase = createBrowserClient()
        
        // Get current week start (Monday)
        const now = new Date()
        const weekStart = new Date(now)
        weekStart.setDate(now.getDate() - now.getDay() + 1)
        weekStart.setHours(0, 0, 0, 0)
        const weekStartISO = weekStart.toISOString()

        // Fetch scheduled follow-ups
        const { data: scheduledFollowUps } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('business_id', business.id)
          .eq('status', 'pending')

        // Fetch follow-ups sent this week
        const { data: sentThisWeek } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('business_id', business.id)
          .eq('status', 'completed')
          .gte('updated_at', weekStartISO)

        // Fetch pending follow-ups
        const { data: pendingFollowUps } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('business_id', business.id)
          .eq('status', 'pending')

        // Fetch failed follow-ups
        const { data: failedFollowUps } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('business_id', business.id)
          .eq('status', 'failed')

        setMetrics({
          scheduled: scheduledFollowUps?.length || 0,
          sentThisWeek: sentThisWeek?.length || 0,
          pending: pendingFollowUps?.length || 0,
          failed: failedFollowUps?.length || 0
        })
      } catch (error) {
        console.error('Error fetching follow-up metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchFollowUpMetrics()
  }, [business])

  const hasActivity = metrics.scheduled > 0 || metrics.sentThisWeek > 0 || metrics.pending > 0 || metrics.failed > 0

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-foreground">Follow-Up Activity</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-6 bg-muted rounded w-8 mb-1"></div>
              <div className="h-3 bg-muted rounded w-12"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-slate-300 dark:border-slate-700/60 rounded-xl p-2 sm:p-2.5 shadow-sm dark:shadow-md hover:shadow-md dark:hover:shadow-lg transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground">Follow-Ups</h3>
        <div className="text-[10px] text-muted-foreground">
          {hasActivity ? 'Active' : 'None'}
        </div>
      </div>

      {hasActivity ? (
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-semibold text-foreground">{metrics.pending}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">pending</span>
          </div>

          <div className="flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            <span className="text-sm font-semibold text-foreground">{metrics.sentThisWeek}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">sent</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-semibold text-foreground">{metrics.scheduled}</span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">scheduled</span>
          </div>

          <Link
            href="/dashboard/settings/follow-ups"
            className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors ml-auto"
          >
            Manage →
          </Link>
        </div>
      ) : (
        <div className="text-center py-3 px-3">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 bg-purple-100 dark:bg-purple-900/20 rounded-full flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-900 dark:text-foreground">
                No follow-up campaigns configured.
              </p>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 mt-0.5 mb-1.5">
                Create follow-up sequences to automatically reconnect with missed leads.
              </p>
              <Link
                href="/dashboard/settings/follow-ups"
                className="inline-flex items-center px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-medium rounded-lg transition-colors"
              >
                Configure Follow-Ups
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
