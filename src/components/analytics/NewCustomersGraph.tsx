'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks, ChartTouchWrapper, useTouchDevice } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe, getDaysInTimeframe } from '@/lib/analytics-timeframe'

interface NewCustomersData {
  date: string
  customers: number
}

export default function NewCustomersGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<NewCustomersData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('30d')
  const isTouchDevice = useTouchDevice()

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Calculate date range using shared utility
        const startDate = getStartDateForTimeframe(timeRange)
        const startDateIso = startDate.toISOString()

        // Fetch leads grouped by date
        const { data: leads } = await supabase
          .from('leads')
          .select('created_at')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .gte('created_at', startDateIso)
          .order('created_at', { ascending: true })

        // Group by date
        const groupedData: { [key: string]: number } = {}
        leads?.forEach((lead: any) => {
          const date = new Date(lead.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

  // Calculate average across the selected period, not just days with customers
  const daysInRange = getDaysInTimeframe(timeRange)
  const averageDaily = totalCustomers > 0 ? (totalCustomers / daysInRange) : 0

  // Calculate max value for Y-axis ticks
  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.customers)) : 0
  const yTicks = getIntegerTicks(maxValue)

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">New Customers</h3>
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
          <div className="h-[260px]">
            <ChartTouchWrapper>
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
                      cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }}
                    />
                  )}
                  <Bar
                    dataKey="customers"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.8}
                    radius={CHART_STYLES.barRadius}
                    maxBarSize={CHART_STYLES.barMaxSize}
                    className="hover:fill-opacity-100 transition-all"
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartTouchWrapper>
          </div>
        )}
      </div>
    </Card>
  )
}
