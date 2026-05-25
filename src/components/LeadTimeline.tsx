'use client'

import React from 'react'
import { CheckCircle, Clock, MessageSquare, Phone, Calendar } from 'lucide-react'

interface TimelineEvent {
  id: string
  type: 'call_captured' | 'text_sent' | 'followup_scheduled' | 'customer_reply' | 'followup_sent'
  title: string
  description?: string
  timestamp: string
  status: 'completed' | 'pending' | 'upcoming'
}

interface LeadTimelineProps {
  leadId?: string
  events?: TimelineEvent[]
  compact?: boolean
}

export default function LeadTimeline({ leadId, events: propEvents, compact = false }: LeadTimelineProps) {
  // Default events if none provided (for empty state)
  const defaultEvents: TimelineEvent[] = [
    {
      id: '1',
      type: 'call_captured',
      title: 'Missed Call Captured',
      description: 'ReplyFlow captured the missed call',
      timestamp: new Date().toISOString(),
      status: 'completed'
    },
    {
      id: '2',
      type: 'text_sent',
      title: 'Instant Text Sent',
      description: 'Automated response sent to customer',
      timestamp: new Date().toISOString(),
      status: 'completed'
    },
    {
      id: '3',
      type: 'followup_scheduled',
      title: 'Follow-Up Scheduled',
      description: 'Follow-up message scheduled for later',
      timestamp: new Date().toISOString(),
      status: 'completed'
    },
    {
      id: '4',
      type: 'customer_reply',
      title: 'Awaiting Customer Reply',
      description: 'Waiting for customer to respond',
      timestamp: new Date().toISOString(),
      status: 'pending'
    }
  ]

  const events = propEvents || defaultEvents

  const getEventIcon = (type: string, status: string) => {
    const iconClass = status === 'completed' ? 'text-green-600 dark:text-green-400' : 
                       status === 'pending' ? 'text-amber-600 dark:text-amber-400' : 
                       'text-slate-400 dark:text-slate-500'

    switch (type) {
      case 'call_captured':
        return <Phone className={`w-4 h-4 ${iconClass}`} />
      case 'text_sent':
        return <MessageSquare className={`w-4 h-4 ${iconClass}`} />
      case 'followup_scheduled':
        return <Calendar className={`w-4 h-4 ${iconClass}`} />
      case 'followup_sent':
        return <MessageSquare className={`w-4 h-4 ${iconClass}`} />
      case 'customer_reply':
        return <MessageSquare className={`w-4 h-4 ${iconClass}`} />
      default:
        return <Clock className={`w-4 h-4 ${iconClass}`} />
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
      case 'pending':
        return <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
      case 'upcoming':
        return <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
      default:
        return null
    }
  }

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date()
    const eventTime = new Date(timestamp)
    const diffInMinutes = Math.floor((now.getTime() - eventTime.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'just now'
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`
    return `${Math.floor(diffInMinutes / 1440)}d ago`
  }

  if (compact) {
    return (
      <div className="space-y-2">
        {events.map((event, index) => (
          <div key={event.id} className="flex items-center gap-2">
            <div className="flex-shrink-0">
              {getEventIcon(event.type, event.status)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatRelativeTime(event.timestamp)}
              </p>
            </div>
            <div className="flex-shrink-0">
              {getStatusIcon(event.status)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-medium text-foreground">Lead Activity</h4>
      </div>

      <div className="space-y-3">
        {events.map((event, index) => (
          <div key={event.id} className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {getEventIcon(event.type, event.status)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-foreground">{event.title}</p>
                {getStatusIcon(event.status)}
              </div>
              {event.description && (
                <p className="text-xs text-muted-foreground">{event.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatRelativeTime(event.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="text-center py-4">
          <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No lead activity yet</p>
        </div>
      )}
    </div>
  )
}
