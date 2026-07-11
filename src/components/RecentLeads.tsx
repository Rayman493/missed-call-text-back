'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { formatPhoneNumber, formatRelativeTime, getLeadDisplayName } from '@/lib/utils'
import { Phone, MessageSquare, Clock, AlertCircle, Reply } from 'lucide-react'

interface RecentLeadsProps {
  business: Business | null
}

interface Lead {
  id: string
  caller_phone: string
  status: string
  first_contact_at: string | null
  last_message_at: string | null
  last_reply_at: string | null
  created_at: string
  messages?: Array<{
    direction: 'inbound' | 'outbound'
    body: string
    created_at: string
  }>
}

export default function RecentLeads({ business }: RecentLeadsProps) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchRecentLeads = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Fetch recent leads with their messages
        const { data: leadsData } = await supabase
          .from('leads')
          .select(`
            *,
            messages (
              direction,
              body,
              created_at
            )
          `)
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(5)

        if (leadsData) {
          setLeads(leadsData)
        }
      } catch (error) {
        console.error('Error fetching recent leads:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchRecentLeads()
  }, [business])

  const getLeadStatus = (lead: Lead) => {
    // Check if there are any inbound messages that haven't been replied to
    const inboundMessages = lead.messages?.filter(m => m.direction === 'inbound') || []
    const outboundMessages = lead.messages?.filter(m => m.direction === 'outbound') || []
    
    if (inboundMessages.length === 0) {
      return {
        text: 'Awaiting response',
        color: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        icon: <Clock className="w-4 h-4" />
      }
    }

    // Check if the latest inbound message has been replied to
    const latestInbound = inboundMessages.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]

    const hasRepliedAfterLatestInbound = outboundMessages.some(m => 
      new Date(m.created_at).getTime() > new Date(latestInbound.created_at).getTime()
    )

    if (hasRepliedAfterLatestInbound) {
      return {
        text: 'Conversation active',
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
        icon: <MessageSquare className="w-4 h-4" />
      }
    }

    return {
      text: 'Needs response',
      color: 'text-red-600 dark:text-red-400',
      bgColor: 'bg-red-50 dark:bg-red-900/20',
      icon: <AlertCircle className="w-4 h-4" />
    }
  }

  const getLastActivity = (lead: Lead) => {
    if (lead.last_message_at) {
      return formatRelativeTime(lead.last_message_at)
    }
    if (lead.first_contact_at) {
      return formatRelativeTime(lead.first_contact_at)
    }
    return formatRelativeTime(lead.created_at)
  }

  const getLatestMessage = (lead: Lead) => {
    const messages = lead.messages || []
    if (messages.length === 0) return null

    const latest = messages.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]

    return {
      text: latest.body.substring(0, 80) + (latest.body.length > 80 ? '...' : ''),
      isInbound: latest.direction === 'inbound'
    }
  }

  const getFollowUpStatus = (lead: Lead) => {
    // This would typically come from follow-up jobs data
    // For now, we'll simulate based on lead status and timing
    const lastActivity = lead.last_message_at || lead.first_contact_at || lead.created_at
    const daysSinceLastActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
    
    // Simulate follow-up scheduling logic
    if (daysSinceLastActivity === 0) {
      return {
        text: 'Follow-up scheduled',
        time: 'Tomorrow at 9:00 AM',
        scheduled: true
      }
    } else if (daysSinceLastActivity === 1) {
      return {
        text: 'Follow-up scheduled',
        time: 'Today at 2:00 PM',
        scheduled: true
      }
    } else if (daysSinceLastActivity > 3) {
      return {
        text: 'Follow-up overdue',
        time: 'Should have been sent',
        scheduled: false,
        overdue: true
      }
    }
    
    return {
      text: 'No follow-up',
      time: null,
      scheduled: false
    }
  }

  if (loading) {
    return (
      <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Recent Customers</h3>
          <div className="text-xs text-muted-foreground">Loading...</div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 animate-pulse">
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-foreground">Recent Customers</h3>
        <Link
          href="/dashboard/leads"
          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          View all
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-8">
          <Phone className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No customers yet</p>
          <p className="text-xs text-muted-foreground">
            Your first missed-call customer will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => {
            const status = getLeadStatus(lead)
            const latestMessage = getLatestMessage(lead)
            const followUpStatus = getFollowUpStatus(lead)
            
            return (
              <div
                key={lead.id}
                className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
              >
                {/* Lead Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`font-medium text-foreground ${status.color}`}>
                        {getLeadDisplayName(lead)}
                      </span>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${status.bgColor} ${status.color}`}>
                        {status.icon}
                        {status.text}
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground mb-2">
                      {(() => {
                        const formattedPhone = formatPhoneNumber(lead.caller_phone)
                        return formattedPhone !== 'Unknown Caller' 
                          ? `${formattedPhone} • ${getLastActivity(lead)}`
                          : getLastActivity(lead)
                      })()}
                    </div>
                  </div>
                </div>

                {/* Follow-up Status */}
                <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-2 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {followUpStatus.text}
                      </span>
                    </div>
                    {followUpStatus.time && (
                      <span className={`text-xs ${followUpStatus.overdue ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'}`}>
                        {followUpStatus.time}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Latest Message Preview */}
                {latestMessage && (
                  <div className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                    <div className="flex items-center gap-1 mb-1">
                      {latestMessage.isInbound ? (
                        <Reply className="w-3 h-3" />
                      ) : (
                        <MessageSquare className="w-3 h-3" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {latestMessage.isInbound ? 'Customer' : 'You'}
                      </span>
                    </div>
                    <p className="italic">
                      "{latestMessage.text}"
                    </p>
                  </div>
                )}
                
                {/* Quick Action Button */}
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  className="inline-flex items-center justify-center gap-1 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-xs font-medium"
                >
                  {status.text === 'Needs response' ? 'Open Conversation' : 'View Customer'}
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
