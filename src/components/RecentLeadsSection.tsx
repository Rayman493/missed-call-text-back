'use client'

import { useState, useEffect, useRef } from 'react'
import { formatPhoneNumber, getLeadDisplayName } from '@/lib/utils'
import { getLeadAIIntake } from '@/lib/ai-field-mapping'
import { createBrowserClient } from '@/lib/supabase/browser'
import DashboardErrorBoundary from './DashboardErrorBoundary'
import Link from 'next/link'
import LeadTimeline from '@/components/LeadTimeline'

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
        const { data } = await supabase
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
            conversations (
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
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .order('first_contact_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })

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
    if (lead.messages?.length === 0) return 'New'
    if (lead.messages?.some((m: any) => m.direction === 'inbound')) {
      return 'Awaiting Response'
    }
    return 'Contacted'
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
    return 'New Lead'
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
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-muted rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-semibold text-foreground">Loading leads...</h2>
              <p className="text-[10px] sm:text-sm text-muted-foreground">Please wait</p>
            </div>
          </div>
        </div>
      </DashboardErrorBoundary>
    )
  }

  return (
    <DashboardErrorBoundary>
      {/* Recent Leads List */}
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 sm:p-3">
        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-foreground">Recent Customers</h2>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">{leads.length} customer{leads.length !== 1 ? 's' : ''} recovered</p>
        </div>

        {leads.length === 0 ? (
          <div className="text-center py-5 sm:py-6 px-4">
            {!isOnboardingExpanded && (
              <div className="space-y-1.5 sm:space-y-2">
                <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground">
                  No recent customers
                </p>
                <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                  Recent customers will appear here automatically after missed calls.
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {leads.length > 0 && (
              <div className="space-y-1 sm:space-y-1.5">
                {leads.slice(0, 5).map((lead, index) => {
                  const aiData = getAIData(lead)
                  const isLatest = index === 0

                  return (
                    <div key={lead.id} className="block">
                      <Link href={`/dashboard/leads/${lead.id}`}>
                        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-2 sm:p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 cursor-pointer">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-foreground truncate">
                                  {getLeadDisplayName(lead)}
                                </p>
                                <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 ${
                                  getLeadStatus(lead) === 'Awaiting Response'
                                    ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                    : getLeadStatus(lead) === 'New'
                                    ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                    : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                }`}>
                                  {getLeadStatus(lead)}
                                </span>
                                {aiData.urgency && (
                                  <span className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-medium flex-shrink-0 ${
                                    aiData.urgency.toLowerCase() === 'urgent' || aiData.urgency.toLowerCase() === 'high'
                                      ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                      : 'bg-slate-100 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300'
                                  }`}>
                                    {aiData.urgency}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 sm:gap-3">
                                {(() => {
                                  const formattedPhone = formatPhoneNumber(lead.phone_number)
                                  return formattedPhone !== 'Unknown Caller' && (
                                    <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400 font-medium">
                                      {formattedPhone}
                                    </p>
                                  )
                                })()}
                                <span className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">
                                  {formatRelativeTime(lead.created_at)}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                              {lead.voicemail_recordings && lead.voicemail_recordings.length > 0 && (
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                              )}
                              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 dark:text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </DashboardErrorBoundary>
  )
}
