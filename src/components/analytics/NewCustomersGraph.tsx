'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import ChartFilterButton from '@/components/ui/ChartFilterButton'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { ChartHeaderControls } from './ChartHeaderControls'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks, useTouchDevice, ChartPassiveTouchSurface, ChartSelectionPopup } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getDaysInTimeframe } from '@/lib/analytics-timeframe'
import { getBusinessDaysAgoRelative, formatBusinessLocalDate } from '@/lib/business-date-utils'

interface NewCustomersData {
  date: string
  customers: number
}

export default function NewCustomersGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<NewCustomersData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('30d')
  const [selectedDatum, setSelectedDatum] = useState<NewCustomersData | null>(null)
  const isTouchDevice = useTouchDevice()

  // A pinned popup belongs to a specific filter view; changing filters hides it.
  useEffect(() => {
    setSelectedDatum(null)
  }, [timeRange])

  const toggleDatum = (index: number) => {
    setSelectedDatum((prev) =>
      prev && prev.date === data[index]?.date ? null : (data[index] ?? null)
    )
  }

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Calculate date range using business timezone
        const businessTimezone = business.business_hours_timezone || 'UTC'
        const daysMap: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all_time': null }
        const daysAgo = daysMap[timeRange] ?? 30
        // 'all_time' → null start → no lower bound (earliest actual record)
        const startDateIso = daysAgo !== null ? getBusinessDaysAgoRelative(businessTimezone, daysAgo, new Date()) : null

        // Fetch leads grouped by date
        let leadsQuery = supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .is('deleted_at', null)
        if (startDateIso) leadsQuery = leadsQuery.gte('created_at', startDateIso)
        const { data: leads } = await leadsQuery.order('created_at', { ascending: true })

        // Group by business-local date
        const groupedData: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          const date = formatBusinessLocalDate(lead.created_at, businessTimezone)
          groupedData[date] = (groupedData[date] || 0) + 1
        })

        // Convert to array
        const chartData = Object.entries(groupedData).map(([date, customers]) => ({
          date,
          customers
        }))

        setData(chartData)
      } catch (error) {
        console.error('[NewCustomersGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalCustomers = data.reduce((sum, day) => sum + day.customers, 0)
  const peakDay = data.length > 0 ? data.reduce((max, day) => day.customers > max.customers ? day : max, data[0]) : null

  // Calculate average across the selected period, not just days with customers.
  // For 'all_time', use the earliest actual record date so the average reflects
  // the real interval (no artificial start-date cutoff).
  const earliestDataDate = data.length > 0 ? new Date(data[0].date) : null
  const daysInRange = getDaysInTimeframe(timeRange, earliestDataDate)
  const averageDaily = totalCustomers > 0 ? (totalCustomers / daysInRange) : 0

  // Calculate max value for Y-axis ticks
  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.customers)) : 0
  const yTicks = getIntegerTicks(maxValue)

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <ChartHeaderControls title="New Customers">
          <ChartFilterButton
            groups={[{
              label: 'Time range',
              value: timeRange,
              onChange: (v) => setTimeRange(v as AnalyticsTimeframe),
              options: ANALYTICS_TIMEFRAME_OPTIONS,
              activeValue: '30d',
            }]}
          />
        </ChartHeaderControls>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalCustomers.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalCustomers === 1 ? 'new customer' : 'new customers'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {totalCustomers === 1 && timeRange === '30d'
                ? '1 new customer this month'
                : averageDaily > 0
                  ? `${averageDaily.toFixed(1)} per day average`
                  : 'No data yet'}
              {peakDay && ` • Peak: ${peakDay.date} (${peakDay.customers})`}
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={Users}
            title="No new customers yet"
            description="Missed calls converted to customers will appear here over time."
          />
        ) : (
          <div
            className="h-[260px] relative"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest?.('.recharts-bar-rectangle')) return
              setSelectedDatum(null)
            }}
          >
            <ChartPassiveTouchSurface className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={CHART_STYLES.margin} barGap={CHART_STYLES.barGap} barCategoryGap={CHART_STYLES.categoryGap}>
                    <CartesianGrid
                      strokeDasharray={CHART_STYLES.gridStrokeDasharray}
                      stroke={CHART_STYLES.gridStroke}
                      strokeOpacity={CHART_STYLES.gridStrokeOpacity}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      className="text-[10px] text-muted-foreground/60 pointer-events-none"
                      tick={{ fontSize: CHART_STYLES.tickFontSize }}
                      axisLine={CHART_STYLES.axisLine}
                      tickLine={CHART_STYLES.tickLine}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      className="text-[10px] text-muted-foreground/60 pointer-events-none"
                      tick={{ fontSize: CHART_STYLES.tickFontSize }}
                      axisLine={CHART_STYLES.axisLine}
                      tickLine={CHART_STYLES.tickLine}
                      ticks={yTicks}
                      tickFormatter={formatInteger}
                    />
                    {!isTouchDevice && (
                      <Tooltip
                        content={<PremiumTooltip />}
                        cursor={false}
                      />
                    )}
                    <Bar
                      dataKey="customers"
                      radius={CHART_STYLES.barRadius}
                      maxBarSize={CHART_STYLES.barMaxSize}
                      activeBar={false}
                      onClick={(_, index) => toggleDatum(index)}
                    >
                      {data.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill="hsl(var(--primary))"
                          fillOpacity={selectedDatum?.date === entry.date ? 1 : 0.8}
                          className="transition-all duration-200"
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            </ChartPassiveTouchSurface>
            {selectedDatum && (
              <ChartSelectionPopup
                label={selectedDatum.date}
                values={[{ label: 'New Customers', value: formatInteger(selectedDatum.customers) }]}
                onDismiss={() => setSelectedDatum(null)}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
