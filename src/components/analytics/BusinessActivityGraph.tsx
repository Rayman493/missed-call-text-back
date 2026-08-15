'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Activity } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'
import { PremiumTooltip, CHART_STYLES, formatInteger, getIntegerTicks } from '@/lib/chart-utils'
import { AnalyticsTimeframe, ANALYTICS_TIMEFRAME_OPTIONS, getStartDateForTimeframe } from '@/lib/analytics-timeframe'

const SERIES_LABELS: Record<string, string> = {
  conversations: 'Conversations',
  appointments: 'Appointments',
  paymentRequests: 'Payment Requests',
  completedJobs: 'Completed Jobs'
}

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
  const [timeRange, setTimeRange] = useState<AnalyticsTimeframe>('30d')

  useEffect(() => {
    const fetchData = async () => {
      if (!business) return

      try {
        const supabase = createBrowserClient()

        // Calculate date range using shared utility
        const startDate = getStartDateForTimeframe(timeRange)
        const startDateIso = startDate.toISOString()

        // Fetch conversations (leads with conversation_id)
        const { data: conversations } = await supabase
          .from('leads')
          .select('created_at, conversation_id')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .not('conversation_id', 'is', null)
          .gte('created_at', startDateIso)

        // Fetch appointments from meeting_records
        const { data: appointments } = await supabase
          .from('meeting_records')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', startDateIso)

        // Fetch payment requests
        const { data: paymentRequests } = await supabase
          .from('payment_requests')
          .select('created_at')
          .eq('business_id', business.id)
          .gte('created_at', startDateIso)

        // Fetch completed jobs
        const { data: completedJobs } = await supabase
          .from('jobs')
          .select('created_at')
          .eq('business_id', business.id)
          .eq('status', 'completed')
          .gte('created_at', startDateIso)

        // Group by date
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
          const date = new Date(conv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'conversations')
        })

        appointments?.forEach((apt: any) => {
          const date = new Date(apt.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'appointments')
        })

        paymentRequests?.forEach((pr: any) => {
          const date = new Date(pr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'paymentRequests')
        })

        completedJobs?.forEach((job: any) => {
          const date = new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          addToGroup(date, 'completedJobs')
        })

        // Convert to array and sort by date
        const chartData = Object.values(groupedData).sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )

        setData(chartData)
      } catch (error) {
        console.error('[BusinessActivityGraph] Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [business, timeRange])

  const isEmpty = data.length === 0

  // Calculate summary KPIs
  const totalInteractions = data.reduce((sum, day) =>
    sum + day.conversations + day.appointments + day.paymentRequests + day.completedJobs, 0
  )
  const peakDay = data.length > 0 ? data.reduce((max, day) => {
    const dayTotal = day.conversations + day.appointments + day.paymentRequests + day.completedJobs
    return dayTotal > (max.conversations + max.appointments + max.paymentRequests + max.completedJobs) ? day : max
  }, data[0]) : null
  const averageDaily = data.length > 0 ? Math.round(totalInteractions / data.length) : 0

  // Calculate max value for Y-axis ticks
  const maxValue = data.length > 0 ? Math.max(...data.map(d =>
    d.conversations + d.appointments + d.paymentRequests + d.completedJobs
  )) : 0
  const yTicks = getIntegerTicks(maxValue)

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Customer Engagement</h3>
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
          <div className="h-[260px]">
            <div className="h-full w-full select-none">
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
                    ticks={yTicks}
                    tickFormatter={formatInteger}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload || payload.length === 0) return null

                      return (
                        <div className="bg-card border border-border/50 rounded-lg shadow-lg px-3 py-2.5 min-w-[160px]">
                          <p className="text-[11px] font-semibold text-foreground mb-1.5">{label}</p>
                          {payload.map((entry: any, index: number) => {
                            const key = entry.dataKey as string
                            const label = SERIES_LABELS[key] || entry.dataKey
                            return (
                              <div key={index} className="flex items-center justify-between gap-3 text-[11px]">
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-muted-foreground">{label}</span>
                                </div>
                                <span className="font-medium text-foreground tabular-nums">{entry.value}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    }}
                  />
                  <Legend
                    content={({ payload }: any) => (
                      <div className="flex flex-wrap gap-3 justify-center pt-2">
                        {payload.map((entry: any, index: number) => {
                          const key = entry.dataKey as string
                          const label = SERIES_LABELS[key] || entry.dataKey
                          const total = data.reduce((sum, day) => {
                            const value = day[key as keyof ActivityData]
                            return sum + (typeof value === 'number' ? value : 0)
                          }, 0)
                          return (
                            <div key={index} className="flex items-center gap-1.5">
                              <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-[10px] text-muted-foreground">
                                {label}: <span className="font-medium text-foreground">{total}</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    wrapperStyle={{ paddingTop: '12px' }}
                    iconType="circle"
                    iconSize={CHART_STYLES.legendIconSize}
                    verticalAlign="bottom"
                    height={28}
                  />
                  <Line
                    type="monotone"
                    dataKey="conversations"
                    stroke="#3b82f6"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={false}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#3b82f6', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Conversations"
                  />
                  <Line
                    type="monotone"
                    dataKey="appointments"
                    stroke="#22c55e"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={false}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#22c55e', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Appointments"
                  />
                  <Line
                    type="monotone"
                    dataKey="paymentRequests"
                    stroke="#f59e0b"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={false}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#f59e0b', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Payment Requests"
                  />
                  <Line
                    type="monotone"
                    dataKey="completedJobs"
                    stroke="#8b5cf6"
                    strokeWidth={CHART_STYLES.lineStrokeWidth}
                    dot={false}
                    activeDot={{ r: CHART_STYLES.activeDotRadius, fill: '#8b5cf6', strokeWidth: CHART_STYLES.lineStrokeWidth }}
                    name="Completed Jobs"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
