'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { Phone, MessageSquare, Reply, Calendar, Mic, Briefcase, CheckCircle, CreditCard, AlertCircle, Bot, DollarSign, Video } from 'lucide-react'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'

interface RecentActivityCardProps {
  business: Business | null
}

interface ActivityEvent {
  id: string
  type: 'call_captured' | 'text_sent' | 'customer_replied' | 'follow_up_scheduled' | 'voicemail_received' | 'job_created' | 'job_completed' | 'task_completed' | 'appointment_scheduled' | 'payment_requested' | 'payment_received' | 'payment_failed'
  title: string
  description: string
  timestamp: string
  icon: React.ReactNode
  color: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  conciseRequestTitle?: string
}

export default function RecentActivityCard({ business }: RecentActivityCardProps) {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecentActivity = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get recent leads, messages, jobs, tasks, and payments
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        
        // Fetch recent leads with relations
        const { data: leads } = await supabase
          .from('leads')
          .select(`
            *,
            jobs(id, title, status, created_at, updated_at, scheduled_date),
            tasks(id, title, status, created_at, updated_at),
            payment_requests(id, amount_cents, status, created_at, updated_at, paid_at),
            ai_call_records(id, outcome, created_at)
          `)
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        // Fetch recent messages (messages has no business_id; filter by business phone)
        const businessPhone = business.twilio_phone_number || ''
        const { data: messages } = await supabase
          .from('messages')
          .select('*')
          .or(`from_phone.eq.${businessPhone},to_phone.eq.${businessPhone}`)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        // Fetch recent voicemails through leads
        const { data: voicemailLeads } = await supabase
          .from('leads')
          .select('id, voicemail_recordings (id, recording_url, recording_duration, recording_status, created_at)')
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

        const voicemails = (voicemailLeads || []).flatMap((l: any) => l.voicemail_recordings || []).slice(0, 2)

        // Convert to activity events
        const events: ActivityEvent[] = []

        // Add lead captures
        leads?.forEach((lead: any) => {
          const intake = getLeadAIIntake(lead)
          const customerName = intake.customerName || lead.name || 'Unknown'
          const conciseTitle = intake.conciseRequestTitle || intake.serviceRequested || ''
          const displayName = lead.caller_phone || 'Unknown Caller'

          // AI Intake Completed event
          if (lead.ai_call_records && lead.ai_call_records.length > 0) {
            events.push({
              id: `ai-intake-${lead.id}`,
              type: 'call_captured',
              title: 'AI Intake Completed',
              description: customerName,
              timestamp: lead.created_at,
              icon: <Bot className="w-3 h-3" />,
              color: 'text-blue-600 dark:text-blue-400',
              customerId: lead.id,
              customerName,
              customerPhone: lead.caller_phone,
              conciseRequestTitle: conciseTitle,
            })
          }

          // Add jobs
          if (lead.jobs && lead.jobs.length > 0) {
            lead.jobs.forEach((job: any) => {
              if (new Date(job.created_at) >= new Date(sevenDaysAgo)) {
                events.push({
                  id: `job-created-${job.id}`,
                  type: 'job_created',
                  title: 'Job Scheduled',
                  description: `${job.title || 'New job'}`,
                  timestamp: job.created_at,
                  icon: <Briefcase className="w-3 h-3" />,
                  color: 'text-teal-600 dark:text-teal-400',
                  customerId: lead.id,
                  customerName,
                })
              }
              if (job.status === 'completed' && new Date(job.updated_at) >= new Date(sevenDaysAgo)) {
                events.push({
                  id: `job-completed-${job.id}`,
                  type: 'job_completed',
                  title: 'Job Completed',
                  description: `${job.title || 'Job'}`,
                  timestamp: job.updated_at,
                  icon: <CheckCircle className="w-3 h-3" />,
                  color: 'text-emerald-600 dark:text-emerald-400',
                  customerId: lead.id,
                  customerName,
                })
              }
            })
          }

          // Add tasks
          if (lead.tasks && lead.tasks.length > 0) {
            lead.tasks.forEach((task: any) => {
              if (task.status === 'completed' && new Date(task.updated_at) >= new Date(sevenDaysAgo)) {
                events.push({
                  id: `task-completed-${task.id}`,
                  type: 'task_completed',
                  title: 'Task Completed',
                  description: `${task.title || 'Task'}`,
                  timestamp: task.updated_at,
                  icon: <CheckCircle className="w-3 h-3" />,
                  color: 'text-emerald-600 dark:text-emerald-400',
                  customerId: lead.id,
                  customerName,
                })
              }
            })
          }

          // Add payments
          if (lead.payment_requests && lead.payment_requests.length > 0) {
            lead.payment_requests.forEach((pr: any) => {
              if (new Date(pr.created_at) >= new Date(sevenDaysAgo)) {
                if (pr.status === 'pending') {
                  events.push({
                    id: `payment-requested-${pr.id}`,
                    type: 'payment_requested',
                    title: 'Payment Request Sent',
                    description: customerName,
                    timestamp: pr.created_at,
                    icon: <CreditCard className="w-3 h-3" />,
                    color: 'text-amber-600 dark:text-amber-400',
                    customerId: lead.id,
                    customerName,
                  })
                } else if (pr.status === 'paid' && new Date(pr.paid_at) >= new Date(sevenDaysAgo)) {
                  events.push({
                    id: `payment-paid-${pr.id}`,
                    type: 'payment_received',
                    title: 'Payment Received',
                    description: `$${(pr.amount_cents / 100).toFixed(2)}`,
                    timestamp: pr.paid_at,
                    icon: <DollarSign className="w-3 h-3" />,
                    color: 'text-emerald-600 dark:text-emerald-400',
                    customerId: lead.id,
                    customerName,
                  })
                } else if (pr.status === 'failed' && new Date(pr.updated_at) >= new Date(sevenDaysAgo)) {
                  events.push({
                    id: `payment-failed-${pr.id}`,
                    type: 'payment_failed',
                    title: 'Payment Failed',
                    description: `$${(pr.amount_cents / 100).toFixed(2)}`,
                    timestamp: pr.updated_at,
                    icon: <AlertCircle className="w-3 h-3" />,
                    color: 'text-red-600 dark:text-red-400',
                    customerId: lead.id,
                    customerName,
                  })
                }
              }
            })
          }

          // Add appointments from jobs
          if (lead.jobs && lead.jobs.length > 0) {
            lead.jobs.forEach((job: any) => {
              if (job.scheduled_date && new Date(job.created_at) >= new Date(sevenDaysAgo)) {
                const appointmentDate = new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                events.push({
                  id: `appointment-${job.id}`,
                  type: 'appointment_scheduled',
                  title: 'Appointment Scheduled',
                  description: appointmentDate,
                  timestamp: job.created_at,
                  icon: <Calendar className="w-3 h-3" />,
                  color: 'text-violet-600 dark:text-violet-400',
                  customerId: lead.id,
                  customerName,
                })
              }
            })
          }
        })

        // Add messages
        messages?.forEach((message: any) => {
          const displayPhone = message.direction === 'outbound' ? message.to_phone : message.from_phone
          if (message.direction === 'outbound') {
            events.push({
              id: `message-out-${message.id}`,
              type: 'text_sent',
              title: 'Message Sent',
              description: `To ${displayPhone || 'Unknown'}`,
              timestamp: message.created_at,
              icon: <MessageSquare className="w-3 h-3" />,
              color: 'text-green-600 dark:text-green-400',
            })
          } else {
            events.push({
              id: `message-in-${message.id}`,
              type: 'customer_replied',
              title: 'Customer Replied',
              description: `From ${displayPhone || 'Unknown'}`,
              timestamp: message.created_at,
              icon: <Reply className="w-3 h-3" />,
              color: 'text-amber-600 dark:text-amber-400',
            })
          }
        })

        // Add voicemails
        voicemails?.forEach((voicemail: any) => {
          events.push({
            id: `voicemail-${voicemail.id}`,
            type: 'voicemail_received',
            title: 'Voicemail Received',
            description: 'New voicemail',
            timestamp: voicemail.created_at,
            icon: <Mic className="w-3 h-3" />,
            color: 'text-purple-600 dark:text-purple-400',
          })
        })

        // Sort by timestamp and take latest 8
        const sortedEvents = events
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 8)

        setActivities(sortedEvents)
      } catch (error) {
        console.error('Error fetching recent activity:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRecentActivity()
  }, [business])

  const handleActivityClick = (activity: ActivityEvent) => {
    if (activity.customerId) {
      router.push(`/dashboard/leads/${activity.customerId}`)
    }
  }

  if (loading) {
    return (
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-4 h-4 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20 mb-1"></div>
                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-12"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Business activity will appear here as you work with customers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activities.slice(0, 5).map((activity, index) => (
            <div
              key={activity.id}
              onClick={() => handleActivityClick(activity)}
              className={`flex items-start gap-3 ${activity.customerId ? 'cursor-pointer group' : ''}`}
            >
              <div className="flex-shrink-0 pt-0.5">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${activity.color}`}>
                  {activity.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug">{activity.title}</p>
                {activity.description && (
                  <p className="text-xs text-muted-foreground leading-snug mt-0.5">{activity.description}</p>
                )}
                <p className="text-[10px] text-muted-foreground/70 mt-0.5">{formatRelativeTime(activity.timestamp)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}