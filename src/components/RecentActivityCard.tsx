'use client'

import React, { useState, useEffect } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { Phone, MessageSquare, Reply, Calendar, Mic } from 'lucide-react'

interface RecentActivityCardProps {
  business: Business | null
}

interface ActivityEvent {
  id: string
  type: 'call_captured' | 'text_sent' | 'customer_replied' | 'follow_up_scheduled' | 'voicemail_received'
  title: string
  description: string
  timestamp: string
  icon: React.ReactNode
  color: string
}

export default function RecentActivityCard({ business }: RecentActivityCardProps) {
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecentActivity = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get recent leads, messages, and voicemails
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        
        // Fetch recent leads
        const { data: leads } = await supabase
          .from('leads')
          .select('*')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3)

        // Fetch recent messages
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(3)

        // Fetch recent voicemails
        const { data: voicemails } = await supabase
          .from('voicemail_recordings')
          .select('*')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(2)

        // Convert to activity events
        const events: ActivityEvent[] = []

        // Add lead captures
        leads?.forEach((lead: any, index: number) => {
          const displayName = lead.name || lead.phone_number || 'Unknown Caller'
          events.push({
            id: `lead-${lead.id}`,
            type: 'call_captured',
            title: 'Missed call captured',
            description: `New lead from ${displayName}`,
            timestamp: lead.created_at,
            icon: <Phone className="w-3 h-3" />,
            color: 'text-blue-600 dark:text-blue-400'
          })
        })

        // Add messages
        messages?.forEach((message: any, index: number) => {
          const displayName = message.phone_number || 'Unknown'
          if (message.direction === 'outbound') {
            events.push({
              id: `message-out-${message.id}`,
              type: 'text_sent',
              title: 'Text sent',
              description: `Message to ${displayName}`,
              timestamp: message.created_at,
              icon: <MessageSquare className="w-3 h-3" />,
              color: 'text-green-600 dark:text-green-400'
            })
          } else {
            events.push({
              id: `message-in-${message.id}`,
              type: 'customer_replied',
              title: 'Customer replied',
              description: `Response from ${displayName}`,
              timestamp: message.created_at,
              icon: <Reply className="w-3 h-3" />,
              color: 'text-amber-600 dark:text-amber-400'
            })
          }
        })

        // Add voicemails
        voicemails?.forEach((voicemail: any, index: number) => {
          const displayName = voicemail.phone || 'Unknown'
          events.push({
            id: `voicemail-${voicemail.id}`,
            type: 'voicemail_received',
            title: 'Voicemail received',
            description: `Voicemail from ${displayName}`,
            timestamp: voicemail.created_at,
            icon: <Mic className="w-3 h-3" />,
            color: 'text-purple-600 dark:text-purple-400'
          })
        })

        // Sort by timestamp and take latest 5
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

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-6 h-6 bg-muted rounded-full animate-pulse"></div>
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                <div className="h-2 bg-muted rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-foreground mb-4">Activity Timeline</h3>

      {activities.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${activity.color} bg-slate-100 dark:bg-slate-800`}>
                  {activity.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0 pb-4 border-l-2 border-slate-100 dark:border-slate-800 ml-3 -mt-6 pl-4">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-medium text-slate-900 dark:text-foreground">{activity.title}</p>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">{formatRelativeTime(activity.timestamp)}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{activity.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
