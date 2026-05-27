'use client'

import { useState, useEffect, useRef } from 'react'
import { formatPhoneNumber, getLeadDisplayName } from '@/lib/utils'
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
      console.log('[Leads Fetch] Starting leads fetch', { businessId, loading })
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
            )
          `)
          .eq('business_id', businessId)
          .eq('is_demo', false)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .order('first_contact_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })

        const leadsData = data as any[]
        console.log('[Leads Fetch] Success', { count: leadsData?.length || 0, loading: false })
        setLeads(leadsData || [])
      } catch (error) {
        console.error('[RecentLeadsSection] Error fetching leads:', error)
        console.log('[Leads Fetch] Error', { error, loading: false })
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
          console.log('[RecentLeadsSection] Realtime subscription established')
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

  // Render the leads section
  console.log('[Dashboard Render] RecentLeadsSection')
  console.log('[RecentLeadsSection] raw leads data:', leads)
  console.log('[RecentLeadsSection] Array.isArray(leads):', Array.isArray(leads))
  console.log('[RecentLeadsSection] leads.length:', leads.length)
  if (leads.length > 0) {
    console.log('[RecentLeadsSection] first lead keys:', Object.keys(leads[0]))
  }

  if (loading) {
    return (
      <DashboardErrorBoundary>
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-muted-foreground animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Loading leads...</h2>
              <p className="text-sm text-muted-foreground">Please wait</p>
            </div>
          </div>
        </div>
      </DashboardErrorBoundary>
    )
  }

  return (
    <DashboardErrorBoundary>
      {/* Latest Lead */}
      <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-xl shadow-md dark:shadow-md hover:shadow-lg dark:hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600/20 dark:from-blue-500/20 dark:to-blue-600/20 rounded-xl flex items-center justify-center border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-foreground">Latest Lead</h2>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">{leads.length} lead{leads.length !== 1 ? 's' : ''} recovered</p>
            </div>
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="text-center py-2 px-4">
            {/* Hide empty-state messaging when onboarding is expanded to avoid duplicate messaging */}
            {!isOnboardingExpanded && (
              <p className="text-xs text-muted-foreground">
                Ready to capture leads
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {leads.slice(0, 5).map((lead) => {
              const nextFollowUp = getNextFollowUp(lead)
              const status = getLeadStatus(lead)
              const stage = getLeadStage(lead)
              const lastActivity = lead.last_message_at || lead.created_at
              const messagesSent = lead.messages?.filter((m: any) => m.direction === 'outbound').length || 0
              
              return (
                <Link key={lead.id} href={`/dashboard/leads/${lead.id}`} className="block">
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 hover:shadow-md transition-all duration-300 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-foreground text-sm">{formatPhoneNumber(lead.phone_number)}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              status === 'Awaiting Response' 
                                ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/30'
                                : status === 'New'
                                ? 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/30'
                                : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/30'
                            }`}>
                              {status}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {formatRelativeTime(lastActivity)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {lead.voicemail_recordings && lead.voicemail_recordings.length > 0 && (
                          <span className="text-blue-600 dark:text-blue-400">📞</span>
                        )}
                        <button className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                          View
                        </button>
                      </div>
                    </div>
                    
                    {/* Last message preview */}
                    {lead.messages && lead.messages.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                          {lead.messages[lead.messages.length - 1].body}
                        </p>
                      </div>
                    )}
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
