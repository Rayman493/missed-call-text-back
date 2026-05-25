'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, MessageSquare, Clock, CheckCircle, AlertTriangle, User } from 'lucide-react'
import Link from 'next/link'

interface ActivityEvent {
  id: string
  type: 'missed_call' | 'text_sent' | 'followup_scheduled' | 'lead_replied' | 'forwarding_verified' | 'system_error'
  description: string
  timestamp: string
  leadId?: string
  leadPhone?: string
}

interface RecentActivityFeedProps {
  business: Business | null
}

export default function RecentActivityFeed({ business }: RecentActivityFeedProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business) return

    const fetchRecentActivity = async () => {
      try {
        const supabase = createBrowserClient()
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

        // Fetch recent leads (missed calls)
        const { data: recentLeads } = await supabase
          .from('leads')
          .select('id, caller_phone, created_at, status')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        // Fetch recent messages
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('lead_id, direction, body, created_at, status')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        // Fetch follow-up jobs
        const { data: followUpJobs } = await supabase
          .from('follow_up_jobs')
          .select('lead_id, scheduled_at, status, created_at')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        // Transform data into activity events
        const events: ActivityEvent[] = []

        // Add recent leads (missed calls)
        recentLeads?.forEach((lead: any) => {
          events.push({
            id: `lead-${lead.id}`,
            type: 'missed_call',
            description: `Missed call captured from ${lead.caller_phone}`,
            timestamp: lead.created_at,
            leadId: lead.id,
            leadPhone: lead.caller_phone
          })
        })

        // Add recent messages
        recentMessages?.forEach((message: any) => {
          if (message.direction === 'outbound') {
            events.push({
              id: `msg-out-${message.created_at}`,
              type: 'text_sent',
              description: 'Instant text sent to customer',
              timestamp: message.created_at,
              leadId: message.lead_id
            })
          } else if (message.direction === 'inbound') {
            events.push({
              id: `msg-in-${message.created_at}`,
              type: 'lead_replied',
              description: 'Lead replied to your message',
              timestamp: message.created_at,
              leadId: message.lead_id
            })
          }
        })

        // Add follow-up jobs
        followUpJobs?.forEach((job: any) => {
          events.push({
            id: `followup-${job.id}`,
            type: 'followup_scheduled',
            description: 'Follow-up scheduled automatically',
            timestamp: job.created_at,
            leadId: job.lead_id
          })
        })

        // Sort events by timestamp (most recent first) and limit to 5
        const sortedEvents = events
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 5)

        setActivities(sortedEvents)
      } catch (error) {
        console.error('Error fetching recent activity:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRecentActivity()
  }, [business])

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const eventTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - eventTime.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'Just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  const getActivityIcon = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'missed_call':
        return <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
      case 'text_sent':
        return <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
      case 'lead_replied':
        return <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
      case 'followup_scheduled':
        return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
      case 'forwarding_verified':
        return <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      case 'system_error':
        return <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
      default:
        return <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
    }
  }

  const getActivityColor = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'missed_call':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
      case 'text_sent':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
      case 'lead_replied':
        return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
      case 'followup_scheduled':
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
      case 'forwarding_verified':
        return 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
      case 'system_error':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
      default:
        return 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
    }
  }

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg animate-pulse">
              <div className="w-4 h-4 bg-muted rounded-full"></div>
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
        <div className="text-xs text-muted-foreground">
          {activities.length > 0 ? 'Latest events' : 'No recent activity'}
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No recent activity</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activity will appear here as ReplyFlow protects your business
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors hover:bg-muted/20 ${getActivityColor(activity.type)}`}
            >
              <div className="flex-shrink-0 mt-0.5">
                {getActivityIcon(activity.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {activity.leadId && activity.leadPhone ? (
                    <Link 
                      href={`/dashboard/leads/${activity.leadId}`}
                      className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      {activity.description}
                    </Link>
                  ) : (
                    activity.description
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatRelativeTime(activity.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
