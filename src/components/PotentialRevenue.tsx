'use client'

import React, { useState, useEffect } from 'react'
import { DollarSign, FileText, Calendar, User } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { CardSkeleton } from '@/components/ui/Skeleton'

interface PotentialRevenueProps {
  businessId: string
}

interface RevenueData {
  outstandingPayments: number
  readyToInvoice: number
  awaitingEstimate: number
  pipelineOpportunity: number
  totalOpportunity: number
}

interface RevenueItem {
  label: string
  value: number
  icon: React.ReactNode
}

export default function PotentialRevenue({ businessId }: PotentialRevenueProps) {
  const [data, setData] = useState<RevenueData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPotentialRevenue()
  }, [businessId])

  const fetchPotentialRevenue = async () => {
    try {
      const supabase = createBrowserClient()

      // 1. Outstanding Payments - Total unpaid payment requests
      const { data: payments } = await supabase
        .from('payment_requests')
        .select('amount')
        .eq('business_id', businessId)
        .in('status', ['pending', 'sent'])

      const outstandingPayments = (payments as any[])?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0

      // 2. Ready to Invoice - Completed jobs without payment requested
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, estimated_amount')
        .eq('business_id', businessId)
        .eq('status', 'completed')

      const completedJobIds = (jobs as any[])?.map((j: any) => j.id) || []

      const { data: jobPayments } = await supabase
        .from('payment_requests')
        .select('job_id')
        .eq('business_id', businessId)
        .in('job_id', completedJobIds)

      const paidJobIds = new Set((jobPayments as any[])?.map((p: any) => p.job_id))
      const readyToInvoice = (jobs as any[])
        ?.filter((j: any) => !paidJobIds.has(j.id))
        .reduce((sum: number, j: any) => sum + (j.estimated_amount || 0), 0) || 0

      // 3. Awaiting Estimate - Customers who completed intake but have no estimate/job yet
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .eq('business_id', businessId)
        .not('ai_intake', 'is', null)

      const { data: leadJobs } = await supabase
        .from('jobs')
        .select('lead_id')
        .eq('business_id', businessId)

      const leadsWithJobs = new Set((leadJobs as any[])?.map((j: any) => j.lead_id))
      const awaitingEstimate = (leads as any[])?.filter((l: any) => !leadsWithJobs.has(l.id)).length || 0

      // 4. Pipeline Opportunity - Scheduled jobs not yet completed
      const { data: scheduledJobs } = await supabase
        .from('jobs')
        .select('estimated_amount')
        .eq('business_id', businessId)
        .in('status', ['scheduled', 'in_progress'])

      const pipelineOpportunity = (scheduledJobs as any[])?.reduce((sum: number, j: any) => sum + (j.estimated_amount || 0), 0) || 0

      const totalOpportunity = outstandingPayments + readyToInvoice + pipelineOpportunity

      setData({
        outstandingPayments,
        readyToInvoice,
        awaitingEstimate,
        pipelineOpportunity,
        totalOpportunity
      })
    } catch (err) {
      console.error('[PotentialRevenue] Failed to fetch data:', err)
      setError('Unable to load revenue data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-5 h-5 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
        <div className="space-y-3">
          <ListItemSkeleton />
          <ListItemSkeleton />
          <ListItemSkeleton />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return null
  }

  const items: RevenueItem[] = [
    {
      label: 'Outstanding',
      value: data.outstandingPayments,
      icon: <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
    },
    {
      label: 'Ready to Invoice',
      value: data.readyToInvoice,
      icon: <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
    },
    {
      label: 'Pipeline',
      value: data.pipelineOpportunity,
      icon: <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
    },
    {
      label: 'Awaiting Estimate',
      value: data.awaitingEstimate,
      icon: <User className="w-4 h-4 text-orange-600 dark:text-orange-400" />
    }
  ]

  // Filter out items with zero values
  const nonZeroItems = items.filter(item => item.value > 0)

  if (nonZeroItems.length === 0) {
    return null
  }

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/50 rounded-2xl shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-700/50">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-foreground">
            Potential Revenue
          </h2>
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4">
        <div className="space-y-3">
          {nonZeroItems.map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  {item.label}
                </span>
              </div>
              <span className="text-sm font-semibold text-slate-900 dark:text-foreground">
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="mt-4 pt-4 border-t border-slate-200/70 dark:border-slate-700/50 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Total Opportunity
          </span>
          <span className="text-base font-bold text-slate-900 dark:text-foreground">
            {formatCurrency(data.totalOpportunity)}
          </span>
        </div>
      </div>
    </div>
  )
}

function ListItemSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
      </div>
      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
    </div>
  )
}

function formatCurrency(amount: number): string {
  if (amount === 0) return '$0'
  
  // For awaiting estimate, show count instead of currency
  if (amount < 100) {
    return `${amount} customers`
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}
