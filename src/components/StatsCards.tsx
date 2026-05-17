'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import SectionErrorBoundary from './SectionErrorBoundary'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface StatsCardsProps {
  businessId: string
}

export default function StatsCards({ businessId }: StatsCardsProps) {
  // ALL hooks must be called at the top before any conditional returns
  const router = useRouter()
  const [leadsCount, setLeadsCount] = useState(0)
  const [conversationsCount, setConversationsCount] = useState(0)
  const [followUpsCount, setFollowUpsCount] = useState(0)
  const [missedCallsCount, setMissedCallsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [realtimeConnected, setRealtimeConnected] = useState(true)
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

  // Realtime subscription for live updates
  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel('stats-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          console.log('[StatsCards] Realtime: leads changed, refreshing')
          fetchStats()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          console.log('[StatsCards] Realtime: conversations changed, refreshing')
          fetchStats()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follow_up_jobs',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          console.log('[StatsCards] Realtime: follow_up_jobs changed, refreshing')
          fetchStats()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_events',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          console.log('[StatsCards] Realtime: call_events changed, refreshing')
          fetchStats()
        }
      )
      .subscribe((status: string) => {
        console.log('[StatsCards] Realtime subscription status:', status)
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true)
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeConnected(false)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></div>
            <span className="text-xs font-medium text-muted-foreground">
              {realtimeConnected ? 'Live' : 'Reconnecting...'}
            </span>
          </div>
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
        {/* Captured Calls */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-border/80 transition-all hover:-translate-y-0.5 p-4 sm:p-5 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 bg-muted rounded-lg flex items-center justify-center text-xl shadow-sm group-hover:bg-muted/80 transition-colors">📞</span>
              <h3 className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Captured Calls</h3>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-foreground mb-1">{missedCallsCount}</p>
            <p className="text-xs text-muted-foreground">{missedCallsCount === 0 ? 'Waiting for first call' : 'Total captured'}</p>
          </div>
        </Link>

        {/* New Leads */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-border/80 transition-all hover:-translate-y-0.5 p-4 sm:p-5 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 bg-blue-900/20 dark:bg-blue-900/20 rounded-lg flex items-center justify-center text-xl shadow-sm group-hover:bg-blue-900/30 transition-colors">👥</span>
              <h3 className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">New Leads</h3>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-blue-500 dark:text-blue-100 mb-1">{leadsCount}</p>
            <p className="text-xs text-muted-foreground">{leadsCount === 0 ? 'Ready to capture leads' : 'Leads recovered'}</p>
          </div>
        </Link>

        {/* Conversations */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-border/80 transition-all hover:-translate-y-0.5 p-4 sm:p-5 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 bg-green-900/20 dark:bg-green-900/20 rounded-lg flex items-center justify-center text-xl shadow-sm group-hover:bg-green-900/30 transition-colors">💬</span>
              <h3 className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Conversations</h3>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-green-500 dark:text-green-100 mb-1">{conversationsCount}</p>
            <p className="text-xs text-muted-foreground">{conversationsCount === 0 ? 'No conversations yet' : 'Active conversations'}</p>
          </div>
        </Link>

        {/* Follow-ups */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-md hover:border-border/80 transition-all hover:-translate-y-0.5 p-4 sm:p-5 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-9 h-9 bg-purple-900/20 dark:bg-purple-900/20 rounded-lg flex items-center justify-center text-xl shadow-sm group-hover:bg-purple-900/30 transition-colors">📅</span>
              <h3 className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">Follow-ups</h3>
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-purple-500 dark:text-purple-100 mb-1">{followUpsCount}</p>
            <p className="text-xs text-muted-foreground">{followUpsCount === 0 ? 'None scheduled' : 'Scheduled'}</p>
          </div>
        </Link>
      </div>
    </SectionErrorBoundary>
  )
}
