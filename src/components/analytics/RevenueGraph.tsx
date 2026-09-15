'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatCurrencyAxis, ChartTouchWrapper, useTouchDevice } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS } from '@/lib/analytics-timeframe'
import { getBusinessDaysAgoRelative, formatBusinessLocalDate } from '@/lib/business-date-utils'
import { formatCurrency } from '@/lib/utils'

interface RevenueData {
  date: string
  revenue: number
}

export default function RevenueGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<RevenueData[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('30d')
  const isTouchDevice = useTouchDevice()
  // Tracks whether the initial load has completed. Distinguishes the
  // first fetch (full "Loading..." state) from subsequent range changes
  // (subtle "Updating..." indicator that keeps the previous chart visible).
  const hasInitialLoadRef = useRef(false)

  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  useEffect(() => {
    let isStale = false
    const fetchData = async () => {
      if (!business) return

      // Check if Stripe is connected
      if (!business?.stripe_connect_account_id) {
        if (!isStale) {
          setLoading(false)
          setUpdating(false)
        }
        return
      }

      // For the initial load, `loading` is already true from initial state.
      // For subsequent range changes, show the subtle updating indicator
      // while keeping the previous chart visible (no layout shift).
      const isInitial = !hasInitialLoadRef.current
      if (!isInitial) {
        setUpdating(true)
      }

      try {
        const supabase = createBrowserClient()

        // Calculate date range using business timezone
        const businessTimezone = business.business_hours_timezone || 'UTC'
        const daysMap: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all_time': null }
        const daysAgo = daysMap[timeRange] ?? 30
        // 'all_time' → null start → no lower bound (earliest actual record)
        const startDateIso = daysAgo !== null ? getBusinessDaysAgoRelative(businessTimezone, daysAgo, new Date()) : null

        // Fetch completed payments
        let paymentsQuery = supabase
          .from('payment_requests')
          .select('amount_cents, created_at')
          .eq('business_id', business.id)
          .eq('status', 'paid')
        if (startDateIso) {
          paymentsQuery = paymentsQuery.gte('created_at', startDateIso)
        }
        const { data: payments } = await paymentsQuery
          .order('created_at', { ascending: true })

        // Group by business-local date (convert cents to dollars)
        const groupedData: { [key: string]: number } = {}
        payments?.forEach((payment: any) => {
          const date = formatBusinessLocalDate(payment.created_at, businessTimezone)
          groupedData[date] = (groupedData[date] || 0) + ((payment.amount_cents || 0) / 100)
        })

        // Convert to array
        const chartData = Object.entries(groupedData).map(([date, revenue]) => ({
          date,
          revenue
        }))

        // Guard against stale responses from a previous range selection
        // (rapid range changes: only the latest request's data is committed).
        if (!isStale) {
          setData(chartData)
        }
      } catch (error) {
        console.error('[RevenueGraph] Error fetching data:', error)
      } finally {
        if (!isStale) {
          if (isInitial) {
            hasInitialLoadRef.current = true
          }
          setLoading(false)
          setUpdating(false)
        }
      }
    }

    fetchData()
    // Clear stale active selection when range changes
    setActiveIndex(null)
    return () => { isStale = true }
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
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Payments Received</h3>
          </div>
          <div className="flex items-center gap-2">
            <PremiumSelect
              value={timeRange}
              onChange={setTimeRange}
              options={ANALYTICS_TIMEFRAME_OPTIONS}
            />
          </div>
        </div>

        {!isEmpty && isStripeConnected && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{formatCurrency(totalRevenue)}</span>
              <span className="text-xs text-muted-foreground">
                {data.length === 1 ? 'payment received' : 'total revenue'}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {data.length === 1
                ? `First payment: ${data[0].date}`
                : averageDaily > 0
                  ? `${formatCurrency(averageDaily)} per day average`
                  : 'No payments yet'}
              {peakDay && data.length > 1 && ` • Peak: ${peakDay.date} (${formatCurrency(peakDay.revenue)})`}
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
          <div className="h-[260px] relative">
            {/* Single subtle updating indicator — absolutely positioned, does
                NOT consume flex width, does NOT shift layout, does NOT blur
                or dim the chart. Previous chart stays fully visible. */}
            {updating && (
              <div className="absolute top-1 right-1 z-10 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-card/80 px-2 py-1 rounded-md pointer-events-none" aria-live="polite">
                <span className="inline-block w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                Updating…
              </div>
            )}
            <ChartTouchWrapper data={data} onActiveIndexChange={setActiveIndex}>
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
                  <Tooltip
                    content={<PremiumTooltip />}
                    trigger={isTouchDevice ? 'click' : 'hover'}
                  />
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
