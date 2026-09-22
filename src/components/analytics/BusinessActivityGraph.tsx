'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Activity } from 'lucide-react'
import Card from '@/components/ui/Card'
import ChartFilterButton from '@/components/ui/ChartFilterButton'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { isDomNode } from '@/lib/utils'
import { ChartHeaderControls } from './ChartHeaderControls'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks, useTouchDevice, ChartPassiveTouchSurface, ChartHitDot } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS } from '@/lib/analytics-timeframe'
import { getBusinessDaysAgoRelative, formatBusinessLocalDate } from '@/lib/business-date-utils'

const SERIES_LABELS: Record<string, string> = {
  conversations: 'Conversations',
  appointments: 'Appointments',
  paymentRequests: 'Payment Requests',
  completedJobs: 'Completed Jobs'
}

const SERIES_COLORS: Record<string, string> = {
  conversations: '#3b82f6',
  appointments: '#22c55e',
  paymentRequests: '#f59e0b',
  completedJobs: '#8b5cf6',
}

const SERIES_KEYS = Object.keys(SERIES_LABELS) as (keyof ActivityData)[]

const SERIES_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  ...SERIES_KEYS.map((key) => ({ value: key as string, label: SERIES_LABELS[key] }))
]

interface ActivityData {
  date: string
  conversations: number
  appointments: number
  paymentRequests: number
  completedJobs: number
}

