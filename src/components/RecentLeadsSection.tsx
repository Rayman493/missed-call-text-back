'use client'

import { useState, useEffect, useRef } from 'react'
import { formatPhoneNumber, getLeadDisplayName } from '@/lib/utils'
import { createBrowserClient } from '@/lib/supabase/browser'
import DashboardErrorBoundary from './DashboardErrorBoundary'
import Link from 'next/link'

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
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-6">
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
      {/* Recent Leads */}
      <div className="bg-white dark:bg-card border border-slate-200/80 dark:border-border rounded-xl shadow-md hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600/20 dark:from-blue-500/20 dark:to-blue-600/20 rounded-xl flex items-center justify-center border border-blue-200/50 dark:border-blue-800/50 shadow-sm">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">Recent Leads</h2>
              <p className="text-sm text-slate-600 dark:text-muted-foreground">{leads.length} lead{leads.length !== 1 ? 's' : ''} recovered</p>
            </div>
          </div>
        </div>

        {leads.length === 0 ? (
          <div className="text-center py-6 px-4">
            {/* Hide empty-state messaging when onboarding is expanded to avoid duplicate messaging */}
            {!isOnboardingExpanded && (
              <>
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/30 dark:to-blue-800/30 rounded-full flex items-center justify-center shadow-sm">
                    <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
                <h3 className="text-lg font-medium text-slate-900 dark:text-foreground mb-2">
                  {!isOnboardingComplete 
                    ? (provisioningStatus === 'pending' || provisioningStatus === 'failed' 
                      ? 'Start capturing missed callers' 
                      : 'ReplyFlow is almost live')
                    : 'ReplyFlow is live'}
                </h3>
                <p className="text-sm text-slate-600 dark:text-muted-foreground">
                  {!isOnboardingComplete 
                    ? (provisioningStatus === 'pending' || provisioningStatus === 'failed'
                      ? 'Activate your free trial to begin setting up ReplyFlow and automatically text back missed callers.'
                      : 'Run your final test call to activate missed-call monitoring.')
                    : 'Missed callers and customer conversations will appear here automatically.'}
                </p>
                {!isOnboardingComplete && provisioningStatus === 'pending' && (
                  <p className="text-xs text-slate-600 dark:text-muted-foreground mt-2">
                    Your customer leads will appear here after setup is complete.
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {leads.slice(0, 5).map((lead) => (
              <Link key={lead.id} href={`/dashboard/leads/${lead.id}`} className="block">
                <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-muted/50 rounded-lg hover:bg-slate-100 dark:hover:bg-muted/80 hover:border-slate-300 dark:hover:border-border/60 border border-slate-200/80 dark:border-transparent transition-all duration-300 hover:scale-[1.01] cursor-pointer">
                  <div className="flex-1">
                    <p className="font-medium text-slate-900 dark:text-foreground">{getLeadDisplayName(lead)}</p>
                    <p className="text-xs text-slate-600 dark:text-muted-foreground">
                      {lead.last_message_at
                        ? new Date(lead.last_message_at).toLocaleDateString()
                        : new Date(lead.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-muted-foreground">
                    {lead.messages?.length || 0} message{lead.messages?.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardErrorBoundary>
  )
}
