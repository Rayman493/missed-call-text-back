'use client'

import React, { useMemo } from 'react'
import { 
  Phone, 
  Calendar, 
  CreditCard, 
  CheckCircle, 
  MessageSquare, 
  UserPlus,
  Clock,
  AlertCircle,
  FileText,
  MessageCircle
} from 'lucide-react'

interface ActivityEvent {
  id: string
  type: 'created' | 'call_received' | 'ai_intake' | 'voicemail' | 'message' | 'appointment_created' | 'appointment_completed' | 'payment_requested' | 'payment_paid' | 'completed' | 'status_changed' | 'photo_sent' | 'business_phone_text' | 'business_phone_payment_request' | 'business_phone_call'
  title: string
  timestamp: string
  detail?: string
  subtitle?: string
  preview?: string
  metadata?: Record<string, any>
}

interface CustomerActivityTimelineProps {
  leadData: any
}

export default function CustomerActivityTimeline({ leadData }: CustomerActivityTimelineProps) {
  const events = useMemo(() => {
    const activityEvents: ActivityEvent[] = []

    if (!leadData) return activityEvents

    // Customer created
    activityEvents.push({
      id: `created-${leadData.id}`,
      type: 'created',
      title: 'Customer created',
      timestamp: leadData.created_at,
    })

    // Missed call / AI intake
    if (leadData.aiCallRecords && leadData.aiCallRecords.length > 0) {
      leadData.aiCallRecords.forEach((aiCall: any) => {
        const outcome = aiCall.outcome
        let title = 'AI intake completed'
        if (outcome === 'early_hangup') title = 'Caller hung up'
        else if (outcome === 'no_speech') title = 'No speech detected'
        else if (outcome === 'ai_connection_failed') title = 'AI connection failed'
        
        activityEvents.push({
          id: `ai-intake-${aiCall.id}`,
          type: 'ai_intake',
          title,
          timestamp: aiCall.created_at,
        })
      })
    }

    // Voicemail received
    if (leadData.voicemailRecordings && leadData.voicemailRecordings.length > 0) {
      leadData.voicemailRecordings.forEach((voicemail: any) => {
        activityEvents.push({
          id: `voicemail-${voicemail.id}`,
          type: 'voicemail',
          title: 'Voicemail received',
          timestamp: voicemail.created_at,
        })
      })
    }

    // Customer replied (inbound messages)
    if (leadData.messages && leadData.messages.length > 0) {
      const inboundMessages = leadData.messages.filter((msg: any) => msg.direction === 'inbound')
      if (inboundMessages.length > 0) {
        const firstReply = inboundMessages[0]
        activityEvents.push({
          id: `first-reply-${firstReply.id}`,
          type: 'message',
          title: 'Customer replied',
          timestamp: firstReply.created_at,
        })
      }
    }

    // Customer sent photos
    if (leadData.messages && leadData.messages.length > 0) {
      const messagesWithPhotos = leadData.messages.filter((msg: any) => msg.media_count && msg.media_count > 0)
      if (messagesWithPhotos.length > 0) {
        const firstPhotoMessage = messagesWithPhotos[0]
        const totalPhotos = messagesWithPhotos.reduce((sum: number, msg: any) => sum + (msg.media_count || 0), 0)
        activityEvents.push({
          id: `photos-${firstPhotoMessage.id}`,
          type: 'photo_sent',
          title: `Customer sent ${totalPhotos} photo${totalPhotos > 1 ? 's' : ''}`,
          timestamp: firstPhotoMessage.created_at,
        })
      }
    }

    // Business Phone activities from messages table
    if (leadData.messages && leadData.messages.length > 0) {
      const businessPhoneMessages = leadData.messages.filter((msg: any) => 
        msg.direction === 'outbound' && 
        msg.metadata?.source === 'business_phone' &&
        msg.metadata?.confirmation_method === 'user_confirmed'
      )
      
      businessPhoneMessages.forEach((msg: any) => {
        const metadata = msg.metadata || {}
        const actionType = metadata.actionType || ''
        
        if (actionType === 'business_phone_text') {
          activityEvents.push({
            id: `business-phone-text-${msg.id}`,
            type: 'business_phone_text',
            title: 'Text sent from Business Phone',
            timestamp: msg.created_at,
            subtitle: 'Confirmed by you',
            preview: metadata.messageBody || undefined,
            metadata,
          })
        } else if (actionType === 'business_phone_payment_request') {
          let detail = ''
          if (metadata.amountCents) {
            detail = `$${(metadata.amountCents / 100).toFixed(2)} payment request`
          }
          
          activityEvents.push({
            id: `business-phone-payment-${msg.id}`,
            type: 'business_phone_payment_request',
            title: 'Payment request sent from Business Phone',
            timestamp: msg.created_at,
            detail,
            metadata,
          })
        } else if (actionType === 'business_phone_call') {
          activityEvents.push({
            id: `business-phone-call-${msg.id}`,
            type: 'business_phone_call',
            title: 'Called customer from Business Phone',
            timestamp: msg.created_at,
            subtitle: 'Confirmed by you',
            metadata,
          })
        }
      })
    }

    // Appointments (from jobs)
    if (leadData.jobs && leadData.jobs.length > 0) {
      leadData.jobs.forEach((job: any) => {
        if (job.scheduled_date) {
          activityEvents.push({
            id: `appointment-${job.id}`,
            type: 'appointment_created',
            title: 'Appointment scheduled',
            timestamp: job.created_at,
            detail: new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })
        }
        if (job.status === 'completed') {
          activityEvents.push({
            id: `appointment-completed-${job.id}`,
            type: 'appointment_completed',
            title: 'Appointment completed',
            timestamp: job.updated_at || job.created_at,
          })
        }
      })
    }

    // Payment requests
    if (leadData.paymentRequests && leadData.paymentRequests.length > 0) {
      leadData.paymentRequests.forEach((pr: any) => {
        if (pr.status === 'pending') {
          activityEvents.push({
            id: `payment-requested-${pr.id}`,
            type: 'payment_requested',
            title: 'Payment requested',
            timestamp: pr.created_at,
            detail: `$${(pr.amount_cents / 100).toFixed(2)}`,
          })
        } else if (pr.status === 'paid') {
          activityEvents.push({
            id: `payment-paid-${pr.id}`,
            type: 'payment_paid',
            title: 'Payment received',
            timestamp: pr.paid_at || pr.created_at,
            detail: `$${(pr.amount_cents / 100).toFixed(2)}`,
          })
        }
      })
    }

    // Customer marked completed
    if (leadData.status === 'completed') {
      activityEvents.push({
        id: `completed-${leadData.id}`,
        type: 'completed',
        title: 'Customer marked complete',
        timestamp: leadData.last_activity_at || leadData.created_at,
      })
    }

    // Sort chronologically
    return activityEvents.sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  }, [leadData])

  const groupedEvents = useMemo(() => {
    const groups: Record<string, ActivityEvent[]> = {}
    
    events.forEach(event => {
      const date = new Date(event.timestamp)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      
      let dateLabel = ''
      
      if (date >= today) {
        dateLabel = 'Today'
      } else if (date >= yesterday) {
        dateLabel = 'Yesterday'
      } else {
        dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      }
      
      if (!groups[dateLabel]) {
        groups[dateLabel] = []
      }
      groups[dateLabel].push(event)
    })
    
    return groups
  }, [events])

  const getIcon = (type: string) => {
    switch (type) {
      case 'created':
        return <UserPlus className="w-4 h-4 text-blue-500" />
      case 'call_received':
      case 'ai_intake':
        return <Phone className="w-4 h-4 text-green-500" />
      case 'voicemail':
        return <MessageSquare className="w-4 h-4 text-amber-500" />
      case 'message':
        return <MessageSquare className="w-4 h-4 text-blue-500" />
      case 'appointment_created':
        return <Calendar className="w-4 h-4 text-purple-500" />
      case 'appointment_completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'payment_requested':
        return <CreditCard className="w-4 h-4 text-purple-500" />
      case 'payment_paid':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'photo_sent':
        return <FileText className="w-4 h-4 text-blue-500" />
      case 'business_phone_text':
        return <MessageCircle className="w-4 h-4 text-blue-500" />
      case 'business_phone_payment_request':
        return <CreditCard className="w-4 h-4 text-purple-500" />
      case 'business_phone_call':
        return <Phone className="w-4 h-4 text-green-500" />
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  const getRelativeTime = (timestamp: string) => {
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-6">
        <Clock className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
        <p className="text-sm text-muted-foreground">
          Customer activity will appear here as conversations, appointments, and payments occur.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {Object.entries(groupedEvents).map(([dateLabel, dateEvents]) => (
        <div key={dateLabel}>
          <div className="text-xs font-medium text-muted-foreground mb-3 flex items-center gap-2">
            {dateLabel}
            <div className="flex-1 h-px bg-border/30" />
          </div>
          <div className="space-y-3">
            {dateEvents.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{event.title}</p>
                    {event.detail && (
                      <span className="text-xs text-muted-foreground">{event.detail}</span>
                    )}
                  </div>
                  {event.subtitle && (
                    <p className="text-xs text-muted-foreground mb-1">{event.subtitle}</p>
                  )}
                  {event.preview && (
                    <p className="text-xs text-muted-foreground mb-1 line-clamp-2 whitespace-pre-wrap">{event.preview}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{getRelativeTime(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