export default function BusinessActivityGraph() {
  const { business } = useBusiness()
  const [data, setData] = useState<ActivityData[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('30d')
  const [seriesFilter, setSeriesFilter] = useState<string>('all')
  const [selectedDatum, setSelectedDatum] = useState<{ index: number; seriesKey?: string; label: string; payload: any[] } | null>(null)
  const chartWrapperRef = useRef<HTMLDivElement>(null)
  const isTouchDevice = useTouchDevice()

  useEffect(() => {
    setSelectedDatum(null)
  }, [timeRange, seriesFilter])

  // Dismiss the tap-inspect popup when tapping outside the chart wrapper.
  // The chart itself and the popup live inside the wrapper, so taps there
  // keep the popup open and let the chart onClick update/close it.
  useEffect(() => {
    if (!selectedDatum) return
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!isDomNode(target)) return
      if (chartWrapperRef.current && !chartWrapperRef.current.contains(target)) {
        setSelectedDatum(null)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [selectedDatum])
  // Tracks whether the initial load has completed. Distinguishes the
  // first fetch (full "Loading..." state) from subsequent range changes
  // (subtle "Updating..." indicator that keeps the previous chart visible).
  const hasInitialLoadRef = useRef(false)

  useEffect(() => {
    let isStale = false
    const fetchData = async () => {
      if (!business) return

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

        // Fetch conversations (leads with conversation_id)
        let conversationsQuery = supabase
          .from('leads')
          .select('created_at, conversation_id')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .not('conversation_id', 'is', null)
        if (startDateIso) conversationsQuery = conversationsQuery.gte('created_at', startDateIso)
        const { data: conversations } = await conversationsQuery

        // Fetch appointments from meeting_records
        let appointmentsQuery = supabase
          .from('meeting_records')
          .select('created_at')
          .eq('business_id', business.id)
        if (startDateIso) appointmentsQuery = appointmentsQuery.gte('created_at', startDateIso)
        const { data: appointments } = await appointmentsQuery

        // Fetch payment requests
        let paymentRequestsQuery = supabase
          .from('payment_requests')
          .select('created_at')
          .eq('business_id', business.id)
        if (startDateIso) paymentRequestsQuery = paymentRequestsQuery.gte('created_at', startDateIso)
        const { data: paymentRequests } = await paymentRequestsQuery

        // Fetch completed jobs
        let completedJobsQuery = supabase
          .from('jobs')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('status', 'completed')
        if (startDateIso) completedJobsQuery = completedJobsQuery.gte('created_at', startDateIso)
        const { data: completedJobs } = await completedJobsQuery

        // Group by business-local date
        const groupedData: { [key: string]: ActivityData } = {}

        const addToGroup = (date: string, field: keyof ActivityData) => {
          if (!groupedData[date]) {
            groupedData[date] = {
              date,
              conversations: 0,
              appointments: 0,
              paymentRequests: 0,
              completedJobs: 0
            }
          }
          groupedData[date][field]++
        }

        conversations?.forEach((conv: any) => {
          const date = formatBusinessLocalDate(conv.created_at, businessTimezone)
          addToGroup(date, 'conversations')
        })

        appointments?.forEach((apt: any) => {
          const date = formatBusinessLocalDate(apt.created_at, businessTimezone)
          addToGroup(date, 'appointments')
        })

        paymentRequests?.forEach((pr: any) => {
          const date = formatBusinessLocalDate(pr.created_at, businessTimezone)
          addToGroup(date, 'paymentRequests')
        })

        completedJobs?.forEach((job: any) => {
          const date = formatBusinessLocalDate(job.created_at, businessTimezone)
          addToGroup(date, 'completedJobs')
        })

        // Convert to array and sort by date
        const chartData = Object.values(groupedData).sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        // Guard against stale responses from a previous range selection
        // (rapid range changes: only the latest request's data is committed).
        if (!isStale) {
          setData(chartData)
        }
      } catch (error) {
        console.error('[BusinessActivityGraph] Error fetching data:', error)
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
    return () => { isStale = true }
  }, [business, timeRange])

  const isEmpty = data.length === 0

  // Determine which series are currently visible
  const visibleKeys: (keyof ActivityData)[] =
    seriesFilter === 'all' ? SERIES_KEYS : [seriesFilter as keyof ActivityData]

  // Calculate summary KPIs from visible series only
  const getDayTotal = (day: ActivityData) =>
    visibleKeys.reduce((sum, key) => sum + (day[key] as number), 0)

  const totalInteractions = data.reduce((sum, day) => sum + getDayTotal(day), 0)
  const peakDay = data.length > 0
    ? data.reduce((max, day) => getDayTotal(day) > getDayTotal(max) ? day : max, data[0])
    : null
  const averageDaily = data.length > 0 ? Math.round(totalInteractions / data.length) : 0

  // Calculate max value for Y-axis ticks from visible series only
  const maxValue = data.length > 0 ? Math.max(...data.map(getDayTotal)) : 0
  const yTicks = getIntegerTicks(maxValue)

  // Tap-to-inspect: per-datum SVG hit targets (ChartHitDot) call this directly.
  // When a seriesKey is provided (multi-series line chart) the popup shows
  // only that exact series. Without a seriesKey the nearest-x fallback shows
  // all visible series for the tapped date.
  const toggleDatum = (idx: number, seriesKey?: string) => {
    if (idx < 0 || idx >= data.length) return
    // Exact-hit (a series dot): always show that series — including an honest
    // 0 — since the user tapped a visible point. Nearest-x fallback: only
    // series with values, and if none exist there is nothing to inspect, so
    // no tooltip at all (never a date-only popup).
    const payload = seriesKey
      ? [{
          dataKey: seriesKey,
          color: SERIES_COLORS[seriesKey],
          value: data[idx][seriesKey as keyof ActivityData],
        }]
      : visibleKeys
          .map((key) => ({
            dataKey: key,
            color: SERIES_COLORS[key],
            value: data[idx][key],
          }))
          .filter((entry) => typeof entry.value === 'number' && entry.value > 0)
    if (!seriesKey && payload.length === 0) {
      setSelectedDatum(null)
      return
    }
    setSelectedDatum(prev =>
      prev?.index === idx && prev?.seriesKey === seriesKey
        ? null
        : { index: idx, seriesKey, label: data[idx].date, payload }
    )
  }

  // Nearest-x fallback: a tap on the chart surface resolves to the closest
  // datum only when it is inside the plottable area and within the explicit
  // tap hit tolerance. Taps outside the plot, on axes/whitespace, or beyond
  // the tolerance clear the current selection.
  const handleChartAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const surface = (e.currentTarget as HTMLElement).querySelector('.recharts-surface') as SVGElement | null
    if (!surface || data.length === 0) {
      setSelectedDatum(null)
      return
    }
    const rect = surface.getBoundingClientRect()
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      setSelectedDatum(null)
      return
    }
    const marginLeft = CHART_STYLES.margin.left
    const marginRight = CHART_STYLES.margin.right
    const plotWidth = rect.width - marginLeft - marginRight
    if (plotWidth <= 0) {
      setSelectedDatum(null)
      return
    }
    const relativeX = e.clientX - rect.left - marginLeft
    if (relativeX < 0 || relativeX > plotWidth) {
      setSelectedDatum(null)
      return
    }
    if (data.length === 1) {
      toggleDatum(0)
      return
    }
    const index = Math.round((relativeX / plotWidth) * (data.length - 1))
    const clampedIndex = Math.max(0, Math.min(data.length - 1, index))
    const nearestX = (clampedIndex / (data.length - 1)) * plotWidth
    const halfStep = plotWidth / (data.length - 1) / 2
    const tolerance = Math.min(CHART_STYLES.tapHitTolerance, halfStep)
    if (Math.abs(relativeX - nearestX) > tolerance) {
      setSelectedDatum(null)
      return
    }
    toggleDatum(clampedIndex)
  }

  // Per-datum invisible SVG hit targets — ChartPassiveTouchSurface blocks
  // Recharts' own touch tracking, so each point owns its synthesized click.
  const renderHitDot = (color: string, seriesKey: string) => (dotProps: any) => (
    <ChartHitDot
      key={dotProps.key}
      cx={dotProps.cx}
      cy={dotProps.cy}
      index={dotProps.index}
      fill={color}
      onSelect={(idx) => toggleDatum(idx, seriesKey)}
    />
  )

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <ChartHeaderControls title="Customer Engagement">
          <ChartFilterButton
            groups={[
              {
                label: 'Time range',
                value: timeRange,
                onChange: (v) => setTimeRange(v as AnalyticsTimeframe),
                options: ANALYTICS_TIMEFRAME_OPTIONS,
                activeValue: '30d',
              },
              {
                label: 'Series',
                value: seriesFilter,
                onChange: setSeriesFilter,
                options: SERIES_FILTER_OPTIONS,
              },
            ]}
          />
        </ChartHeaderControls>

        {!isEmpty && (
          <div className="mb-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-foreground">{totalInteractions.toLocaleString()}</span>
              <span className="text-xs text-muted-foreground">total interactions</span>
            </div>
            {peakDay && (
              <div className="text-[11px] text-muted-foreground/70 mt-1">
                Peak: {peakDay.date} ({(peakDay.conversations + peakDay.appointments + peakDay.paymentRequests + peakDay.completedJobs).toLocaleString()})
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
            icon={Activity}
            title="No customer interactions yet"
            description="Daily customer interactions will appear here as ReplyFlow captures conversations, appointments, and payments."
          />
        ) : (
          <div ref={chartWrapperRef} className="h-[260px] relative">
            {/* Single subtle updating indicator — absolutely positioned, does
                NOT consume flex width, does NOT shift layout, does NOT blur
                or dim the chart. Previous chart stays fully visible. */}
            {updating && (
              <div className="absolute top-1 right-1 z-10 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-card/80 px-2 py-1 rounded-md pointer-events-none" aria-live="polite">
                <span className="inline-block w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                Updating…
              </div>
            )}
            {selectedDatum && (
              <div className="absolute top-1 right-1 z-20 max-w-[220px] bg-background/95 backdrop-blur-sm border border-border/50 rounded-lg shadow-sm px-2.5 py-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-[10px] mb-1 truncate">{selectedDatum.label}</p>
                    <div className="space-y-0.5">
                      {selectedDatum.payload
                        .filter((entry: any) => entry && typeof entry.value === 'number')
                        .map((entry: any, i: number) => {
                          const key = entry.dataKey as string
                          const label = SERIES_LABELS[key] || key
                          return (
                            <div key={i} className="flex items-center justify-between gap-3 text-[11px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                                <span className="text-muted-foreground truncate">{label}</span>
                              </div>
                              <span className="font-medium text-foreground tabular-nums">{entry.value}</span>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDatum(null)}
                    className="text-muted-foreground hover:text-foreground flex-shrink-0"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            <ChartPassiveTouchSurface className="w-full h-full" onClick={handleChartAreaClick}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{ ...CHART_STYLES.margin, bottom: 12 }}
                >
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
                      cursor={false}
                      content={({ active, payload, label }: any) => {
                        if (!active || !payload || payload.length === 0) return null

                        return (
                          <div className="bg-card border border-border/50 rounded-lg shadow-lg px-2 py-1.5 w-fit max-w-[min(70vw,220px)]">
                            <p className="text-[11px] font-semibold text-foreground mb-1">{label}</p>
                            {payload.map((entry: any, index: number) => {
                              const key = entry.dataKey as string
                              const label = SERIES_LABELS[key] || entry.dataKey
                              return (
                                <div key={index} className="flex items-center justify-between gap-2 text-[11px]">
                                  <div className="flex items-center gap-1.5">
                                    <div
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-muted-foreground truncate max-w-[120px]" title={label}>{label}</span>
                                  </div>
                                  <span className="font-medium text-foreground tabular-nums pl-1">{entry.value}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }}
                      trigger="hover"
                    />
                  )}
                  <Legend
                    content={({ payload }: any) => (
                      <div className="flex flex-wrap gap-2 sm:gap-3 justify-center px-2" role="group" aria-label="Series legend">
                        {payload
                          .filter((entry: any) => entry.inactive !== true)
                          .map((entry: any, index: number) => {
                            const key = entry.dataKey as string
                            const label = SERIES_LABELS[key] || entry.dataKey
                            const total = data.reduce((sum, day) => {
                              const value = day[key as keyof ActivityData]
                              return sum + (typeof value === 'number' ? value : 0)
                            }, 0)
                            return (
                              <div
                                key={index}
                                className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full"
                                  style={{ backgroundColor: entry.color }}
                                  aria-hidden="true"
                                />
                                <span>
                                  {label}: <span className="font-medium text-foreground">{total}</span>
                                </span>
                              </div>
                            )
                          })}
                      </div>
                    )}
                    wrapperStyle={{ paddingTop: 0 }}
                    iconType="circle"
                    iconSize={CHART_STYLES.legendIconSize}
                    verticalAlign="bottom"
                    height={64}
                  />
                  <Line
                    type="monotone"
                    dataKey="conversations"
                    stroke="#3b82f6"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={renderHitDot('#3b82f6', 'conversations')}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#3b82f6', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Conversations"
                    hide={seriesFilter !== 'all' && seriesFilter !== 'conversations'}
                  />
                  <Line
                    type="monotone"
                    dataKey="appointments"
                    stroke="#22c55e"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={renderHitDot('#22c55e', 'appointments')}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#22c55e', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Appointments"
                    hide={seriesFilter !== 'all' && seriesFilter !== 'appointments'}
                  />
                  <Line
                    type="monotone"
                    dataKey="paymentRequests"
                    stroke="#f59e0b"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={renderHitDot('#f59e0b', 'paymentRequests')}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#f59e0b', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Payment Requests"
                    hide={seriesFilter !== 'all' && seriesFilter !== 'paymentRequests'}
                  />
                  <Line
                    type="monotone"
                    dataKey="completedJobs"
                    stroke="#8b5cf6"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={renderHitDot('#8b5cf6', 'completedJobs')}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#8b5cf6', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Completed Jobs"
                    hide={seriesFilter !== 'all' && seriesFilter !== 'completedJobs'}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartPassiveTouchSurface>
          </div>
        )}
      </div>
    </Card>
  )
}
