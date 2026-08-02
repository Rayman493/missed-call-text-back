'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Business } from '@/lib/types'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter } from 'next/navigation'
import { Users, MessageSquareReply, CheckSquare, Calendar, DollarSign, CreditCard, Loader2 } from 'lucide-react'

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

  const fetchMetrics = useCallback(async () => {
    if (!business) return

    setLoading(true)
    try {
      const supabase = createBrowserClient()
      
      // Time windows - using client timezone
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const todayStartISO = todayStart.toISOString()
      const todayStr = todayStart.toLocaleDateString('en-CA') // YYYY-MM-DD
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

      // Metric 1: New Customers Today
      // Definition: Leads created today, excluding manual entries
      // Source: leads table
      // Filter: business_id, created_at >= today_start, status != 'ignored', source not manual
      const { data: newCustomersToday } = await supabase
        .from('leads')
        .select('id, created_at, raw_metadata, status')
        .eq('business_id', business.id)
        .gte('created_at', todayStartISO)
        .is('deleted_at', null)
        .neq('status', 'ignored')

      const newCustomersCount = newCustomersToday?.filter((l: any) => 
        l.raw_metadata?.source !== 'manual_entry' && l.raw_metadata?.source !== 'manual_backfill'
      ).length || 0

      // Metric 2: Tasks Due Today
      // Definition: Tasks with due_date = today and completed = false
      // Source: tasks table
      // Filter: business_id, due_date = today, completed = false
      const { data: tasksDueToday } = await supabase
        .from('tasks')
        .select('id, due_date, completed')
        .eq('business_id', business.id)
        .eq('due_date', todayStr)
        .eq('completed', false)

      const tasksDueCount = tasksDueToday?.length || 0

      // Metric 3: Jobs Today
      // Definition: Jobs scheduled for today
      // Source: jobs table
      // Filter: business_id, scheduled_date = today
      const { data: jobsToday } = await supabase
        .from('jobs')
        .select('id, scheduled_date')
        .eq('business_id', business.id)
        .eq('scheduled_date', todayStr)

      const jobsTodayCount = jobsToday?.length || 0

      // Metric 4: Outstanding Payments
      // Definition: Payment requests with status = 'pending'
      // Source: payment_requests table joined with leads
      // Filter: business_id via leads, status = 'pending'
      const { data: outstandingPayments } = await supabase
        .from('payment_requests')
        .select('id, status, amount_cents')
        .eq('status', 'pending')

      // Filter by business_id via lead relationship
      const leadIdsForBusiness = newCustomersToday?.map((l: any) => l.id) || []
      const { data: allBusinessLeads } = await supabase
        .from('leads')
        .select('id')
        .eq('business_id', business.id)
        .is('deleted_at', null)
      
      const allLeadIds = allBusinessLeads?.map((l: any) => l.id) || []
      
      const outstandingPaymentsCount = outstandingPayments?.filter((pr: any) => 
        allLeadIds.includes(pr.lead_id)
      ).length || 0

      // Metric 5: Payments This Week
      // Definition: Payment requests with status = 'paid' in last 7 days
      // Source: payment_requests table joined with leads
      // Filter: business_id via leads, status = 'paid', paid_at >= 7 days ago
      const { data: paymentsThisWeek } = await supabase
        .from('payment_requests')
        .select('id, status, paid_at, lead_id')
        .eq('status', 'paid')
        .gte('paid_at', sevenDaysAgo)

      const paymentsThisWeekCount = paymentsThisWeek?.filter((pr: any) => 
        allLeadIds.includes(pr.lead_id)
      ).length || 0

      // Metric 6: Customers Waiting for Reply
      // Definition: Customers with inbound message in last 7 days, no outbound reply after
      // Source: messages table joined with leads
      // Filter: business_id via leads, direction = 'inbound', created_at >= 7 days ago
      // Simplified: Count unique leads with inbound messages in last 7 days
      const { data: recentInboundMessages } = await supabase
        .from('messages')
        .select('lead_id, direction, created_at')
        .in('lead_id', allLeadIds)
        .eq('direction', 'inbound')
        .gte('created_at', sevenDaysAgo)

      const uniqueLeadsWithInbound = new Set(recentInboundMessages?.map((m: any) => m.lead_id) || [])
      const waitingForReplyCount = uniqueLeadsWithInbound.size

      const quickLookMetrics: QuickLookMetric[] = [
        {
          id: 'new-customers',
          label: 'New Customers',
          value: newCustomersCount,
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
      // On error, show zero metrics to avoid misleading data
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
      <div className="bg-white dark:bg-slate-800/80 border border-border/50 rounded-xl p-4 sm:p-5 shadow-sm">
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
          {metrics.map((metric) => {
            const Icon = metric.icon
            return (
              <button
                key={metric.id}
                onClick={() => metric.href && handleMetricClick(metric.href)}
                className={`text-left p-3 rounded-lg border border-border/30 hover:border-border/60 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-all duration-200 ${metric.href ? 'cursor-pointer' : ''}`}
              >
                <div className={`w-10 h-10 ${metric.bgColor} rounded-lg flex items-center justify-center mb-2`}>
                  <Icon className={`w-5 h-5 ${metric.color}`} />
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-foreground mb-0.5">
                  {metric.value}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-0.5">
                  {metric.label}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-500">
                  {metric.description}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}