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
  MessageCircle,
  Briefcase,
  ListTodo,
  ArrowRight,
  Edit3,
  Sparkles,
  XCircle,
  RefreshCw
} from 'lucide-react'
import { formatLeadStatus } from '@/lib/status-formatter'

interface ActivityEvent {
  id: string
  type: 'created' | 'call_received' | 'ai_intake' | 'voicemail' | 'message' | 'appointment_created' | 'appointment_completed' | 'appointment_cancelled' | 'payment_requested' | 'payment_reminder' | 'payment_failed' | 'payment_paid' | 'completed' | 'status_changed' | 'photo_sent' | 'business_phone_text' | 'business_phone_payment_request' | 'business_phone_call' | 'job_created' | 'job_updated' | 'job_completed' | 'task_created' | 'task_completed' | 'task_reopened' | 'ai_intake_edited' | 'ai_summary_refreshed' | 'customer_ignored' | 'customer_restored'
  title: string
  timestamp: string
  detail?: string
  subtitle?: string
  preview?: string
  metadata?: Record<string, any>
  navigable?: boolean
  onClick?: () => void
  fieldPresence?: {
    hasName: boolean
    hasService: boolean
    hasAddress: boolean
    hasTiming: boolean
    hasCallback: boolean
  }
  qualityIssues?: {
    serviceLooksLikeQuestion: boolean
  }
}

interface CustomerActivityTimelineProps {
  leadData: any
  onNavigateToJob?: (jobId: string) => void
  onNavigateToTask?: (taskId: string) => void
  onNavigateToPayment?: (paymentId: string) => void
  onNavigateToMessage?: (messageId: string) => void
  onNavigateToIntake?: () => void
}

