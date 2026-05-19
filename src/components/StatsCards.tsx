'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import SectionErrorBoundary from './SectionErrorBoundary'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface StatsCardsProps {
  businessId: string
  isOnboardingComplete?: boolean
  provisioningStatus?: string
  forwardingVerified?: boolean
}

export default function StatsCards({ businessId, isOnboardingComplete = false, provisioningStatus = 'pending', forwardingVerified = false }: StatsCardsProps) {
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
      <div className="mb-4 sm:mb-6">
        {/* Section Heading with Description */}
        <div className="mb-3 sm:mb-4">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground mb-1">
            Business Activity
          </h2>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <span>This Month</span>
            <span>•</span>
            <span>See how ReplyFlow is helping your business</span>
          </div>
        </div>

        {/* Operational Status Indicators */}
        {isOnboardingComplete && (
          <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full border border-green-200 dark:border-green-800/30">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Monitoring Active
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800/30">
              Auto-Replies Enabled
            </span>
            {missedCallsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-muted-foreground rounded-full border border-slate-200 dark:border-border/50">
                Last Activity: Today
              </span>
            )}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Missed Calls */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200/70 dark:border-border/40 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-border/60 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-600/30 dark:from-amber-500/30 dark:to-amber-600/30 rounded-xl flex items-center justify-center text-xl shadow-sm border border-amber-200/50 dark:border-amber-800/50 group-hover:scale-105 transition-all duration-300">📞</span>
              <h3 className="text-xs font-bold text-slate-800 dark:text-muted-foreground/90 group-hover:text-slate-900 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Missed Calls Recovered</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-amber-600 dark:text-amber-400 mb-2 tracking-tight">{missedCallsCount}</p>
            <p className="text-xs text-slate-600 dark:text-muted-foreground/80">
              {missedCallsCount === 0 
                ? (isOnboardingComplete ? 'Customers automatically contacted after missed calls' : 'Complete setup to begin capturing missed calls') 
                : 'Customers automatically contacted'}
            </p>
          </div>
        </Link>

        {/* New Leads */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200/70 dark:border-border/40 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-border/60 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600/30 dark:from-blue-500/30 dark:to-blue-600/30 rounded-xl flex items-center justify-center text-xl shadow-sm border border-blue-200/50 dark:border-blue-800/50 group-hover:scale-105 transition-all duration-300">👥</span>
              <h3 className="text-xs font-bold text-slate-800 dark:text-muted-foreground/90 group-hover:text-slate-900 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Leads Captured</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-blue-600 dark:text-blue-400 mb-2 tracking-tight">{leadsCount}</p>
            <p className="text-xs text-slate-600 dark:text-muted-foreground/80">
              {leadsCount === 0 
                ? (isOnboardingComplete ? 'New opportunities captured by ReplyFlow' : 'Complete setup to begin capturing leads') 
                : 'New opportunities captured'}
            </p>
          </div>
        </Link>

        {/* Conversations */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200/70 dark:border-border/40 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-border/60 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600/30 dark:from-green-500/30 dark:to-green-600/30 rounded-xl flex items-center justify-center text-xl shadow-sm border border-green-200/50 dark:border-green-800/50 group-hover:scale-105 transition-all duration-300">💬</span>
              <h3 className="text-xs font-bold text-slate-800 dark:text-muted-foreground/90 group-hover:text-slate-900 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Customer Replies</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-green-600 dark:text-green-400 mb-2 tracking-tight">{conversationsCount}</p>
            <p className="text-xs text-slate-600 dark:text-muted-foreground/80">{conversationsCount === 0 ? 'Customer conversations started automatically' : 'Customer conversations started'}</p>
          </div>
        </Link>

        {/* Follow-ups */}
        <Link href="/dashboard/leads" className="group">
          <div className="bg-white dark:bg-card border border-slate-200/70 dark:border-border/40 rounded-2xl shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-border/60 transition-all duration-300 hover:-translate-y-0.5 p-3 sm:p-4 cursor-pointer h-full">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600/30 dark:from-purple-500/30 dark:to-purple-600/30 rounded-xl flex items-center justify-center text-xl shadow-sm border border-purple-200/50 dark:border-purple-800/50 group-hover:scale-105 transition-all duration-300">📅</span>
              <h3 className="text-xs font-bold text-slate-800 dark:text-muted-foreground/90 group-hover:text-slate-900 dark:group-hover:text-foreground transition-colors uppercase tracking-wide">Automatic Check-ins Scheduled</h3>
            </div>
            <p className="text-5xl sm:text-6xl font-extrabold text-purple-600 dark:text-purple-400 mb-2 tracking-tight">{followUpsCount}</p>
            <p className="text-xs text-slate-600 dark:text-muted-foreground/80">{followUpsCount === 0 ? 'Automatic reminders ready to engage' : 'Automatic reminders scheduled'}</p>
          </div>
        </Link>
      </div>
      </div>
    </SectionErrorBoundary>
  )
}
