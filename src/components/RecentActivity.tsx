'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import Link from 'next/link'

interface ActivityEvent {
  id: string
  business_id: string
  lead_id?: string
  event_type: 'lead_captured' | 'customer_replied' | 'follow_up_sent' | 'follow_up_failed' | 'lead_completed' | 'lead_ignored' | 'customer_opted_out'
  message: string
  metadata: Record<string, any>
  created_at: string
}

interface RecentActivityProps {
  businessId: string
}

export default function RecentActivity({ businessId }: RecentActivityProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()

  useEffect(() => {
    if (!businessId) return

    const fetchActivities = async () => {
      try {
        const { data, error } = await supabase
          .from('activity_events')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) {
          // Table may not exist; silently ignore
          setActivities([])
          return
        }
        setActivities(data || [])
      } catch {
        // Table may not exist; silently ignore
        setActivities([])
      } finally {
        setLoading(false)
      }
    }

    fetchActivities()

    // Set up realtime subscription for new activities
    const channel = supabase
      .channel('activity_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_events',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          setActivities(prev => [payload.new as ActivityEvent, ...prev].slice(0, 10))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [businessId, supabase])

  const getActivityIcon = (eventType: ActivityEvent['event_type']) => {
    switch (eventType) {
      case 'lead_captured':
        return '📞'
      case 'customer_replied':
        return '📱'
      case 'follow_up_sent':
        return '✉️'
      case 'follow_up_failed':
        return '⚠️'
      case 'lead_completed':
        return '✅'
      case 'lead_ignored':
        return '🔕'
      case 'customer_opted_out':
        return '🚫'
      default:
        return '📋'
    }
  }

  const getActivityColor = (eventType: ActivityEvent['event_type']) => {
    switch (eventType) {
      case 'lead_captured':
        return 'text-blue-600 dark:text-blue-400'
      case 'customer_replied':
        return 'text-green-600 dark:text-green-400'
      case 'follow_up_sent':
        return 'text-blue-600 dark:text-blue-400'
      case 'follow_up_failed':
        return 'text-red-600 dark:text-red-400'
      case 'lead_completed':
        return 'text-green-600 dark:text-green-400'
      case 'lead_ignored':
        return 'text-orange-600 dark:text-orange-400'
      case 'customer_opted_out':
        return 'text-red-600 dark:text-red-400'
      default:
        return 'text-slate-600 dark:text-slate-400'
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600/20 dark:from-blue-500/20 dark:to-blue-600/20 rounded-xl flex items-center justify-center border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Recent Activity</h2>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">Loading activity...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600/20 dark:from-blue-500/20 dark:to-blue-600/20 rounded-xl flex items-center justify-center border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Recent Activity</h2>
            <p className="text-sm text-slate-600 dark:text-muted-foreground">Live operational updates</p>
          </div>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-6">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-400 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-slate-600 dark:text-muted-foreground">No recent activity</p>
          <p className="text-xs text-slate-600 dark:text-slate-600 mt-1">Activity will appear here as you use ReplyFlow</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${getActivityColor(activity.event_type)}`}>
                {getActivityIcon(activity.event_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900 dark:text-foreground leading-relaxed">
                  {activity.message}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-600 mt-1">
                  {formatRelativeTime(activity.created_at)}
                </p>
              </div>
              {activity.lead_id && (
                <Link
                  href={`/dashboard/leads/${activity.lead_id}`}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex-shrink-0"
                >
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
