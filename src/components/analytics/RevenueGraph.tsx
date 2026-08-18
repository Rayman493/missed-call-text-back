'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatCurrencyAxis, ChartTouchWrapper, useTouchDevice } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe } from '@/lib/analytics-timeframe'

interface RevenueData {
  date: string
  revenue: number
}

export default function RevenueGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<RevenueData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('30d')
  const isTouchDevice = useTouchDevice()

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      // Check if Stripe is connected
      if (!business?.stripe_connect_account_id) {
        setLoading(false)
        return
      }

      try {
        const supabase = createBrowserClient()

        // Calculate date range using shared utility
        const startDate = getStartDateForTimeframe(timeRange)
        const startDateIso = startDate.toISOString()

        // Fetch completed payments
        const { data: payments } = await supabase
          .from('payment_requests')
          .select('amount_cents, created_at')
          .eq('business_id', business.id)
          .eq('status', 'paid')
          .gte('created_at', startDateIso)
          .order('created_at', { ascending: true })

        // Group by date (convert cents to dollars)
        const groupedData: { [key: string]: number } = {}
        payments?.forEach((payment: any) => {
          const date = new Date(payment.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          groupedData[date] = (groupedData[date] || 0) + ((payment.amount_cents || 0) / 100)
        })

        // Convert to array
        const chartData = Object.entries(groupedData).map(([date, revenue]) => ({
          date,
          revenue
        }))

        setData(chartData)
      } catch (error) {
        console.error('[RevenueGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0
  const isStripeConnected = business?.stripe_connect_account_id

  // Calculate summary KPIs
  const totalRevenue = data.reduce((sum, day) => sum + day.revenue, 0)
  const peakDay = data.length > 0 ? data.reduce((max, day) => day.revenue > max.revenue ? day : max, data[0]) : null
  const averageDaily = data.length > 0 ? Math.round(totalRevenue / data.length) : 0

  // Single-point state: emphasize the actual observation
  const isSinglePoint = data.length === 1

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Payments Received</h3>
          </div>
          <PremiumSelect
            value={timeRange}
            onChange={setTimeRange}
            options={ANALYTICS_TIMEFRAME_OPTIONS}
          />
        </div>

        {!isEmpty && isStripeConnected && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">${totalRevenue.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {data.length === 1 ? 'payment received' : 'total revenue'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {data.length === 1
                ? `First payment: ${data[0].date}`
                : averageDaily > 0
                  ? `$${averageDaily.toLocaleString()} per day average`
                  : 'No payments yet'}
              {peakDay && data.length > 1 && ` • Peak: ${peakDay.date} ($${peakDay.revenue.toLocaleString()})`}
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : !isStripeConnected ? (
          <PremiumEmptyState
            icon={DollarSign}
            title="Connect Stripe to track payments"
            description="Link your Stripe account to automatically track completed payments and revenue over time."
          />
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={DollarSign}
            title="No payments yet"
            description="Completed payments will appear automatically as customers pay through ReplyFlow."
          />
        ) : (
          <div className="h-[260px]">
            <ChartTouchWrapper>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={CHART_STYLES.margin}>
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
                    tickFormatter={formatCurrencyAxis}
                  />
                  {!isTouchDevice && (
                    <Tooltip
                      content={<PremiumTooltip />}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#16a34a"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={isSinglePoint}
                    activeDot={{
                      r: isSinglePoint ? 6 : CHART_STYLES.activeDotRadius,
                      fill: '#16a34a',
                      strokeWidth: isSinglePoint ? 0 : CHART_STYLES.lineStrokeWidth
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartTouchWrapper>
          </div>
        )}
      </div>
    </Card>
  )
}
