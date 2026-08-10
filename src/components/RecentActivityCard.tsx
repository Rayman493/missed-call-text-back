'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatRelativeTime } from '@/lib/utils'
import { Phone, MessageSquare, Reply, Calendar, Mic, Briefcase, CheckCircle, CreditCard, AlertCircle, Bot, DollarSign, Video, Send } from 'lucide-react'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'

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
  iconBgColor: string
  iconTextColor: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  conciseRequestTitle?: string
  jobTitle?: string
  jobScheduledDate?: string
}

export default function RecentActivityCard({ business }: RecentActivityCardProps) {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  const formatPhoneNumber = (phone: string): string => {
    if (!phone) return ''
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    return phone
  }

  const getDisplayName = (customerName?: string, customerPhone?: string): string => {
    if (customerName && customerName !== 'Unknown') {
      return customerName
    }
    if (customerPhone) {
      return formatPhoneNumber(customerPhone)
    }
    return 'Customer'
  }

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
            payment_requests(id, amount_cents, status, created_at, updated_at, paid_at, payment_method_type, lead_id),
            ai_call_records(id, outcome, created_at)
          `)
          .eq('business_id', business.id)
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(10)

        // Fetch terminal payments linked to jobs (Tap to Pay)
        const { data: terminalPayments } = await supabase
          .from('payment_requests')
          .select(`
            id,
            amount_cents,
            status,
            created_at,
            updated_at,
            paid_at,
            payment_method_type,
            job_id,
            jobs!inner(id, title, lead_id, business_id)
          `)
          .eq('business_id', business.id)
          .eq('payment_method_type', 'card_present')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5)

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
          const conciseTitle = getLeadRequestTitle(lead) || intake.serviceRequested || ''
          const displayName = getDisplayName(customerName, lead.caller_phone)

          // AI Intake Completed event
          if (lead.ai_call_records && lead.ai_call_records.length > 0) {
            events.push({
              id: `ai-intake-${lead.id}`,
              type: 'call_captured',
              title: 'AI Intake Completed',
              description: conciseTitle || 'New lead captured',
              timestamp: lead.created_at,
              icon: <Bot className="w-4 h-4" />,
              iconBgColor: 'bg-blue-500/20',
              iconTextColor: 'text-blue-400',
              customerId: lead.id,
              customerName: displayName,
              customerPhone: lead.caller_phone,
              conciseRequestTitle: conciseTitle,
            })
          }

          // Add jobs
          if (lead.jobs && lead.jobs.length > 0) {
            lead.jobs.forEach((job: any) => {
              const displayName = getDisplayName(customerName, lead.caller_phone)
              const jobTitle = job.title || 'Job'
              const jobDate = job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

              if (new Date(job.created_at) >= new Date(sevenDaysAgo)) {
                events.push({
                  id: `job-created-${job.id}`,
                  type: 'job_created',
                  title: 'Job Scheduled',
                  description: jobDate ? `${jobTitle} • ${jobDate}` : jobTitle,
                  timestamp: job.created_at,
                  icon: <Briefcase className="w-4 h-4" />,
                  iconBgColor: 'bg-teal-500/20',
                  iconTextColor: 'text-teal-400',
                  customerId: lead.id,
                  customerName: displayName,
                  jobTitle,
                  jobScheduledDate: job.scheduled_date,
                })
              }
              if (job.status === 'completed' && new Date(job.updated_at) >= new Date(sevenDaysAgo)) {
                events.push({
                  id: `job-completed-${job.id}`,
                  type: 'job_completed',
                  title: 'Job Completed',
                  description: jobTitle,
                  timestamp: job.updated_at,
                  icon: <CheckCircle className="w-4 h-4" />,
                  iconBgColor: 'bg-emerald-500/20',
                  iconTextColor: 'text-emerald-400',
                  customerId: lead.id,
                  customerName: displayName,
                  jobTitle,
                })
              }
            })
          }

          // Add tasks
          if (lead.tasks && lead.tasks.length > 0) {
            lead.tasks.forEach((task: any) => {
              const displayName = getDisplayName(customerName, lead.caller_phone)
              if (task.status === 'completed' && new Date(task.updated_at) >= new Date(sevenDaysAgo)) {
                events.push({
                  id: `task-completed-${task.id}`,
                  type: 'task_completed',
                  title: 'Task Completed',
                  description: task.title || 'Task',
                  timestamp: task.updated_at,
                  icon: <CheckCircle className="w-4 h-4" />,
                  iconBgColor: 'bg-emerald-500/20',
                  iconTextColor: 'text-emerald-400',
                  customerId: lead.id,
                  customerName: displayName,
                })
              }
            })
          }

          // Add payments
          if (lead.payment_requests && lead.payment_requests.length > 0) {
            lead.payment_requests.forEach((pr: any) => {
              const displayName = getDisplayName(customerName, lead.caller_phone)
              const amount = `$${(pr.amount_cents / 100).toFixed(2)}`
              if (new Date(pr.created_at) >= new Date(sevenDaysAgo)) {
                if (pr.status === 'pending') {
                  events.push({
                    id: `payment-requested-${pr.id}`,
                    type: 'payment_requested',
                    title: 'Payment Request Sent',
                    description: amount,
                    timestamp: pr.created_at,
                    icon: <CreditCard className="w-4 h-4" />,
                    iconBgColor: 'bg-amber-500/20',
                    iconTextColor: 'text-amber-400',
                    customerId: lead.id,
                    customerName: displayName,
                  })
                } else if (pr.status === 'paid' && new Date(pr.paid_at) >= new Date(sevenDaysAgo)) {
                  events.push({
                    id: `payment-paid-${pr.id}`,
                    type: 'payment_received',
                    title: 'Payment Received',
                    description: amount,
                    timestamp: pr.paid_at,
                    icon: <DollarSign className="w-4 h-4" />,
                    iconBgColor: 'bg-emerald-500/20',
                    iconTextColor: 'text-emerald-400',
                    customerId: lead.id,
                    customerName: displayName,
                  })
                } else if (pr.status === 'failed' && new Date(pr.updated_at) >= new Date(sevenDaysAgo)) {
                  events.push({
                    id: `payment-failed-${pr.id}`,
                    type: 'payment_failed',
                    title: 'Payment Failed',
                    description: amount,
                    timestamp: pr.updated_at,
                    icon: <AlertCircle className="w-4 h-4" />,
                    iconBgColor: 'bg-red-500/20',
                    iconTextColor: 'text-red-400',
                    customerId: lead.id,
                    customerName: displayName,
                  })
                }
              }
            })
          }

          // Add appointments from jobs
          if (lead.jobs && lead.jobs.length > 0) {
            lead.jobs.forEach((job: any) => {
              const displayName = getDisplayName(customerName, lead.caller_phone)
              if (job.scheduled_date && new Date(job.created_at) >= new Date(sevenDaysAgo)) {
                const appointmentDate = new Date(job.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                events.push({
                  id: `appointment-${job.id}`,
                  type: 'appointment_scheduled',
                  title: 'Appointment Scheduled',
                  description: appointmentDate,
                  timestamp: job.created_at,
                  icon: <Calendar className="w-4 h-4" />,
                  iconBgColor: 'bg-violet-500/20',
                  iconTextColor: 'text-violet-400',
                  customerId: lead.id,
                  customerName: displayName,
                })
              }
            })
          }
        })

        // Add messages
        messages?.forEach((message: any) => {
          const displayPhone = message.direction === 'outbound' ? message.to_phone : message.from_phone
          const formattedPhone = formatPhoneNumber(displayPhone)
          if (message.direction === 'outbound') {
            events.push({
              id: `message-out-${message.id}`,
              type: 'text_sent',
              title: 'Message Sent',
              description: formattedPhone ? `To ${formattedPhone}` : 'Message sent',
              timestamp: message.created_at,
              icon: <Send className="w-4 h-4" />,
              iconBgColor: 'bg-amber-500/20',
              iconTextColor: 'text-amber-400',
            })
          } else {
            events.push({
              id: `message-in-${message.id}`,
              type: 'customer_replied',
              title: 'Customer Replied',
              description: formattedPhone ? `From ${formattedPhone}` : 'Message received',
              timestamp: message.created_at,
              icon: <MessageSquare className="w-4 h-4" />,
              iconBgColor: 'bg-green-500/20',
              iconTextColor: 'text-green-400',
            })
          }
        })

        // Add voicemails
        voicemails?.forEach((voicemail: any) => {
          events.push({
            id: `voicemail-${voicemail.id}`,
            type: 'voicemail_received',
            title: 'Voicemail Received',
            description: 'Left a voicemail',
            timestamp: voicemail.created_at,
            icon: <Mic className="w-4 h-4" />,
            iconBgColor: 'bg-purple-500/20',
            iconTextColor: 'text-purple-400',
          })
        })

        // Add terminal payments (Tap to Pay)
        terminalPayments?.forEach((tp: any) => {
          const job = tp.jobs
          const jobTitle = job?.title || 'Job'
          const amount = `$${(tp.amount_cents / 100).toFixed(2)}`
          if (tp.status === 'paid' && tp.paid_at && new Date(tp.paid_at) >= new Date(sevenDaysAgo)) {
            events.push({
              id: `terminal-payment-${tp.id}`,
              type: 'payment_received',
              title: 'Payment Received',
              description: `${amount} • Tap to Pay`,
              timestamp: tp.paid_at,
              icon: <DollarSign className="w-4 h-4" />,
              iconBgColor: 'bg-emerald-500/20',
              iconTextColor: 'text-emerald-400',
              customerId: job?.lead_id,
              customerName: jobTitle,
            })
          } else if (tp.status === 'failed' && new Date(tp.updated_at) >= new Date(sevenDaysAgo)) {
            events.push({
              id: `terminal-payment-failed-${tp.id}`,
              type: 'payment_failed',
              title: 'Payment Failed',
              description: `${amount} • Tap to Pay`,
              timestamp: tp.updated_at,
              icon: <AlertCircle className="w-4 h-4" />,
              iconBgColor: 'bg-red-500/20',
              iconTextColor: 'text-red-400',
              customerId: job?.lead_id,
              customerName: jobTitle,
            })
          }
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
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-2.5 sm:p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-foreground">Activity</h3>
        </div>
        <div className="space-y-0">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-start gap-3 py-2 px-2">
              <div className="w-9 h-9 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse"></div>
              <div className="flex-1">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24 mb-2"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-1"></div>
                <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-2.5 sm:p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-foreground">Activity</h3>
      </div>

      {activities.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-xs text-muted-foreground/80">Business activity will appear here as you work with customers.</p>
        </div>
      ) : (
        <div className="space-y-0">
          {activities.slice(0, 5).map((activity, index) => (
            <div
              key={activity.id}
              onClick={() => handleActivityClick(activity)}
              className={`flex items-start gap-3 py-2 px-2 ${activity.customerId ? 'cursor-pointer hover:bg-muted/20 -mx-2 px-2 rounded-lg transition-colors' : ''} ${index < activities.slice(0, 5).length - 1 ? 'border-b border-border/30' : ''}`}
            >
              <div className="flex-shrink-0">
                <div className={`w-9 h-9 rounded-lg ${activity.iconBgColor} ${activity.iconTextColor} flex items-center justify-center`}>
                  {activity.icon}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground mb-0.5">{activity.title}</p>
                <div className="flex items-center gap-2 mb-0.5">
                  {activity.customerName && (
                    <p className="text-xs font-medium text-foreground truncate">{activity.customerName}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60">{formatRelativeTime(activity.timestamp)}</p>
                </div>
                {activity.description && (
                  <p className="text-xs text-muted-foreground/70 truncate">{activity.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}