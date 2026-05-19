'use client'

import { useState } from 'react'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import { Phone, MessageCircle, Clock, ArrowRight } from 'lucide-react'
import { FollowUpJob } from '@/lib/types'

interface Lead {
  id: string
  caller_phone: string
  status: string
  first_contact_at: string
  last_message_at?: string
  messages?: Array<{
    direction: 'inbound' | 'outbound'
    content: string
    created_at: string
  }>
}

interface LiveActivityProps {
  leads?: Lead[]
  followUpJobs?: FollowUpJob[]
  missedCalls?: number
  isOnboardingComplete?: boolean
  provisioningStatus?: string
  forwardingVerified?: boolean
}

export default function LiveActivity({ leads = [], followUpJobs = [], missedCalls = 0, isOnboardingComplete = false, provisioningStatus = 'pending', forwardingVerified = false }: LiveActivityProps) {
  const [activeTab, setActiveTab] = useState<'recent' | 'responses'>('recent')

  // Get recent activity (missed calls and new leads)
  const recentActivity = leads
    .filter(lead => lead.status === 'new' || (lead.messages && lead.messages.some(m => m.direction === 'inbound')))
    .slice(0, 5)

  // Get leads needing response
  const leadsNeedingResponse = leads.filter(lead => {
    if (!lead.messages) return false
    const hasInbound = lead.messages.some(m => m.direction === 'inbound')
    const hasOutboundAfterInbound = lead.messages.some(m => {
      if (m.direction !== 'outbound') return false
      const inboundMessages = lead.messages?.filter(msg => msg.direction === 'inbound')
      if (!inboundMessages || inboundMessages.length === 0) return false
      return new Date(m.created_at) > new Date(inboundMessages[0].created_at)
    })
    return hasInbound && !hasOutboundAfterInbound
  })

  const formatLeadPhone = (phone: string) => {
    if (!phone) return 'Recent caller'
    if (phone.length === 10) {
      return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`
    }
    return phone
  }

  const getActivityIcon = (item: Lead | FollowUpJob) => {
    if ('caller_phone' in item) {
      // It's a lead
      if (item.status === 'new') {
        return <Phone className="w-5 h-5" />
      }
      return <MessageCircle className="w-5 h-5" />
    } else {
      // It's a follow-up job
      return <Clock className="w-5 h-5" />
    }
  }

  const getActivityText = (item: Lead | FollowUpJob) => {
    if ('caller_phone' in item) {
      // It's a lead
      if (item.status === 'new') {
        return `Missed call from ${formatLeadPhone(item.caller_phone)}`
      }
      const lastMessage = item.messages?.[item.messages.length - 1]
      if (lastMessage?.direction === 'inbound') {
        return `Reply from ${formatLeadPhone(item.caller_phone)}`
      }
      return `Conversation with ${formatLeadPhone(item.caller_phone)}`
    } else {
      // It's a follow-up job
      return 'Automatic check-in scheduled'
    }
  }

  const getActivityTime = (item: Lead | FollowUpJob) => {
    if ('caller_phone' in item) {
      // It's a lead
      return formatRelativeTime(item.last_message_at || item.first_contact_at)
    } else {
      // It's a follow-up job
      return formatRelativeTime(item.created_at)
    }
  }

  if (leads.length === 0 && missedCalls === 0) {
    // Determine the appropriate message based on activation state
    let title = ''
    let description = ''

    if (!isOnboardingComplete) {
      // Not fully set up yet - keep it simple, Setup Progress handles detailed messaging
      title = 'Final verification pending'
      description = 'Complete your missed-call test to activate live monitoring.'
    } else {
      // Fully active
      title = 'Monitoring your business line'
      description = 'Auto-replies are active. ReplyFlow is ready to capture missed callers.'
    }

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200/80 dark:border-slate-700 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isOnboardingComplete ? 'bg-green-500 animate-pulse shadow-sm shadow-green-500/50' : 'bg-amber-500 shadow-sm'}`}></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 border border-slate-200/70 dark:border-slate-700">
      {/* Header */}
      <div className="p-3.5 sm:p-5 border-b border-slate-200/70 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-sm shadow-green-500/50"></div>
              <span className="text-[10px] sm:text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">Live</span>
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white">
                Live Activity
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Recent missed calls and customer conversations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('recent')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 ${
                activeTab === 'recent'
                  ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setActiveTab('responses')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold rounded-lg transition-all duration-200 relative ${
                activeTab === 'responses'
                  ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              Needs Response
              {leadsNeedingResponse.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {leadsNeedingResponse.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3.5 sm:p-6">
        {activeTab === 'recent' && (
          <div className="space-y-3 sm:space-y-4">
            {recentActivity.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">
                  No recent activity to show
                </p>
              </div>
            ) : (
              recentActivity.map((item, index) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      {item.status === 'new' ? (
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-orange-900/30 rounded-full flex items-center justify-center">
                          <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-900/30 rounded-full flex items-center justify-center">
                          <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {getActivityText(item)}
                      </p>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                        {getActivityTime(item)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Link
                      href={`/dashboard/leads/${item.id}`}
                      className="inline-flex items-center px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      View
                      <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'responses' && (
          <div className="space-y-3 sm:space-y-4">
            {leadsNeedingResponse.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-400 text-sm">
                  No responses needed right now
                </p>
              </div>
            ) : (
              leadsNeedingResponse.map((lead, index) => (
                <div
                  key={lead.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 p-3 sm:p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-900/30 rounded-full flex items-center justify-center">
                        <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        Reply from {formatLeadPhone(lead.caller_phone)}
                      </p>
                      <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-400">
                        {formatRelativeTime(lead.last_message_at || lead.first_contact_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="inline-flex items-center px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
                    >
                      Respond
                      <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-1" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {/* View All Link */}
        {leads.length > 0 && (
          <div className="mt-5 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-700">
            <Link
              href="/dashboard/leads"
              className="block text-center text-xs sm:text-sm text-blue-400 hover:text-blue-300 font-medium"
            >
              View All Leads
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
