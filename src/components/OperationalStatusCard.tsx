'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { formatPhoneNumber, formatRelativeTime } from '@/lib/utils'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'

interface OperationalStatusCardProps {
  business: Business | null
  missedCallCount?: number
  lastActivity?: string
  onReviewSetup?: () => void
}

interface ActivityData {
  missedCallsProcessed: number
  leadsCreated: number
  smsSent: number
  followUpsScheduled: number
  lastActivity: string | null
}

export default function OperationalStatusCard({ 
  business, 
  missedCallCount = 0, 
  lastActivity,
  onReviewSetup 
}: OperationalStatusCardProps) {
  const [activityData, setActivityData] = useState<ActivityData>({
    missedCallsProcessed: missedCallCount,
    leadsCreated: 0,
    smsSent: 0,
    followUpsScheduled: 0,
    lastActivity: lastActivity || null
  })
  const [loading, setLoading] = useState(true)

  // Fetch recent activity data
  useEffect(() => {
    const fetchActivityData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Get recent activity from the last 30 days
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        
        // Fetch leads created in last 30 days
        const { data: recentLeads } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        // Fetch messages sent in last 30 days
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('created_at, direction')
          .eq('from_phone', business.twilio_phone_number || '')
          .gte('created_at', thirtyDaysAgo)

        // Fetch follow-up jobs scheduled in last 30 days
        const { data: recentFollowUps } = await supabase
          .from('follow_up_jobs')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', thirtyDaysAgo)

        setActivityData({
          missedCallsProcessed: missedCallCount,
          leadsCreated: recentLeads?.length || 0,
          smsSent: recentMessages?.filter((m: any) => m.direction === 'outbound').length || 0,
          followUpsScheduled: recentFollowUps?.length || 0,
          lastActivity: lastActivity || null
        })
      } catch (error) {
        console.error('Error fetching activity data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchActivityData()
  }, [business, missedCallCount, lastActivity])

  const getStatusIndicator = (status: 'active' | 'inactive' | 'warning') => {
    const colors = {
      active: 'bg-green-500',
      inactive: 'bg-gray-400',
      warning: 'bg-amber-500'
    }
    return (
      <div className={`w-2 h-2 ${colors[status]} rounded-full ${status === 'active' ? 'animate-pulse' : ''}`}></div>
    )
  }

  const getStatusText = (status: 'active' | 'inactive' | 'warning') => {
    const texts = {
      active: 'Active',
      inactive: 'Inactive',
      warning: 'Warning'
    }
    return texts[status]
  }

  const isMonitoringActive = business?.setup_status === 'working'
  const isForwardingActive = business?.call_forwarding_enabled === true
  const isTextReplyActive = business?.messaging_status === 'active'

  return (
    <div className="bg-card dark:bg-slate-900/60 backdrop-blur-sm border border-border rounded-xl p-4 sm:p-5 hover:shadow-lg transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {getStatusIndicator(isMonitoringActive ? 'active' : 'warning')}
          <div>
            <h3 className="text-lg font-semibold text-foreground">Operational Status</h3>
            <p className="text-sm text-muted-foreground">
              {isMonitoringActive ? 'ReplyFlow is actively monitoring' : 'Setup required'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {activityData.lastActivity && (
            <span>Last activity: {formatRelativeTime(activityData.lastActivity)}</span>
          )}
        </div>
      </div>

      {/* Status Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
        {/* Business Phone */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Business Phone</span>
          </div>
          <div className="text-sm font-mono text-slate-900 dark:text-slate-100">
            {business?.business_phone_number ? formatPhoneNumber(business.business_phone_number) : 'Not set'}
          </div>
        </div>

        {/* ReplyFlow Number */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">ReplyFlow Number</span>
          </div>
          <div className="text-sm font-mono text-slate-900 dark:text-slate-100">
            {business?.twilio_phone_number ? formatPhoneNumber(business.twilio_phone_number) : 'Not assigned'}
          </div>
        </div>

        {/* Monitoring Status */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIndicator(isMonitoringActive ? 'active' : 'warning')}
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Monitoring</span>
          </div>
          <div className="text-sm text-slate-900 dark:text-slate-100">
            {getStatusText(isMonitoringActive ? 'active' : 'warning')}
          </div>
        </div>

        {/* Text Reply Status */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            {getStatusIndicator(isTextReplyActive ? 'active' : 'inactive')}
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">Text Replies</span>
          </div>
          <div className="text-sm text-slate-900 dark:text-slate-100">
            {getStatusText(isTextReplyActive ? 'active' : 'inactive')}
          </div>
        </div>
      </div>

      {/* Forwarding Status */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIndicator(isForwardingActive ? 'active' : 'warning')}
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Call Forwarding</span>
          </div>
          <div className="text-sm text-slate-900 dark:text-slate-100">
            {getStatusText(isForwardingActive ? 'active' : 'warning')}
          </div>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 mb-4">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Recent Activity (30 days)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {loading ? '...' : activityData.missedCallsProcessed}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Calls Processed</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {loading ? '...' : activityData.leadsCreated}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Leads Created</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {loading ? '...' : activityData.smsSent}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">SMS Sent</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {loading ? '...' : activityData.followUpsScheduled}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400">Follow-ups</div>
          </div>
        </div>
      </div>

      {/* Primary Actions */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <Link
          href="/dashboard/test-setup"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Test ReplyFlow
        </Link>
        
        <button
          onClick={onReviewSetup}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 rounded-lg transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Review Setup
        </button>
      </div>
    </div>
  )
}
