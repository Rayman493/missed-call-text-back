'use client'

import React, { useState, useEffect } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Phone, MessageSquare, Clock, Users, Activity } from 'lucide-react'

interface RecentActivityTimelineProps {
  business: Business | null
}

interface ActivityItem {
  id: string
  type: 'missed_call' | 'lead_created' | 'sms_sent' | 'follow_up_scheduled'
  title: string
  description: string
  timestamp: string
  phone?: string
  details?: any
}

export default function RecentActivityTimeline({ business }: RecentActivityTimelineProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecentActivity = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get activity from the last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        
        const activities: ActivityItem[] = []

        // Fetch recent leads (missed calls)
        const { data: recentLeads } = await supabase
          .from('leads')
          .select('*')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        if (recentLeads) {
          recentLeads.forEach((lead: any) => {
            activities.push({
              id: `lead-${lead.id}`,
              type: 'missed_call',
              title: 'Missed Call Processed',
              description: 'New customer created from missed call',
              timestamp: lead.created_at,
              phone: lead.caller_phone
            })
          })
        }

        // Fetch recent messages (SMS sent)
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('from_phone', business.twilio_phone_number || '')
          .eq('direction', 'outbound')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        if (recentMessages) {
          recentMessages.forEach((message: any) => {
            activities.push({
              id: `message-${message.id}`,
              type: 'sms_sent',
              title: 'SMS Sent',
              description: 'Text message sent to customer',
              timestamp: message.created_at,
              phone: message.to_phone,
              details: { preview: message.body.substring(0, 100) }
            })
          })
        }

        // Fetch recent follow-up jobs
        const { data: recentFollowUps } = await supabase
          .from('follow_up_jobs')
          .select('*')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        if (recentFollowUps) {
          recentFollowUps.forEach((followUp: any) => {
            activities.push({
              id: `followup-${followUp.id}`,
              type: 'follow_up_scheduled',
              title: 'Follow-up Scheduled',
              description: `Follow-up #${followUp.step} scheduled`,
              timestamp: followUp.created_at,
              details: { step: followUp.step, scheduledFor: followUp.scheduled_for }
            })
          })
        }

        // Sort all activities by timestamp (most recent first) and take top 20
        const sortedActivities = activities
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 20)

        setActivities(sortedActivities)
      } catch (error) {
        console.error('Error fetching recent activity:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRecentActivity()
  }, [business])

  const getActivityIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'missed_call':
        return <Phone className="w-4 h-4 text-blue-600" />
      case 'lead_created':
        return <Users className="w-4 h-4 text-green-600" />
      case 'sms_sent':
        // Premium treatment uses emerald accent for message sent
        return <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
      case 'follow_up_scheduled':
        return <Clock className="w-4 h-4 text-amber-600" />
      default:
        return <Activity className="w-4 h-4 text-gray-600" />
    }
  }

  const getActivityColor = (type: ActivityItem['type']) => {
    switch (type) {
      case 'missed_call':
        return 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
      case 'lead_created':
        return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
      case 'sms_sent':
        // Emerald-toned container for Message Sent
        return 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20'
      case 'follow_up_scheduled':
        return 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
      default:
        return 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/20'
    }
  }

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recent Activity</h3>
        <div className="text-xs text-muted-foreground">Last 7 days</div>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No recent activity</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activity will appear here as you start using ReplyFlow
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.map((activity, index) => (
            <div key={activity.id} className="relative flex items-start gap-3 group">
              {/* Timeline line - aligned to icon center with a subtle gradient */}
              {index < activities.length - 1 && (
                <div className="absolute left-4 top-4 w-0.5 h-[calc(100%-1rem)] bg-gradient-to-b from-slate-300/60 via-slate-300/30 to-slate-300/10 dark:from-slate-600/60 dark:via-slate-600/30 dark:to-slate-600/10" />
              )}

              {/* Activity icon */}
              <div
                className={
                  `relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center ${getActivityColor(activity.type)} ` +
                  // Subtle premium glow and hover only for Message Sent
                  (activity.type === 'sms_sent'
                    ? ' ring-1 ring-emerald-500/15 shadow-[0_0_0_3px_rgba(16,185,129,0.08)] dark:shadow-[0_0_0_3px_rgba(16,185,129,0.15)] transition-shadow duration-150 group-hover:shadow-[0_0_0_4px_rgba(16,185,129,0.12)] group-hover:ring-emerald-400/25'
                    : '')
                }
              >
                {getActivityIcon(activity.type)}
              </div>

              {/* Activity content */}
              <div className="flex-1 min-w-0 pb-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="text-sm font-medium text-foreground">{activity.title}</h4>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(activity.timestamp)}
                  </span>
                </div>
                
                <p className="text-xs text-muted-foreground mb-1">{activity.description}</p>
                
                {activity.phone && (
                  <p className="text-xs font-mono text-slate-600 dark:text-slate-400">
                    {activity.phone}
                  </p>
                )}
                
                {activity.details?.preview && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic">
                    "{activity.details.preview}{activity.details.preview.length >= 100 ? '...' : ''}"
                  </p>
                )}
                
                {activity.type === 'follow_up_scheduled' && activity.details?.scheduledFor && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                    Scheduled for: {formatRelativeTime(activity.details.scheduledFor)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
