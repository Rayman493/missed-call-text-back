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
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">Follow-Up Activity</h3>
        <div className="text-xs text-muted-foreground">
          {hasActivity ? 'This week' : 'No activity'}
        </div>
      </div>

      {hasActivity ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="text-center">
            <div className="flex items-center justify-center w-8 h-8 bg-blue-100 dark:bg-blue-900/20 rounded-full mx-auto mb-1">
              <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p className="text-lg font-semibold text-foreground">{metrics.pending}</p>
            <p className="text-xs text-muted-foreground">Awaiting Replies</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/20 rounded-full mx-auto mb-1">
              <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-lg font-semibold text-foreground">{metrics.sentThisWeek}</p>
            <p className="text-xs text-muted-foreground">Completed This Week</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center w-8 h-8 bg-amber-100 dark:bg-amber-900/20 rounded-full mx-auto mb-1">
              <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-lg font-semibold text-foreground">{metrics.scheduled}</p>
            <p className="text-xs text-muted-foreground">Active Follow-Ups</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground mb-2">No active follow-ups</p>
          <Link
            href="/dashboard/settings/follow-ups"
            className="inline-flex items-center px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Configure
          </Link>
        </div>
      )}

      {hasActivity && (
        <div className="mt-3 text-center">
          <Link
            href="/dashboard/settings/follow-ups"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
          >
            Manage Follow-Ups →
          </Link>
        </div>
      )}
    </div>
  )
}
