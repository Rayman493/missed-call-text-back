'use client'

import { useState, useEffect, useRef } from 'react'
import { formatPhoneNumber, getLeadDisplayName } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { createBrowserClient } from '@/lib/supabase/browser'
import DashboardErrorBoundary from './DashboardErrorBoundary'
import Link from 'next/link'
import LeadTimeline from '@/components/LeadTimeline'
import { getLeadLifecycleStatus } from '@/lib/lead-lifecycle'
import { getCardAccentClasses, getCardGradientClasses, getCardBorderClasses, getStatusBadgeClasses } from '@/lib/lead-status-colors'
import { formatLeadStatus } from '@/lib/status-formatter'
import { ChevronRight, User } from 'lucide-react'

interface RecentLeadsSectionProps {
  businessId: string
  isOnboardingComplete?: boolean
  provisioningStatus?: string
  forwardingVerified?: boolean
  isOnboardingExpanded?: boolean
}

export default function RecentLeadsSection({ businessId, isOnboardingComplete = false, provisioningStatus = 'pending', forwardingVerified = false, isOnboardingExpanded = false }: RecentLeadsSectionProps) {
  // ALL hooks must be called at the top before any conditional returns
  const [leads, setLeads] = useState<any[]>([])
  const [followUpJobs, setFollowUpJobs] = useState<any[]>([])
  const [missedCalls, setMissedCalls] = useState(0)
  const [callEvents, setCallEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()
  const realtimeChannelRef = useRef<any>(null)

  // Fetch leads, follow-up jobs, and call events
  useEffect(() => {
    if (!businessId) return

    const fetchLeads = async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('leads')
          .select(`
            *,
            messages (
              id,
              body,
              direction,
              from_phone,
              to_phone,
              status,
              error_code,
              error_message,
              status_updated_at,
              created_at,
              conversation_id
            ),
            conversations!conversation_id (
              id,
              status,
              source,
              started_at,
              last_activity_at
            ),
            voicemail_recordings (
              id,
              recording_url,
              recording_duration,
              recording_status,
              created_at
            ),
            ai_call_records (
              id,
              extracted_info,
              caller_phone,
              business_id,
              lead_id,
              created_at
            )
          `)
          .eq('business_id', businessId)
          .is('deleted_at', null)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .order('first_contact_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .or('status.is.null,status.neq.ignored')

        if (error) {
          console.error('[RecentLeadsSection] Query error:', error)
          setLeads([])
          return
        }

        // Normalize ai_call_records to aiCallRecords for UI compatibility
        const normalizedLeads = (data || []).map((lead: any) => ({
          ...lead,
          aiCallRecords: lead.ai_call_records || []
        }))
        setLeads(normalizedLeads)
      } catch (error) {
        console.error('[RecentLeadsSection] Error fetching leads:', error)
        setLeads([])
      }

      // Fetch follow-up jobs
      try {
        const supabaseAny = supabase as any
        const { data: jobsData } = await supabaseAny
          .from('follow_up_jobs')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })

        setFollowUpJobs(jobsData || [])
      } catch (error) {
        console.error('[RecentLeadsSection] Error fetching follow-up jobs:', error)
      }

      // Fetch call events for missed calls count
      try {
        const { data: callEventsData } = await supabase
          .from('call_events')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })

        setCallEvents(callEventsData || [])
        setMissedCalls(callEventsData?.length || 0)
      } catch (error) {
        console.error('[RecentLeadsSection] Error fetching call events:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchLeads()
  }, [businessId, supabase])

  // Realtime subscription for dashboard updates
  useEffect(() => {
    if (!businessId || !supabase) return

    // Clean up existing subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current)
    }

    // Set up new subscription for messages and leads
    const channel = supabase
      .channel(`dashboard:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new
            setLeads(prev => {
              if (!prev) return prev
              
              return prev.map(lead => {
                if (lead.id === newMessage.lead_id) {
                  const updatedMessages = [...(lead.messages || []), newMessage]
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  
                  return {
                    ...lead,
                    messages: updatedMessages,
                    last_message_at: newMessage.created_at
                  }
                }
                return lead
              })
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedMessage = payload.new
            setLeads(prev => {
              if (!prev) return prev
              
              return prev.map(lead => {
                if (lead.id === updatedMessage.lead_id) {
                  const updatedMessages = lead.messages?.map((msg: any) => 
                    msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
                  )
                  
                  return {
                    ...lead,
                    messages: updatedMessages
                  }
                }
                return lead
              })
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `business_id=eq.${businessId}`
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT') {
            const newLead = payload.new
            setLeads(prev => {
              if (!prev) return [newLead]
              
              const existingLead = prev.find(lead => lead.id === newLead.id)
              if (existingLead) return prev
              
              return [newLead, ...prev]
            })
          } else if (payload.eventType === 'UPDATE') {
            const updatedLead = payload.new
            setLeads(prev => {
              if (!prev) return prev
              
              return prev.map(lead => 
                lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead
              )
            })
          }
        }
      )
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Subscription established
        }
      })

    realtimeChannelRef.current = channel

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current)
      }
    }
  }, [businessId, supabase])

  // Helper functions for lead status and display
  const getLeadStatus = (lead: any) => {
    return getLeadLifecycleStatus(lead)
  }

  // Helper to get structured AI data from lead
  const getAIData = (lead: any): { reason: string | null; urgency: string | null; details: string | null } => {
    const intake = getLeadAIIntake(lead)
    return {
      reason: intake.serviceRequested,
      urgency: intake.desiredCompletion,
      details: intake.additionalDetails,
    }
  }

  const getLeadStage = (lead: any) => {
    const hasInbound = lead.messages?.some((m: any) => m.direction === 'inbound')
    const hasOutboundAfterInbound = lead.messages?.some((m: any) => {
      if (m.direction !== 'outbound') return false
      const inboundMessages = lead.messages?.filter((msg: any) => msg.direction === 'inbound')
      if (inboundMessages.length === 0) return false
      const latestInbound = inboundMessages.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]
      return new Date(m.created_at).getTime() > new Date(latestInbound.created_at).getTime()
    })
    
    if (hasInbound && !hasOutboundAfterInbound) return 'Needs Response'
    if (hasInbound && hasOutboundAfterInbound) return 'Follow-up Active'
    if (!hasInbound && lead.messages?.length > 0) return 'Initial Contact'
    return 'New Customer'
  }

  const getNextFollowUp = (lead: any) => {
    const leadFollowUps = followUpJobs.filter((job: any) => job.lead_id === lead.id && job.status === 'pending')
    if (leadFollowUps.length === 0) return null
    
    const nextJob = leadFollowUps.sort((a: any, b: any) => 
      new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime()
    )[0]
    
    return {
      time: nextJob.scheduled_for,
      step: nextJob.step
    }
  }

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`
  }

  const formatFollowUpTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Tomorrow'
    if (diffDays < 7) return `In ${diffDays} days`
    return `In ${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''}`
  }

  if (loading) {
    return (
      <DashboardErrorBoundary>
        <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <User className="w-5 h-5 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Recent Customers</h2>
            </div>
          </div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg">
                <div className="w-9 h-9 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse flex-shrink-0"></div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3.5 bg-slate-200 dark:bg-slate-700 rounded w-24 animate-pulse"></div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-32 animate-pulse"></div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </DashboardErrorBoundary>
    )
  }

  return (
    <DashboardErrorBoundary>
      <div className="bg-card/50 backdrop-blur-sm border border-border/30 rounded-xl p-3 sm:p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Recent Customers</h2>
          </div>
          <p className="text-xs text-muted-foreground">{leads.length} customer{leads.length !== 1 ? 's' : ''} recovered</p>
        </div>

        {leads.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Your first customer will appear here after AI captures a lead.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {leads.slice(0, 5).map((lead, index) => {
              const aiData = getAIData(lead)
              const displayName = getLeadDisplayName(lead)
              const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              const statusDisplay = formatLeadStatus(lead.lead_status || lead.status)

              return (
                <Link key={lead.id} href={`/dashboard/leads/${lead.id}`}>
                  <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group">
                    <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-foreground truncate mb-1">
                        {displayName}
                      </p>
                      {aiData.reason && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate mb-1">
                          {aiData.reason}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusDisplay.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : statusDisplay.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : statusDisplay.color === 'amber' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400'}`}>
                          {statusDisplay.text}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-500 flex-shrink-0">
                          {formatRelativeTime(lead.created_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </DashboardErrorBoundary>
  )
}
