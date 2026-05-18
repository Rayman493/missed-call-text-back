'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import SectionErrorBoundary from '@/components/SectionErrorBoundary'

interface BusinessActivityProps {
  businessId: string
  isOnboardingComplete?: boolean
  provisioningStatus?: string
  forwardingVerified?: boolean
}

interface BusinessMetrics {
  missedCallsRecovered: number
  leadsCaptured: number
  autoRepliesSent: number
  conversationsStarted: number
  responseRate: number
  lastActivityTime: string | null
}

export default function BusinessActivity({ 
  businessId, 
  isOnboardingComplete = false,
  provisioningStatus = 'pending',
  forwardingVerified = false
}: BusinessActivityProps) {
  const { business } = useBusiness()
  const [metrics, setMetrics] = useState<BusinessMetrics>({
    missedCallsRecovered: 0,
    leadsCaptured: 0,
    autoRepliesSent: 0,
    conversationsStarted: 0,
    responseRate: 0,
    lastActivityTime: null
  })
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()

  useEffect(() => {
    const fetchMetrics = async () => {
      if (!businessId) return

      try {
        setLoading(true)

        // Get current month start date
        const now = new Date()
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        // Fetch leads for this month (exclude demo leads)
        const { data: leads, error: leadsError } = await supabase
          .from('leads')
          .select('*')
          .eq('business_id', businessId)
          .eq('is_demo', false)
          .gte('created_at', monthStart)

        if (leadsError) throw leadsError

        // Fetch messages for this month
        const { data: messages, error: messagesError } = await supabase
          .from('messages')
          .select('*')
          .in('lead_id', leads?.map((l: any) => l.id) || [])
          .gte('created_at', monthStart)

        if (messagesError) throw messagesError

        // Calculate metrics
        const missedCallsRecovered = leads?.length || 0
        const leadsCaptured = leads?.filter((l: any) => l.status !== 'ignored').length || 0
        const autoRepliesSent = messages?.filter((m: any) => m.direction === 'outbound' && m.status === 'sent').length || 0
        const conversationsStarted = leads?.filter((l: any) => l.last_reply_at !== null).length || 0
        const responseRate = leadsCaptured > 0 ? (conversationsStarted / leadsCaptured) * 100 : 0

        // Get last activity time
        const lastActivity = leads?.length > 0 
          ? leads.reduce((latest: any, lead: any) => {
            const leadTime = new Date(lead.last_message_at || lead.created_at).getTime()
            const latestTime = new Date(latest.last_message_at || latest.created_at).getTime()
            return leadTime > latestTime ? lead : latest
          })
          : null

        setMetrics({
          missedCallsRecovered,
          leadsCaptured,
          autoRepliesSent,
          conversationsStarted,
          responseRate,
          lastActivityTime: lastActivity?.last_message_at || lastActivity?.created_at || null
        })
      } catch (error) {
        console.error('Error fetching business activity metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMetrics()
  }, [businessId, supabase])

  // Calculate time ago
  const getTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return null
    
    const now = new Date()
    const then = new Date(timestamp)
    const diffMs = now.getTime() - then.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return 'Recently'
  }

  // Only show if onboarding is complete and we have some activity
  const shouldShow = isOnboardingComplete && (metrics.missedCallsRecovered > 0 || metrics.autoRepliesSent > 0)

  if (!shouldShow || loading) {
    return null
  }

  return (
    <SectionErrorBoundary sectionName="BusinessActivity">
      <div className="mb-4 sm:mb-6">
        {/* Section Heading */}
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-foreground">
            Business Activity
          </h2>
          <span className="text-xs text-muted-foreground">• This Month</span>
        </div>

        {/* Operational Status Indicators */}
        {(provisioningStatus === 'active' || forwardingVerified) && (
          <div className="flex items-center gap-2 mb-3 sm:mb-4 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            <span>
              {provisioningStatus === 'active' && 'ReplyFlow is monitoring your business line'}
              {provisioningStatus === 'active' && forwardingVerified && ' • '}
              {forwardingVerified && 'Forwarding connected'}
            </span>
            {metrics.lastActivityTime && (
              <>
                <span>•</span>
                <span>Last activity: {getTimeAgo(metrics.lastActivityTime)}</span>
              </>
            )}
          </div>
        )}

        {/* Business Activity Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {/* Missed Calls Recovered */}
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm hover:shadow-md transition-shadow p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg sm:text-xl">📞</span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide">
                Missed Calls Recovered
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight mb-1">
              {metrics.missedCallsRecovered}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/60">
              Customers automatically contacted after missed calls
            </p>
          </div>

          {/* Leads Captured */}
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm hover:shadow-md transition-shadow p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg sm:text-xl">👥</span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide">
                Leads Captured
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-green-600 dark:text-green-400 tracking-tight mb-1">
              {metrics.leadsCaptured}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/60">
              New opportunities captured by ReplyFlow
            </p>
          </div>

          {/* Customer Replies */}
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm hover:shadow-md transition-shadow p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg sm:text-xl">💬</span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide">
                Customer Replies
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-purple-600 dark:text-purple-400 tracking-tight mb-1">
              {metrics.autoRepliesSent}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/60">
              Customers continued the conversation
            </p>
          </div>

          {/* Follow-Ups Scheduled */}
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-sm hover:shadow-md transition-shadow p-2.5 sm:p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg sm:text-xl">💡</span>
              <span className="text-[10px] sm:text-xs font-semibold text-slate-600 dark:text-muted-foreground/70 uppercase tracking-wide">
                Follow-Ups Scheduled
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight mb-1">
              {metrics.conversationsStarted}
            </p>
            <p className="text-[10px] sm:text-xs text-slate-500 dark:text-muted-foreground/60">
              {metrics.responseRate > 0 ? `${Math.round(metrics.responseRate)}% response rate` : 'Active conversations'}
            </p>
          </div>
        </div>
      </div>
    </SectionErrorBoundary>
  )
}
