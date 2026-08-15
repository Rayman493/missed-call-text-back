'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart3 } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'

type TimeRange = '7d' | '30d' | '90d' | '1y'

interface ConversionStage {
  name: string
  count: number
  percentage: number
  color: string
}

const TIME_RANGE_OPTIONS = [
  { value: '7d' as TimeRange, label: 'Last 7 Days' },
  { value: '30d' as TimeRange, label: 'Last 30 Days' },
  { value: '90d' as TimeRange, label: 'Last 90 Days' },
  { value: '1y' as TimeRange, label: 'This Year' },
]

const STAGE_COLORS: Record<string, string> = {
  leads: '#8B5CF6',
  engaged: '#3B82F6',
  jobs: '#10B981',
  paid: '#06B6D4',
}

export default function LeadConversionGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<ConversionStage[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()
        
        // Calculate date range
        const now = new Date()
        let startDate: Date
        switch (timeRange) {
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
            break
          case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
            break
          case '1y':
            startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)
            break
        }

        const startDateIso = startDate.toISOString()

        // Fetch all leads in the cohort (excluding deleted, demo, admin_test)
        const { data: leads } = await supabase
          .from('leads')
          .select('id, status, payment_status, raw_metadata')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .gte('created_at', startDateIso)

        if (!leads || leads.length === 0) {
          setData([])
          setLoading(false)
          return
        }

        // Exclude demo and admin_test leads
        const filteredLeads = leads.filter((lead: { raw_metadata: any }) => {
          const creationSource = lead.raw_metadata?.creation_source || lead.raw_metadata?.source
          return creationSource !== 'demo' && creationSource !== 'admin_test'
        })

        if (filteredLeads.length === 0) {
          setData([])
          setLoading(false)
          return
        }

        // Extract lead IDs for cohort
        const leadIds = filteredLeads.map((l: { id: string }) => l.id)
        const totalLeads = filteredLeads.length

        // Stage 1: Leads (already have this from cohort query)
        const leadsCount = totalLeads

        // Stage 2: Engaged - leads with status != 'new' OR at least one caller message
        // Check for messages from caller for these leads
        const { data: callerMessages } = await supabase
          .from('messages')
          .select('lead_id')
          .in('lead_id', leadIds)
          .eq('sender', 'caller')

        const leadsWithCallerMessages = new Set((callerMessages?.map((m: { lead_id: string }) => m.lead_id)) || [])
        
        // Count engaged leads (status != 'new' OR has caller message)
        const engagedCount = filteredLeads.filter((lead: { id: string; status: string }) => 
          lead.status !== 'new' || leadsWithCallerMessages.has(lead.id)
        ).length

        // Stage 3: Job Created - leads with any job
        const { data: allJobs } = await supabase
          .from('jobs')
          .select('lead_id')
          .in('lead_id', leadIds)
          .not('lead_id', 'is', null)

        const jobsCount = new Set((allJobs?.map((j: { lead_id: string }) => j.lead_id)) || []).size

        // Stage 4: Paid - leads with leads.payment_status='paid' OR payment_requests.status='paid' with lead_id
        // Check leads.payment_status first (denormalized field)
        const leadsWithPaymentStatusPaid = new Set(
          filteredLeads
            .filter((lead: { payment_status: string }) => lead.payment_status === 'paid')
            .map((lead: { id: string }) => lead.id)
        )

        // Check payment_requests.status='paid' with non-null lead_id
        const { data: paidPayments } = await supabase
          .from('payment_requests')
          .select('lead_id')
          .in('lead_id', leadIds)
          .eq('status', 'paid')
          .not('lead_id', 'is', null)

        const leadsWithPaidPaymentRequests = new Set((paidPayments?.map((p: { lead_id: string }) => p.lead_id)) || [])

        // Union of both payment sources
        const paidCount = new Set([
          ...leadsWithPaymentStatusPaid,
          ...leadsWithPaidPaymentRequests
        ]).size

        // Build conversion data with percentages from original cohort
        const conversionData: ConversionStage[] = [
          {
            name: 'Leads',
            count: leadsCount,
            percentage: leadsCount > 0 ? 100 : 0,
            color: STAGE_COLORS.leads
          },
          {
            name: 'Engaged',
            count: engagedCount,
            percentage: leadsCount > 0 ? Math.round((engagedCount / leadsCount) * 100) : 0,
            color: STAGE_COLORS.engaged
          },
          {
            name: 'Jobs',
            count: jobsCount,
            percentage: leadsCount > 0 ? Math.round((jobsCount / leadsCount) * 100) : 0,
            color: STAGE_COLORS.jobs
          },
          {
            name: 'Paid',
            count: paidCount,
            percentage: leadsCount > 0 ? Math.round((paidCount / leadsCount) * 100) : 0,
            color: STAGE_COLORS.paid
          }
        ]

        setData(conversionData)
      } catch (error) {
        console.error('[LeadConversionGraph] Error fetching data:', error)
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0

  // Calculate summary
  const leadsCount = data.find(d => d.name === 'Leads')?.count || 0
  const paidCount = data.find(d => d.name === 'Paid')?.count || 0
  const paidPercentage = data.find(d => d.name === 'Paid')?.percentage || 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Lead Conversion</h3>
          <PremiumSelect
            value={timeRange}
            onChange={(value) => setTimeRange(value as TimeRange)}
            options={TIME_RANGE_OPTIONS}
            className="text-xs"
          />
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{leadsCount.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">leads</span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {paidPercentage}% became paying customers
            </div>
            <div className="text-[10px] text-muted-foreground/50 mt-1">
              Share of leads reaching each outcome
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={BarChart3}
            title="No leads yet"
            description="Capture leads to track conversion outcomes."
          />
        ) : (
          <div className="h-[260px] overflow-y-auto">
            <div className="space-y-4">
              {data.map((stage, index) => (
                <div key={stage.name} className="flex items-center gap-4">
                  <div className="flex-shrink-0 w-24 text-xs font-medium text-muted-foreground text-right">
                    {stage.name}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="h-7 bg-muted/20 rounded-full overflow-hidden relative">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${stage.percentage}%`,
                          backgroundColor: stage.color,
                          opacity: 0.9
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex-shrink-0 w-16 text-xs font-semibold text-foreground text-right tabular-nums">
                    {stage.count}
                  </div>
                  <div className="flex-shrink-0 w-14 text-xs text-muted-foreground/70 text-right tabular-nums">
                    {stage.percentage}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
