'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import SectionErrorBoundary from './SectionErrorBoundary'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import StatCard from './StatCard'

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
    try {
        // Get start of current month for "This Month" filter
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

        // Fetch leads count (this month)
        const { count: leadsCountData } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('is_demo', false)
          .gte('created_at', startOfMonth)
        setLeadsCount(leadsCountData || 0)

        // Fetch conversations count (this month) - only count conversations with messages
        const { data: conversations } = await supabase
          .from('conversations')
          .select('id, messages(id)')
          .eq('business_id', businessId)
          .gte('created_at', startOfMonth)
        
        const conversationsWithMessages = conversations?.filter((c: any) => 
          c.messages && c.messages.length > 0
        ) || []
        setConversationsCount(conversationsWithMessages.length)

        // Fetch follow-ups count (only pending/scheduled follow-ups, this month)
        const supabaseAny = supabase as any
        const { count: followUpsCountData } = await supabaseAny
          .from('follow_up_jobs')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('status', 'pending')
          .gte('created_at', startOfMonth)
        setFollowUpsCount(followUpsCountData || 0)

        const { count: missedCallsCountData } = await supabase
          .from('call_events')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .gte('created_at', startOfMonth)
        setMissedCallsCount(missedCallsCountData || 0)
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
          fetchStats()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `business_id=eq.${businessId}`
        },
        () => {
          fetchStats()
        }
      )
      .subscribe((status: string) => {
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
          <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-foreground mb-1">
            Business Activity
          </h2>
          <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
            <span>This Month</span>
            <span>•</span>
            <span>See how ReplyFlow is helping your business</span>
          </div>
        </div>

        {/* Operational Status Indicators */}
        {isOnboardingComplete && (
          <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-full border border-green-200 dark:border-green-800/30">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
              Monitoring Active
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800/30">
              Auto-Replies Enabled
            </span>
            {missedCallsCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 dark:bg-muted/30 text-slate-700 dark:text-slate-300 rounded-full border border-slate-200 dark:border-border/50">
                Last Activity: Today
              </span>
            )}
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Missed Calls */}
        <StatCard
          value={missedCallsCount}
          label="Forwarded Missed Calls"
          description={
            missedCallsCount === 0 
              ? (isOnboardingComplete ? 'Forwarded missed calls will appear here' : 'Complete setup to begin forwarding missed calls') 
              : 'Missed calls forwarded to ReplyFlow'
          }
          icon="📞"
          iconColor="amber"
          href="/dashboard/leads"
          isInteractive={true}
        />

        {/* New Leads */}
        <StatCard
          value={leadsCount}
          label="Leads"
          description={
            leadsCount === 0 
              ? (isOnboardingComplete ? 'New opportunities captured by ReplyFlow' : 'Complete setup to begin capturing leads') 
              : 'New opportunities captured'
          }
          icon="👥"
          iconColor="blue"
          href="/dashboard/leads"
          isInteractive={true}
        />

        {/* Conversations */}
        <StatCard
          value={conversationsCount}
          label="Conversations"
          description={conversationsCount === 0 ? 'Customer conversations started automatically' : 'Customer conversations started'}
          icon="💬"
          iconColor="green"
          href="/dashboard/leads"
          isInteractive={true}
        />

        {/* Follow-ups */}
        <StatCard
          value={followUpsCount}
          label="Follow-Ups"
          description={followUpsCount === 0 ? 'Automatic reminders ready to engage' : 'Automatic reminders scheduled'}
          icon="📅"
          iconColor="purple"
          href="/dashboard/leads"
          isInteractive={true}
        />
      </div>
      </div>
    </SectionErrorBoundary>
  )
}
