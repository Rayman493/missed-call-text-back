'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Briefcase } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks, ChartTouchWrapper } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe } from '@/lib/analytics-timeframe'

interface JobStatusData {
  status: string
  count: number
  color: string
}

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#3B82F6',
  in_progress: '#F59E0B',
  completed: '#10B981',
  cancelled: '#EF4444'
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
}

export default function JobsStatusGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<JobStatusData[]>([])
  const [loading, setLoading] = useState(true)
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

        // Fetch jobs grouped by status for selected timeframe
        const { data: jobs } = await supabase
          .from('jobs')
          .select('status')
          .eq('business_id', business.id)
          .gte('created_at', startDateIso)

        if (!isMounted) return

        // Count by status
        const statusCounts: { [key: string]: number } = {}
        jobs?.forEach((job: any) => {
          const status = job.status || 'scheduled'
          statusCounts[status] = (statusCounts[status] || 0) + 1
        })

        // Convert to array for chart with lifecycle ordering
        const statusOrder = ['scheduled', 'in_progress', 'completed', 'cancelled']
        const chartData = statusOrder.map((status) => {
          const count = statusCounts[status] || 0
          if (count === 0) return null
          return {
            status: STATUS_LABELS[status] || status,
            count,
            color: STATUS_COLORS[status] || '#94A3B8'
          }
        }).filter((item): item is JobStatusData => item !== null)

        // Add unknown bucket for unrecognized status values
        const recognizedStatuses = new Set(statusOrder)
        const unknownCount = Object.entries(statusCounts)
          .filter(([status]) => !recognizedStatuses.has(status))
          .reduce((sum, [, count]) => sum + count, 0)

        if (unknownCount > 0) {
          chartData.push({
            status: 'Unknown',
            count: unknownCount,
            color: '#94A3B8'
          })
        }

        if (isMounted) setData(chartData)
      } catch (error) {
        if (isMounted) console.error('[JobsStatusGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id, timeRange])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalJobs = data.reduce((sum, item) => sum + item.count, 0)
  const completedJobs = data.find(d => d.status === 'Completed')?.count || 0
  const scheduledJobs = data.find(d => d.status === 'Scheduled')?.count || 0

  // Calculate max value for X-axis ticks
  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.count)) : 0
  const xTicks = getIntegerTicks(maxValue)

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Jobs by Status</h3>
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
              <span className="text-2xl font-semibold text-foreground">{totalJobs.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalJobs === 1 ? 'job' : 'jobs'} • {ANALYTICS_TIMEFRAME_OPTIONS.find(o => o.value === timeRange)?.label.toLowerCase()}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {totalJobs === 1 && data.length === 1
                ? `${data[0].status}`
                : `${scheduledJobs} scheduled, ${completedJobs} completed`}
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Jobs created from customer conversations will appear here with their status."
          />
        ) : (
          <div className="h-[260px]">
            <ChartTouchWrapper>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                  <CartesianGrid
                    strokeDasharray={CHART_STYLES.gridStrokeDasharray}
                    stroke={CHART_STYLES.gridStroke}
                    strokeOpacity={CHART_STYLES.gridStrokeOpacity}
                    horizontal={false}
                  />
                  <XAxis
                    type="number"
                    className="text-[10px] text-muted-foreground/60 pointer-events-none"
                    tick={{ fontSize: CHART_STYLES.tickFontSize }}
                    axisLine={CHART_STYLES.axisLine}
                    tickLine={CHART_STYLES.tickLine}
                    domain={[0, 'auto']}
                    ticks={xTicks}
                    tickFormatter={formatInteger}
                    allowDecimals={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="status"
                    className="text-[10px] text-muted-foreground/60 pointer-events-none"
                    tick={{ fontSize: CHART_STYLES.tickFontSize }}
                    width={100}
                    axisLine={CHART_STYLES.axisLine}
                    tickLine={CHART_STYLES.tickLine}
                  />
                  <Tooltip
                    content={<PremiumTooltip />}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                  />
                  <Bar
                    dataKey="count"
                    radius={[0, 3, 3, 0]}
                    barSize={24}
                    maxBarSize={CHART_STYLES.barMaxSize}
                  >
                    {data.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartTouchWrapper>
          </div>
        )}
      </div>
    </Card>
  )
}
