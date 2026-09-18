'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, Label } from 'recharts'
import { CreditCard } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { ChartHeaderControls } from './ChartHeaderControls'
import { ChartPieTouchSurface } from './ChartPieTouchSurface'
import { PremiumTooltip, CHART_STYLES, formatInteger, useTouchDevice } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS } from '@/lib/analytics-timeframe'
import { getBusinessDaysAgoRelative } from '@/lib/business-date-utils'
import { normalizePaymentStatus, PAYMENT_STATUS_STYLES } from '@/lib/payment-status'

interface PaymentStatusData {
  name: string
  value: number
  color: string
}

// Use canonical payment status configuration from payment-status.ts
const STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.color])
)
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(PAYMENT_STATUS_STYLES).map(([status, style]) => [status, style.label])
)

export default function PaymentCollectionGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<PaymentStatusData[]>([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('90d')
  const [activeSlice, setActiveSlice] = useState<PaymentStatusData | null>(null)
  const isTouchDevice = useTouchDevice()

  useEffect(() => {
    let isMounted = true
    const fetchData = async () => {
      if (!business?.id) return

      try {
        const supabase = createBrowserClient()

        // Calculate date range based on selected timeframe
        const businessTimezone = business?.business_hours_timezone || 'UTC'
        const daysMap: Record<string, number | null> = { '7d': 7, '30d': 30, '90d': 90, '1y': 365, 'all_time': null }
        const daysAgo = daysMap[timeRange] ?? 90
        // 'all_time' → null start → no lower bound (earliest actual record)
        const startDateIso = daysAgo !== null ? getBusinessDaysAgoRelative(businessTimezone, daysAgo, new Date()) : null

        // Fetch payment requests grouped by status for selected timeframe
        let paymentsQuery = supabase
          .from('payment_requests')
          .select('status')
          .eq('business_id', business.id)
        if (startDateIso) paymentsQuery = paymentsQuery.gte('created_at', startDateIso)
        const { data: payments } = await paymentsQuery

        if (!isMounted) return

        // Count by status using canonical normalization
        const statusCounts: { [key: string]: number } = {}
        payments?.forEach((payment: any) => {
          const canonicalStatus = normalizePaymentStatus(payment.status)
          statusCounts[canonicalStatus] = (statusCounts[canonicalStatus] || 0) + 1
        })

        // Convert to array for chart with business-logical ordering
        const statusOrder = ['pending', 'paid', 'draft', 'failed', 'expired', 'cancelled']
        const chartData = statusOrder.map((status) => {
          const count = statusCounts[status] || 0
          if (count === 0) return null
          return {
            name: STATUS_LABELS[status] || status,
            value: count,
            color: STATUS_COLORS[status] || '#94A3B8'
          }
        }).filter((item): item is PaymentStatusData => item !== null)

        if (isMounted) {
          setData(chartData)
        }
      } catch (error) {
        if (isMounted) console.error('[PaymentCollectionGraph] Error fetching data:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    fetchData()
    return () => { isMounted = false }
  }, [business?.id, business?.business_hours_timezone, timeRange])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalPayments = data.reduce((sum, item) => sum + item.value, 0)
  const paidPayments = data.find(d => d.name === 'Paid')?.value || 0
  const pendingPayments = data.find(d => d.name === 'Pending')?.value || 0
  // Collection rate: percentage of all requests that were paid
  // Includes all statuses in denominator (paid, pending, failed, cancelled, expired, draft)
  const collectionRate = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <ChartHeaderControls title="Payment Collection">
          <PremiumSelect
            value={timeRange}
            onChange={setTimeRange}
            options={ANALYTICS_TIMEFRAME_OPTIONS}
            buttonClassName="h-10 sm:h-11 py-0"
          />
        </ChartHeaderControls>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalPayments.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">
                {totalPayments === 1 ? 'payment request' : 'payment requests'} • {ANALYTICS_TIMEFRAME_OPTIONS.find(o => o.value === timeRange)?.label.toLowerCase()}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              {paidPayments} paid, {pendingPayments} pending
            </div>
          </div>
        )}

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
          </div>
        ) : isEmpty ? (
          <PremiumEmptyState
            icon={CreditCard}
            title="No payment requests yet"
            description="Send payment requests to customers to track collection status."
          />
        ) : (
          <>
          <div
            className="h-[260px] w-full relative"
            onClick={(e) => {
              // Tapping a slice selects it; tapping anything else inside the
              // chart area (center whitespace, legend, empty space) dismisses.
              if ((e.target as HTMLElement).closest?.('.recharts-pie-sector, .recharts-sector')) return
              setActiveSlice(null)
            }}
          >
            <ChartPieTouchSurface className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    cx="50%"
                    cy="50%"
                    innerRadius={CHART_STYLES.donutInnerRadius}
                    outerRadius={CHART_STYLES.donutOuterRadius}
                    paddingAngle={data.length === 1 ? 0 : CHART_STYLES.donutPaddingAngle}
                    dataKey="value"
                    activeShape={false}
                    onClick={(_, index) =>
                      setActiveSlice(prev =>
                        prev && prev.name === data[index]?.name ? null : (data[index] ?? null)
                      )
                    }
                  >
                    {data.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.color}
                        className="focus:outline-none"
                      />
                    ))}
                  </Pie>
                  <Label
                    content={({ viewBox }: any) => {
                      if (!viewBox) return null
                      const { x, y, width, height } = viewBox
                      const cx = x + width / 2
                      const cy = y + height / 2

                      return (
                        <g>
                          <text x={cx} y={cy - 5} textAnchor="middle" dominantBaseline="middle" className="fill-foreground" style={{ fontSize: '20px', fontWeight: '600' }}>
                            {collectionRate}%
                          </text>
                          <text x={cx} y={cy + 10} textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground" style={{ fontSize: '10px' }}>
                            Collected
                          </text>
                        </g>
                      )
                    }}
                    position="center"
                  />
                  {!isTouchDevice && (
                    <Tooltip
                      content={<PremiumTooltip />}
                    />
                  )}
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    iconSize={CHART_STYLES.legendIconSize}
                    wrapperStyle={{ fontSize: `${CHART_STYLES.legendFontSize}px` }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartPieTouchSurface>
          </div>
          <div className="mt-1 h-7 flex items-center justify-center">
            {activeSlice && (
              <button
                type="button"
                onClick={() => setActiveSlice(null)}
                className="flex items-center gap-1.5 bg-card/90 border border-border/60 rounded-full px-2.5 py-1 shadow-sm text-[11px] text-foreground"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: activeSlice.color }}
                  aria-hidden="true"
                />
                <span className="truncate max-w-[110px]">{activeSlice.name}</span>
                <span className="font-medium tabular-nums">{formatInteger(activeSlice.value)}</span>
                <span className="text-muted-foreground/70">{Math.round((activeSlice.value / totalPayments) * 100)}%</span>
              </button>
            )}
          </div>
          </>
        )}
      </div>
    </Card>
  )
}