export default function CustomerActivityTimeline({ leadData, onNavigateToJob, onNavigateToTask, onNavigateToPayment, onNavigateToMessage, onNavigateToIntake }: CustomerActivityTimelineProps) {
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

    // Customer status changes
    if (leadData.status_history && Array.isArray(leadData.status_history)) {
      leadData.status_history.forEach((historyItem: any, index: number) => {
        if (index === 0) return // Skip the initial status (already covered by created)
        activityEvents.push({
          id: `status-change-${historyItem.id || index}`,
          type: 'status_changed',
          title: `Status changed to ${formatLeadStatus(historyItem.new_status || historyItem.status).text}`,
          timestamp: historyItem.changed_at || historyItem.created_at,
        })
      })
    }

    // Customer ignored
    if (leadData.status === 'ignored' && leadData.updated_at !== leadData.created_at) {
      activityEvents.push({
        id: `ignored-${leadData.id}`,
        type: 'customer_ignored',
        title: 'Customer ignored',
        timestamp: leadData.updated_at,
      })
    }

    // Customer restored (if status changed from ignored back to something else)
    if (leadData.status !== 'ignored' && leadData.status_history) {
      const wasIgnored = leadData.status_history.some((h: any) => h.old_status === 'ignored' || h.new_status !== 'ignored')
      if (wasIgnored) {
        activityEvents.push({
          id: `restored-${leadData.id}`,
          type: 'customer_restored',
          title: 'Customer restored',
          timestamp: leadData.updated_at,
        })
      }
    }

    // Missed call / AI intake
    if (leadData.aiCallRecords && leadData.aiCallRecords.length > 0) {
      leadData.aiCallRecords.forEach((aiCall: any) => {
        const outcome = aiCall.outcome
        const extractedInfo = aiCall.extracted_info || leadData?.raw_metadata?.extracted_info || {}
        
        // Determine which fields are present for observability
        const hasName = Boolean(extractedInfo.customerName || extractedInfo.callerName || extractedInfo.name)
        const hasService = Boolean(extractedInfo.serviceRequested || extractedInfo.reasonForCalling || extractedInfo.request)
        const hasAddress = Boolean(extractedInfo.serviceAddress || extractedInfo.addressOrLocation)
        const hasTiming = Boolean(extractedInfo.desiredCompletionTime || extractedInfo.desiredCompletion)
        const hasCallback = Boolean(extractedInfo.callbackTime || extractedInfo.preferredCallbackTime)
        
        // Detect quality issues
        const serviceRaw = extractedInfo.serviceRequested || extractedInfo.reasonForCalling || extractedInfo.request || ''
        const serviceLooksLikeQuestion = hasService && /^(how much|what do you charge|what are your|when are you|do you|can you|who|what|when|where|why|how)\s/i.test(serviceRaw)
        
        let title = 'AI intake completed'
        if (outcome === 'early_hangup') title = 'Caller hung up'
        else if (outcome === 'no_speech') title = 'No speech detected'
        else if (outcome === 'ai_connection_failed') title = 'AI connection failed'
        else if (outcome === 'partial_intake' || outcome === 'partial') {
          // For partial intakes, show what was captured
          const capturedFields = []
          if (hasName) capturedFields.push('name')
          if (hasService) capturedFields.push('service')
          if (hasAddress) capturedFields.push('address')
          if (hasTiming) capturedFields.push('timing')
          if (hasCallback) capturedFields.push('callback')
          
          const capturedText = capturedFields.length > 0 
            ? ` (${capturedFields.join(', ')})` 
            : ' (no fields captured)'
          
          title = `Partial intake${capturedText}`
        }

        activityEvents.push({
          id: `ai-intake-${aiCall.id}`,
          type: 'ai_intake',
          title,
          timestamp: aiCall.created_at,
          navigable: !!onNavigateToIntake,
          onClick: onNavigateToIntake,
          // Add field presence for observability
          fieldPresence: {
            hasName,
            hasService,
            hasAddress,
            hasTiming,
            hasCallback
          },
          // Add quality issue flags for trust
          qualityIssues: {
            serviceLooksLikeQuestion
          }
        })
      })
    }

    // AI intake manually edited
    if (leadData.raw_metadata?.corrected_fields && Object.keys(leadData.raw_metadata.corrected_fields).length > 0) {
      const editTime = leadData.raw_metadata.corrected_fields.edited_at || leadData.updated_at
      activityEvents.push({
        id: `ai-intake-edited-${leadData.id}`,
        type: 'ai_intake_edited',
        title: 'AI intake manually edited',
        timestamp: editTime,
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

    // Customer replied (inbound messages) - group multiple replies
    if (leadData.messages && leadData.messages.length > 0) {
      const inboundMessages = leadData.messages.filter((msg: any) => msg.direction === 'inbound')
      if (inboundMessages.length > 0) {
        const firstReply = inboundMessages[0]
        if (inboundMessages.length === 1) {
          activityEvents.push({
            id: `reply-${firstReply.id}`,
            type: 'message',
            title: 'Customer replied',
            timestamp: firstReply.created_at,
            navigable: !!onNavigateToMessage,
            onClick: () => onNavigateToMessage?.(firstReply.id),
          })
        } else {
          activityEvents.push({
            id: `replies-group-${firstReply.id}`,
            type: 'message',
            title: `Customer sent ${inboundMessages.length} message${inboundMessages.length > 1 ? 's' : ''}`,
            timestamp: firstReply.created_at,
            navigable: !!onNavigateToMessage,
            onClick: () => onNavigateToMessage?.(firstReply.id),
          })
        }
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

      // Group business phone texts
      const textMessages = businessPhoneMessages.filter((msg: any) => msg.metadata?.actionType === 'business_phone_text')
      if (textMessages.length > 0) {
        const firstText = textMessages[0]
        activityEvents.push({
          id: `business-phone-text-group-${firstText.id}`,
          type: 'business_phone_text',
          title: `Sent ${textMessages.length} message${textMessages.length > 1 ? 's' : ''} from Business Phone`,
          timestamp: firstText.created_at,
          subtitle: 'Confirmed by you',
          preview: firstText.metadata?.messageBody || undefined,
          metadata: firstText.metadata,
        })
      }

      const paymentMessages = businessPhoneMessages.filter((msg: any) => msg.metadata?.actionType === 'business_phone_payment_request')
      paymentMessages.forEach((msg: any) => {
        const metadata = msg.metadata || {}
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
      })

      const callMessages = businessPhoneMessages.filter((msg: any) => msg.metadata?.actionType === 'business_phone_call')
      callMessages.forEach((msg: any) => {
        activityEvents.push({
          id: `business-phone-call-${msg.id}`,
          type: 'business_phone_call',
          title: 'Called customer from Business Phone',
          timestamp: msg.created_at,
          subtitle: 'Confirmed by you',
          metadata: msg.metadata,
        })
      })
    }

    // Jobs
    if (leadData.jobs && leadData.jobs.length > 0) {
      leadData.jobs.forEach((job: any) => {
        // Job created
        activityEvents.push({
          id: `job-created-${job.id}`,
          type: 'job_created',
          title: 'Job created',
          timestamp: job.created_at,
          detail: job.title || undefined,
          navigable: !!onNavigateToJob,
          onClick: () => onNavigateToJob?.(job.id),
        })

        // Job updated (if status changed and not created/completed)
        if (job.updated_at !== job.created_at && job.status !== 'completed') {
          activityEvents.push({
            id: `job-updated-${job.id}`,
            type: 'job_updated',
            title: 'Job updated',
            timestamp: job.updated_at,
            detail: job.title || undefined,
            navigable: !!onNavigateToJob,
            onClick: () => onNavigateToJob?.(job.id),
          })
        }

        // Job completed
        if (job.status === 'completed') {
          activityEvents.push({
            id: `job-completed-${job.id}`,
            type: 'job_completed',
            title: 'Job completed',
            timestamp: job.updated_at || job.created_at,
            detail: job.title || undefined,
            navigable: !!onNavigateToJob,
            onClick: () => onNavigateToJob?.(job.id),
          })
        }

        // Appointments (from jobs)
        if (job.scheduled_date) {
          activityEvents.push({
            id: `appointment-${job.id}`,
            type: 'appointment_created',
            title: 'Appointment scheduled',
            timestamp: job.created_at,
            detail: new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })
        }
      })
    }

    // Tasks
    if (leadData.tasks && leadData.tasks.length > 0) {
      leadData.tasks.forEach((task: any) => {
        // Task created
        activityEvents.push({
          id: `task-created-${task.id}`,
          type: 'task_created',
          title: 'Task created',
          timestamp: task.created_at,
          detail: task.title || undefined,
          navigable: !!onNavigateToTask,
          onClick: () => onNavigateToTask?.(task.id),
        })

        // Task completed
        if (task.status === 'completed') {
          activityEvents.push({
            id: `task-completed-${task.id}`,
            type: 'task_completed',
            title: 'Task completed',
            timestamp: task.updated_at || task.created_at,
            detail: task.title || undefined,
            navigable: !!onNavigateToTask,
            onClick: () => onNavigateToTask?.(task.id),
          })
        }

        // Task reopened (if was completed then not completed)
        if (task.status !== 'completed' && task.updated_at !== task.created_at) {
          activityEvents.push({
            id: `task-reopened-${task.id}`,
            type: 'task_reopened',
            title: 'Task reopened',
            timestamp: task.updated_at,
            detail: task.title || undefined,
            navigable: !!onNavigateToTask,
            onClick: () => onNavigateToTask?.(task.id),
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
            navigable: !!onNavigateToPayment,
            onClick: () => onNavigateToPayment?.(pr.id),
          })
        } else if (pr.status === 'paid') {
          activityEvents.push({
            id: `payment-paid-${pr.id}`,
            type: 'payment_paid',
            title: 'Payment received',
            timestamp: pr.paid_at || pr.created_at,
            detail: `$${(pr.amount_cents / 100).toFixed(2)}`,
            navigable: !!onNavigateToPayment,
            onClick: () => onNavigateToPayment?.(pr.id),
          })
        } else if (pr.status === 'failed') {
          activityEvents.push({
            id: `payment-failed-${pr.id}`,
            type: 'payment_failed',
            title: 'Payment failed',
            timestamp: pr.updated_at || pr.created_at,
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
  }, [leadData, onNavigateToJob, onNavigateToTask, onNavigateToPayment, onNavigateToMessage, onNavigateToIntake])

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
        return <Phone className="w-4 h-4 text-emerald-500" />
      case 'voicemail':
        return <MessageSquare className="w-4 h-4 text-amber-500" />
      case 'message':
      case 'business_phone_text':
        return <MessageCircle className="w-4 h-4 text-blue-500" />
      case 'appointment_created':
        return <Calendar className="w-4 h-4 text-violet-500" />
      case 'appointment_completed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'appointment_cancelled':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'payment_requested':
      case 'business_phone_payment_request':
        return <CreditCard className="w-4 h-4 text-amber-500" />
      case 'payment_reminder':
        return <RefreshCw className="w-4 h-4 text-amber-500" />
      case 'payment_failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'payment_paid':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'status_changed':
        return <ArrowRight className="w-4 h-4 text-blue-500" />
      case 'photo_sent':
        return <FileText className="w-4 h-4 text-blue-500" />
      case 'business_phone_call':
        return <Phone className="w-4 h-4 text-emerald-500" />
      case 'job_created':
        return <Briefcase className="w-4 h-4 text-teal-500" />
      case 'job_updated':
        return <Edit3 className="w-4 h-4 text-teal-500" />
      case 'job_completed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'task_created':
        return <ListTodo className="w-4 h-4 text-purple-500" />
      case 'task_completed':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
      case 'task_reopened':
        return <RefreshCw className="w-4 h-4 text-purple-500" />
      case 'ai_intake_edited':
        return <Edit3 className="w-4 h-4 text-amber-500" />
      case 'ai_summary_refreshed':
        return <Sparkles className="w-4 h-4 text-amber-500" />
      case 'customer_ignored':
        return <XCircle className="w-4 h-4 text-slate-500" />
      case 'customer_restored':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />
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
      <div className="text-center py-8">
        <Clock className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground leading-relaxed">
          Activity will appear here as you communicate with this customer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {Object.entries(groupedEvents).map(([dateLabel, dateEvents]) => (
        <div key={dateLabel}>
          <div className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2.5">
            {dateLabel}
          </div>
          <div className="space-y-2">
            {dateEvents.map((event) => (
              <div
                key={event.id}
                className={`flex items-start gap-2.5 py-1 ${event.navigable ? 'cursor-pointer hover:bg-muted/20 -mx-1.5 px-1.5 rounded-md transition-colors' : ''}`}
                onClick={event.onClick}
              >
                <div className="flex-shrink-0 mt-0.5 w-4">
                  {getIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                    <p className="text-xs font-medium text-foreground">{event.title}</p>
                    {event.detail && (
                      <span className="text-[10px] text-muted-foreground/80">{event.detail}</span>
                    )}
                    {event.navigable && (
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40" />
                    )}
                  </div>
                  {event.subtitle && (
                    <p className="text-[10px] text-muted-foreground/70 mb-0.5">{event.subtitle}</p>
                  )}
                  {event.preview && (
                    <p className="text-[10px] text-muted-foreground/70 mb-0.5 line-clamp-2 whitespace-pre-wrap">{event.preview}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50">{getRelativeTime(event.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
