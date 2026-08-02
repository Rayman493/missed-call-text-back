'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import { Users, MessageSquareReply, CheckSquare, Calendar, DollarSign, CreditCard, Loader2, AlertCircle } from 'lucide-react'
import MetricCard from '@/components/MetricCard'

interface DashboardMetricsProps {
  business: Business | null
}

interface QuickLookMetric {
  id: string
  label: string
  value: number
  icon: React.ElementType
  color: string
  bgColor: string
  href?: string
  description?: string
}

export default function DashboardMetrics({ business }: DashboardMetricsProps) {
  const router = useRouter()
  const [metrics, setMetrics] = useState<QuickLookMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchMetrics = useCallback(async () => {
    if (!business) return

    setLoading(true)
    setError(false)
    try {
      const supabase = createBrowserClient()
      
      // Time windows - using client timezone
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const todayStartISO = todayStart.toISOString()
      const todayStr = todayStart.toLocaleDateString('en-CA') // YYYY-MM-DD
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Fetch all business leads once for use in joins (N+1 prevention)
      const { data: allBusinessLeads, error: leadsError } = await supabase
        .from('leads')
        .select('id, created_at, raw_metadata, status, deleted_at')
        .eq('business_id', business.id)
        .is('deleted_at', null)
        .neq('status', 'ignored')

      if (leadsError) {
        console.error('[DashboardMetrics] Error fetching leads:', leadsError)
        throw new Error('Failed to fetch business leads')
      }

      const allLeadIds = allBusinessLeads?.map((l: any) => l.id) || []

      // Metric 1: New Inquiries Today
      // Definition: Leads created today via missed calls (AI intake), excluding manual entries
      // Source: leads table
      // Filter: business_id, created_at >= today_start, status != 'ignored', source not in ['manual_entry', 'manual_backfill']
      // Renamed from "New Customers" to "New Inquiries" to accurately reflect exclusion of manual entries
      const newInquiriesCount = allBusinessLeads?.filter((l: any) => {
        const createdAt = new Date(l.created_at)
        const isToday = createdAt >= todayStart
        const isManual = l.raw_metadata?.source === 'manual_entry' || l.raw_metadata?.source === 'manual_backfill'
        return isToday && !isManual
      }).length || 0

      // Metric 2: Tasks Due Today
      // Definition: Tasks with due_date = today and completed = false
      // Source: tasks table
      // Filter: business_id, due_date = today (YYYY-MM-DD), completed = false
      // Timezone: Client timezone (toLocaleDateString 'en-CA')
      // Edge cases: Overdue tasks with due_date < today are excluded (only today's tasks)
      const { data: tasksDueToday, error: tasksError } = await supabase
        .from('tasks')
        .select('id, due_date, completed')
        .eq('business_id', business.id)
        .eq('due_date', todayStr)
        .eq('completed', false)

      if (tasksError) {
        console.error('[DashboardMetrics] Error fetching tasks:', tasksError)
        throw new Error('Failed to fetch tasks')
      }

      const tasksDueCount = tasksDueToday?.length || 0

      // Metric 3: Jobs Today
      // Definition: Jobs scheduled for today
      // Source: jobs table
      // Filter: business_id, scheduled_date = today (YYYY-MM-DD)
      // Edge cases: Cancelled jobs not excluded at database level (may need review)
      // Timezone: Client timezone (toLocaleDateString 'en-CA')
      const { data: jobsToday, error: jobsError } = await supabase
        .from('jobs')
        .select('id, scheduled_date, status')
        .eq('business_id', business.id)
        .eq('scheduled_date', todayStr)

      if (jobsError) {
        console.error('[DashboardMetrics] Error fetching jobs:', jobsError)
        throw new Error('Failed to fetch jobs')
      }

      // Exclude cancelled jobs
      const jobsTodayCount = jobsToday?.filter((j: any) => j.status !== 'cancelled').length || 0

      // Metric 4: Outstanding Payments
      // Definition: Payment requests with status = 'pending'
      // Source: payment_requests table joined with leads
      // Filter: business_id via leads, status = 'pending'
      // Edge cases: Failed, refunded, cancelled payments excluded
      // Optimization: Use inner join via RPC or proper join query (using in() for now as payment_requests may not have direct business_id)
      const { data: outstandingPayments, error: paymentsError } = await supabase
        .from('payment_requests')
        .select('id, status, amount_cents, lead_id')
        .eq('status', 'pending')
        .in('lead_id', allLeadIds)

      if (paymentsError) {
        console.error('[DashboardMetrics] Error fetching payment requests:', paymentsError)
        throw new Error('Failed to fetch payment requests')
      }

      const outstandingPaymentsCount = outstandingPayments?.length || 0

      // Metric 5: Payments Received This Week
      // Definition: Payment requests with status = 'paid' in last 7 days
      // Source: payment_requests table joined with leads
      // Filter: business_id via leads, status = 'paid', paid_at >= 7 days ago
      // Edge cases: Uses paid_at (completion time), not created_at
      // Timezone: Client timezone (JavaScript Date)
      const { data: paymentsThisWeek, error: paymentsWeekError } = await supabase
        .from('payment_requests')
        .select('id, status, paid_at, lead_id')
        .eq('status', 'paid')
        .gte('paid_at', sevenDaysAgo)
        .in('lead_id', allLeadIds)

      if (paymentsWeekError) {
        console.error('[DashboardMetrics] Error fetching payments week:', paymentsWeekError)
        throw new Error('Failed to fetch payments this week')
      }

      const paymentsThisWeekCount = paymentsThisWeek?.length || 0

      // Metric 6: Customers Waiting for Reply
      // Definition: Customers whose latest message in the last 7 days is inbound with no outbound reply after
      // Source: messages table joined with leads
      // Filter: business_id via leads, created_at >= 7 days ago
      // Logic: For each lead with recent activity, check if the latest message is inbound
      // Edge cases: Ignored customers excluded (already filtered via allLeadIds)
      // Timezone: Client timezone
      const { data: recentMessages, error: messagesError } = await supabase
        .from('messages')
        .select('lead_id, direction, created_at')
        .in('lead_id', allLeadIds)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })

      if (messagesError) {
        console.error('[DashboardMetrics] Error fetching messages:', messagesError)
        throw new Error('Failed to fetch messages')
      }

      // Group messages by lead_id and check if latest is inbound
      const leadLatestMessage: Record<string, { direction: string; created_at: string }> = {}
      recentMessages?.forEach((msg: any) => {
        if (!leadLatestMessage[msg.lead_id] || new Date(msg.created_at) > new Date(leadLatestMessage[msg.lead_id].created_at)) {
          leadLatestMessage[msg.lead_id] = { direction: msg.direction, created_at: msg.created_at }
        }
      })

      // Count leads where latest message is inbound (waiting for reply)
      const waitingForReplyCount = Object.values(leadLatestMessage).filter(
        (msg) => msg.direction === 'inbound'
      ).length

      const quickLookMetrics: QuickLookMetric[] = [
        {
          id: 'new-inquiries',
          label: 'New Inquiries',
          value: newInquiriesCount,
          icon: Users,
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          href: '/dashboard/leads',
          description: 'Today'
        },
        {
          id: 'waiting-reply',
          label: 'Waiting for Reply',
          value: waitingForReplyCount,
          icon: MessageSquareReply,
          color: 'text-amber-600 dark:text-amber-400',
          bgColor: 'bg-amber-50 dark:bg-amber-900/20',
          href: '/dashboard/leads',
          description: 'Last 7 days'
        },
        {
          id: 'tasks-due',
          label: 'Tasks Due',
          value: tasksDueCount,
          icon: CheckSquare,
          color: 'text-purple-600 dark:text-purple-400',
          bgColor: 'bg-purple-50 dark:bg-purple-900/20',
          href: '/dashboard/calendar',
          description: 'Today'
        },
        {
          id: 'jobs-today',
          label: 'Jobs Today',
          value: jobsTodayCount,
          icon: Calendar,
          color: 'text-violet-600 dark:text-violet-400',
          bgColor: 'bg-violet-50 dark:bg-violet-900/20',
          href: '/dashboard/calendar',
          description: 'Scheduled'
        },
        {
          id: 'outstanding-payments',
          label: 'Outstanding',
          value: outstandingPaymentsCount,
          icon: DollarSign,
          color: 'text-orange-600 dark:text-orange-400',
          bgColor: 'bg-orange-50 dark:bg-orange-900/20',
          href: '/dashboard/payments',
          description: 'Pending'
        },
        {
          id: 'payments-week',
          label: 'Received',
          value: paymentsThisWeekCount,
          icon: CreditCard,
          color: 'text-emerald-600 dark:text-emerald-400',
          bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
          href: '/dashboard/payments',
          description: 'This week'
        }
      ]

      setMetrics(quickLookMetrics)
    } catch (error) {
      console.error('Error fetching quick-look metrics:', error)
      setError(true)
      setMetrics([])
    } finally {
      setLoading(false)
    }
  }, [business])

  useEffect(() => {
    fetchMetrics()
  }, [fetchMetrics])

  const handleMetricClick = (href: string) => {
    router.push(href)
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-800/80 border border-border/50 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">At a Glance</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-lg mb-2"></div>
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16 mb-1"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-12"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800/80 border border-border/50 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">At a Glance</h3>
        </div>
        <div className="text-center py-6">
          <AlertCircle className="w-10 h-10 mx-auto text-amber-500 mb-2" />
          <p className="text-sm text-slate-600 dark:text-slate-400">Unable to load metrics</p>
          <button
            onClick={fetchMetrics}
            className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800/80 border border-border/50 rounded-xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-slate-900 dark:text-foreground">At a Glance</h3>
      </div>
      
      {metrics.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">No activity data available yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {metrics.map((metric) => (
            <MetricCard
              key={metric.id}
              id={metric.id}
              label={metric.label}
              value={metric.value}
              icon={metric.icon}
              color={metric.color}
              bgColor={metric.bgColor}
              href={metric.href}
              description={metric.description}
              onClick={() => {
                if (metric.href) {
                  handleMetricClick(metric.href)
                }
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}