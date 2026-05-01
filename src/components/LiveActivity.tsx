'use client'

import { useState } from 'react'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import { Phone, MessageCircle, Clock, ArrowRight } from 'lucide-react'

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

interface FollowUpJob {
  id: string
  status: string
  created_at: string
}

interface LiveActivityProps {
  leads: Lead[]
  followUpJobs: FollowUpJob[]
  missedCalls: number
}

export default function LiveActivity({ leads, followUpJobs, missedCalls }: LiveActivityProps) {
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
    if (!phone) return 'Unknown'
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
      return 'Follow-up scheduled'
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
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <Phone className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h3 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-3">
            No missed calls yet
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            When customers miss your calls, activity will appear here automatically.
          </p>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Test Your Setup
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Live Activity
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Recent missed calls and customer conversations
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('recent')}
              className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                activeTab === 'recent'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              Recent
            </button>
            <button
              onClick={() => setActiveTab('responses')}
              className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors relative ${
                activeTab === 'responses'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
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
      <div className="p-4 sm:p-6">
        {activeTab === 'recent' && (
          <div className="space-y-4">
            {recentActivity.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-600 dark:text-gray-400">
                  No recent activity to show
                </p>
              </div>
            ) : (
              recentActivity.map((item, index) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      {item.status === 'new' ? (
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                          <Phone className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                          <MessageCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {getActivityText(item)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {getActivityTime(item)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Link
                      href={`/dashboard/leads/${item.id}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                    >
                      View
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'responses' && (
          <div className="space-y-4">
            {leadsNeedingResponse.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-600 dark:text-gray-400">
                  No responses needed right now
                </p>
              </div>
            ) : (
              leadsNeedingResponse.map((lead, index) => (
                <div
                  key={lead.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                        <MessageCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        Reply from {formatLeadPhone(lead.caller_phone)}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatRelativeTime(lead.last_message_at || lead.first_contact_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                    >
                      Respond
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {/* View All Link */}
        {leads.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <Link
              href="/dashboard/leads"
              className="block text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
            >
              View All Leads
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
