'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatInteger } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe } from '@/lib/analytics-timeframe'

interface LeadSourceData {
  name: string
  value: number
  color: string
}

const SOURCE_COLORS: Record<string, string> = {
  replyflow_intake: '#8B5CF6',
  manual: '#F59E0B',
  excluded: '#94A3B8',
  unclassified: '#94A3B8'
}

const SOURCE_LABELS: Record<string, string> = {
  replyflow_intake: 'ReplyFlow Intake',
  manual: 'Manually Added',
  excluded: 'Excluded',
  unclassified: 'Unclassified'
}

export default function LeadsSourceGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<LeadSourceData[]>([])
  const [loading, setLoading] = useState(true)
  const [unclassifiedCount, setUnclassifiedCount] = useState(0)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('90d')

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()

        // Calculate date range based on selected timeframe
        const startDate = getStartDateForTimeframe(timeRange)
        const startDateIso = startDate.toISOString()

        // Fetch leads with raw_metadata for source classification
        const { data: leads } = await supabase
          .from('leads')
          .select('raw_metadata')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .gte('created_at', startDateIso)

        if (!isMounted) return

        // Helper: Check for historical AI-intake metadata in raw_metadata
        // This is for leads created before creation_source was consistently populated
        const hasHistoricalReplyFlowIntakeEvidence = (rawMetadata: any): boolean => {
          if (!rawMetadata) return false

          // HIGH-CONFIDENCE HISTORICAL SIGNALS
          // These metadata fields are only present when ReplyFlow AI intake pipeline processed the lead
          const hasAiIntakeCompleted = rawMetadata.ai_intake_completed === true
          const hasAiIntakePartial = rawMetadata.ai_intake_partial === true
          const hasCallSid = rawMetadata.ai_intake_latest_call_sid && rawMetadata.ai_intake_latest_call_sid.length > 0
          const hasCompletedAt = rawMetadata.ai_intake_completed_at && rawMetadata.ai_intake_completed_at.length > 0
          const hasAiSummarySms = rawMetadata.ai_summary_sms_sent === true
          const hasConfirmationSms = rawMetadata.ai_confirmation_sms_sent === true
          const hasSmsOutcome = rawMetadata.auto_sms_dispatch_outcome !== undefined

          // Support failed/incomplete AI intake records that entered the pipeline
          const hasFailedIntake = rawMetadata.ai_intake_completed === false &&
            (rawMetadata.extracted_info?.customerPhone || rawMetadata.failure_reason)

          return hasAiIntakeCompleted || hasAiIntakePartial || hasCallSid ||
                 hasCompletedAt || hasAiSummarySms || hasConfirmationSms ||
                 hasSmsOutcome || hasFailedIntake
        }

        // Normalize explicit source to canonical value
        const normalizeExplicitSource = (source: string): string | null => {
          if (!source || source === 'unknown') return null

          // ReplyFlow Intake: all automatic ReplyFlow acquisition paths
          if (source === 'voice' || source === 'ai_voice' || source === 'call_intake' || source === 'ai_intake' || source === 'sms') {
            return 'replyflow_intake'
          }

          // Manually Added: merchant/user-created leads
          if (source === 'manual' || source === 'manual_payment_request' || source === 'manual_entry' || source === 'manual_backfill') {
            return 'manual'
          }

          // Test/demo leads - excluded
          if (source === 'admin_test' || source === 'demo') {
            return 'excluded'
          }

          // Web source - unclassified (no proven acquisition meaning)
          if (source === 'web') {
            return 'unclassified'
          }

          // Unknown source value
          return 'unclassified'
        }

        // Resolve lead source with precedence: explicit source > historical metadata
        const resolveLeadSource = (lead: any): string => {
          // Priority 1: Explicit canonical source in raw_metadata
          const canonicalSource = lead.raw_metadata?.creation_source
          if (canonicalSource) {
            const normalized = normalizeExplicitSource(canonicalSource)
            if (normalized && normalized !== 'unclassified') {
              return canonicalSource // Return original source for normalization
            }
          }

          // Priority 2: Legacy source field in raw_metadata
          const legacySource = lead.raw_metadata?.source
          if (legacySource) {
            const normalized = normalizeExplicitSource(legacySource)
            if (normalized && normalized !== 'unclassified') {
              return legacySource // Return original source for normalization
            }
          }

          // Priority 3: Historical AI-intake metadata (only when explicit source is absent)
          // This is for leads created before creation_source was consistently populated
          if (hasHistoricalReplyFlowIntakeEvidence(lead.raw_metadata)) {
            return 'voice' // Classify as voice (ReplyFlow Intake)
          }

          // Priority 4: Unclassified
          return 'unknown'
        }

        // Count by resolved source
        const sourceCounts: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          const resolvedSource = resolveLeadSource(lead)
          // Exclude demo leads from production analytics
          if (resolvedSource !== 'demo') {
            sourceCounts[resolvedSource] = (sourceCounts[resolvedSource] || 0) + 1
          }
        })

        // Normalize source values to two customer-facing categories
        const normalizedCounts: { [key: string]: number } = {}
        let localUnclassifiedCount = 0
        Object.entries(sourceCounts).forEach(([source, count]) => {
          let normalizedSource: string | null = null

          // Exclude test/demo leads
          if (source === 'admin_test' || source === 'demo') {
            return
          }

          // Map to customer-facing categories based on creation path audit
          if (source === 'voice' || source === 'ai_voice' || source === 'call_intake' || source === 'ai_intake' || source === 'sms') {
            // ReplyFlow Intake: all automatic ReplyFlow acquisition paths (missed calls, SMS)
            normalizedSource = 'replyflow_intake'
          } else if (source === 'manual' || source === 'manual_payment_request' || source === 'manual_entry' || source === 'manual_backfill') {
            // Manually Added: leads created by user via manual entry or payment request
            normalizedSource = 'manual'
          } else {
            // Unclassified: source value not proven in audit (including 'web')
            normalizedSource = 'unclassified'
          }

          if (normalizedSource === 'unclassified') {
            localUnclassifiedCount += count
          } else if (normalizedSource) {
            normalizedCounts[normalizedSource] = (normalizedCounts[normalizedSource] || 0) + count
          }
        })

        // Convert to array for chart
        const chartData = Object.entries(normalizedCounts).map(([source, count]) => ({
          name: SOURCE_LABELS[source] || source,
          value: count,
          color: SOURCE_COLORS[source] || '#94A3B8'
        }))

        if (isMounted) {
          setData(chartData)
          setUnclassifiedCount(localUnclassifiedCount)
        }
      } catch (error) {
        if (isMounted) console.error('[LeadsSourceGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id, timeRange])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const classifiedTotal = data.reduce((sum, item) => sum + item.value, 0)
  const trueTotal = classifiedTotal + unclassifiedCount
  const replyflowIntake = data.find(d => d.name === 'ReplyFlow Intake')?.value || 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Leads by Source</h3>
          </div>
          <PremiumSelect
            value={timeRange}
            onChange={setTimeRange}
            options={ANALYTICS_TIMEFRAME_OPTIONS}
          />
        </div>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{trueTotal.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">total leads</span>
            </div>
            {replyflowIntake > 0 && (
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                {replyflowIntake} captured by ReplyFlow ({ANALYTICS_TIMEFRAME_OPTIONS.find(o => o.value === timeRange)?.label.toLowerCase()})
              </div>
            )}
            {unclassifiedCount > 0 && (
              <div className="text-[11px] text-muted-foreground/50 mt-1">
                {unclassifiedCount} historical {unclassifiedCount === 1 ? 'lead has' : 'leads have'} unclassified source data
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={Users}
            title="No leads yet"
            description="Leads will appear here as ReplyFlow captures missed calls and you add customers."
          />
        ) : (
          <div className="h-[260px]">
            <div className="h-full w-full select-none relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={CHART_STYLES.donutInnerRadius}
                    outerRadius={CHART_STYLES.donutOuterRadius}
                    paddingAngle={CHART_STYLES.donutPaddingAngle}
                    dataKey="value"
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={<PremiumTooltip />}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={CHART_STYLES.legendIconSize}
                    wrapperStyle={{ fontSize: `${CHART_STYLES.legendFontSize}px` }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center KPI - properly centered in donut hole */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ transform: 'translateY(-2px)' }}>
                <span className="text-2xl font-semibold text-foreground">{formatInteger(trueTotal)}</span>
                <span className="text-[10px] text-muted-foreground">Leads</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
