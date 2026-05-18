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
            <div className={`w-2 h-2 rounded-full ${realtimeConnected ? 'bg-green-500 animate-pulse shadow-sm' : 'bg-amber-500 shadow-sm'}`}></div>
            <span className="text-xs font-medium text-slate-600 dark:text-muted-foreground">
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
          className="text-xs text-slate-600 dark:text-muted-foreground hover:text-slate-800 dark:hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded-md"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Missed Calls */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-md hover:shadow-lg hover:border-slate-300 dark:hover:border-border/100 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600/20 dark:from-amber-500/20 dark:to-amber-600/20 rounded-xl flex items-center justify-center text-xl shadow-sm border border-amber-200/50 dark:border-amber-800/50 group-hover:scale-105 transition-all duration-300">📞</span>
              <h3 className="text-xs font-bold text-slate-600 dark:text-muted-foreground/80 group-hover:text-slate-800 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Captured</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-amber-600 dark:text-amber-400 mb-2 tracking-tight">{missedCallsCount}</p>
            <p className="text-xs text-slate-500 dark:text-muted-foreground/70">{missedCallsCount === 0 ? 'Ready to capture missed calls' : 'Total captured'}</p>
          </div>
        </Link>

        {/* New Leads */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-md hover:shadow-lg hover:border-slate-300 dark:hover:border-border/100 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600/20 dark:from-blue-500/20 dark:to-blue-600/20 rounded-xl flex items-center justify-center text-xl shadow-sm border border-blue-200/50 dark:border-blue-800/50 group-hover:scale-105 transition-all duration-300">👥</span>
              <h3 className="text-xs font-bold text-slate-600 dark:text-muted-foreground/80 group-hover:text-slate-800 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Leads</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-blue-600 dark:text-blue-400 mb-2 tracking-tight">{leadsCount}</p>
            <p className="text-xs text-slate-500 dark:text-muted-foreground/70">{leadsCount === 0 ? 'Ready to capture leads' : 'Leads recovered'}</p>
          </div>
        </Link>

        {/* Conversations */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-md hover:shadow-lg hover:border-slate-300 dark:hover:border-border/100 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600/20 dark:from-green-500/20 dark:to-green-600/20 rounded-xl flex items-center justify-center text-xl shadow-sm border border-green-200/50 dark:border-green-800/50 group-hover:scale-105 transition-all duration-300">💬</span>
              <h3 className="text-xs font-bold text-slate-600 dark:text-muted-foreground/80 group-hover:text-slate-800 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Replies</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-green-600 dark:text-green-400 mb-2 tracking-tight">{conversationsCount}</p>
            <p className="text-xs text-slate-500 dark:text-muted-foreground/70">{conversationsCount === 0 ? 'No customer replies yet' : 'Active conversations'}</p>
          </div>
        </Link>

        {/* Follow-ups */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border/60 rounded-xl shadow-md hover:shadow-lg hover:border-slate-300 dark:hover:border-border/100 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600/20 dark:from-purple-500/20 dark:to-purple-600/20 rounded-xl flex items-center justify-center text-xl shadow-sm border border-purple-200/50 dark:border-purple-800/50 group-hover:scale-105 transition-all duration-300">📅</span>
              <h3 className="text-xs font-bold text-slate-600 dark:text-muted-foreground/80 group-hover:text-slate-800 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Follow-ups</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-purple-600 dark:text-purple-400 mb-2 tracking-tight">{followUpsCount}</p>
            <p className="text-xs text-slate-500 dark:text-muted-foreground/70">{followUpsCount === 0 ? 'No follow-ups scheduled' : 'Scheduled'}</p>
          </div>
        </Link>
      </div>
    </SectionErrorBoundary>
  )
}
