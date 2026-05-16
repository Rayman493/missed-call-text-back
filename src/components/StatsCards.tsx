'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import SectionErrorBoundary from './SectionErrorBoundary'

interface StatsCardsProps {
  businessId: string
}

export default function StatsCards({ businessId }: StatsCardsProps) {
  // ALL hooks must be called at the top before any conditional returns
  const [leadsCount, setLeadsCount] = useState(0)
  const [conversationsCount, setConversationsCount] = useState(0)
  const [followUpsCount, setFollowUpsCount] = useState(0)
  const [missedCallsCount, setMissedCallsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const supabase = createBrowserClient()

  // Fetch stats from Supabase
  const fetchStats = async () => {
    if (!businessId) return

    if (!loading) {
      setRefreshing(true)
    }
    console.log('[StatsCards] Starting stats fetch', { businessId })
    try {
        // Fetch leads count
        const { count: leadsCountData } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_demo', false)
        setLeadsCount(leadsCountData || 0)

        // Fetch conversations count
        const { count: conversationsCountData } = await supabase
          .from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        setConversationsCount(conversationsCountData || 0)

        // Fetch follow-ups count
        const supabaseAny = supabase as any
        const { count: followUpsCountData } = await supabaseAny
          .from('follow_up_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        setFollowUpsCount(followUpsCountData || 0)

        // Fetch call events count for missed calls
        const { count: callEventsCountData } = await supabase
          .from('call_events')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
        setMissedCallsCount(callEventsCountData || 0)

        console.log('[StatsCards] Success', { leadsCount: leadsCountData, conversationsCount: conversationsCountData, followUpsCount: followUpsCountData, missedCallsCount: callEventsCountData })
      } catch (error) {
        console.error('[StatsCards] Error fetching stats:', error)
        // Keep safe defaults of 0
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
  }

  // Initial fetch
  useEffect(() => {
    fetchStats()
  }, [businessId, supabase])

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border border-border rounded-2xl shadow-sm p-3 sm:p-4">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded mb-2 w-20"></div>
              <div className="h-8 bg-muted rounded w-16"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <SectionErrorBoundary sectionName="StatsCardsData">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">Dashboard Stats</span>
          {refreshing && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          )}
        </div>
        <button
          onClick={fetchStats}
          disabled={loading || refreshing}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {/* Missed Calls */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 bg-muted rounded-lg flex items-center justify-center text-lg shadow-sm">📞</span>
            <h3 className="text-xs font-medium text-muted-foreground">Missed Calls</h3>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-foreground mb-0.5">{missedCallsCount}</p>
          <p className="text-[11px] text-muted-foreground">{missedCallsCount === 0 ? 'Waiting for first call' : 'Total calls'}</p>
        </div>

        {/* New Leads */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 bg-blue-900/20 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">👥</span>
            <h3 className="text-xs font-medium text-muted-foreground">New Leads</h3>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-blue-500 dark:text-blue-100 mb-0.5">{leadsCount}</p>
          <p className="text-[11px] text-muted-foreground">{leadsCount === 0 ? 'Ready to capture leads' : 'Leads recovered'}</p>
        </div>

        {/* Conversations */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 bg-green-900/20 dark:bg-green-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">💬</span>
            <h3 className="text-xs font-medium text-muted-foreground">Conversations</h3>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-green-500 dark:text-green-100 mb-0.5">{conversationsCount}</p>
          <p className="text-[11px] text-muted-foreground">{conversationsCount === 0 ? 'No conversations yet' : 'Active conversations'}</p>
        </div>

        {/* Follow-ups */}
        <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-8 h-8 bg-purple-900/20 dark:bg-purple-900/20 rounded-lg flex items-center justify-center text-lg shadow-sm">📅</span>
            <h3 className="text-xs font-medium text-muted-foreground">Follow-ups</h3>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-purple-500 dark:text-purple-100 mb-0.5">{followUpsCount}</p>
          <p className="text-[11px] text-muted-foreground">{followUpsCount === 0 ? 'None scheduled' : 'Scheduled'}</p>
        </div>
      </div>
    </SectionErrorBoundary>
  )
}
