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
          events.push({
            id: `lead-${lead.id}`,
            type: 'call_captured',
            title: 'Missed call captured',
            description: `New lead from ${lead.phone_number}`,
            timestamp: lead.created_at,
            icon: <Phone className="w-3 h-3" />,
            color: 'text-blue-600 dark:text-blue-400'
          })
        })

        // Add messages
        messages?.forEach((message: any, index: number) => {
          if (message.direction === 'outbound') {
            events.push({
              id: `message-out-${message.id}`,
              type: 'text_sent',
              title: 'Text sent',
              description: `Message to ${message.phone_number}`,
              timestamp: message.created_at,
              icon: <MessageSquare className="w-3 h-3" />,
              color: 'text-green-600 dark:text-green-400'
            })
          } else {
            events.push({
              id: `message-in-${message.id}`,
              type: 'customer_replied',
              title: 'Customer replied',
              description: `Response from ${message.phone_number}`,
              timestamp: message.created_at,
              icon: <Reply className="w-3 h-3" />,
              color: 'text-amber-600 dark:text-amber-400'
            })
          }
        })

        // Add voicemails
        voicemails?.forEach((voicemail: any, index: number) => {
          events.push({
            id: `voicemail-${voicemail.id}`,
            type: 'voicemail_received',
            title: 'Voicemail received',
            description: `Voicemail from ${voicemail.caller_phone}`,
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
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-3 min-h-[140px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Activity</h3>
        <div className="text-xs text-muted-foreground">Last 7 days</div>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground">No activity this week</p>
        </div>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg p-2 -mx-2 transition-colors">
              <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${activity.color}`}>
                {activity.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{activity.title}</p>
                <p className="text-xs text-muted-foreground truncate">{activity.description}</p>
                <p className="text-xs text-muted-foreground/60">{formatRelativeTime(activity.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
