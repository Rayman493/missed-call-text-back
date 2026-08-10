'use client'

import React, { useEffect, useState } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Activity } from 'lucide-react'
import Card from '@/components/ui/Card'
import PremiumSelect from '@/components/ui/PremiumSelect'
import PremiumEmptyState from '@/components/ui/PremiumEmptyState'

type TimeRange = '7d' | '30d' | '90d' | '1y'

const TIME_RANGE_OPTIONS = [
  { value: '7d' as TimeRange, label: 'Last 7 Days' },
  { value: '30d' as TimeRange, label: 'Last 30 Days' },
  { value: '90d' as TimeRange, label: 'Last 90 Days' },
  { value: '1y' as TimeRange, label: 'This Year' },
]

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
  const [timeRange, setTimeRange] = useState<TimeRange>('30d')
  const [showLegend, setShowLegend] = useState(true)

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

        // Fetch conversations (leads with conversation_id)
        const { data: conversations } = await supabase
          .from('leads')
          .select('created_at, conversation_id')
          .eq('business_id', business.id)
          .is('deleted_at', null)
          .is('ignored_at', null)
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

  return (
    <Card className="h-full" variant="hero" padding="md">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Customer Engagement</h3>
          </div>
          <div className="flex items-center gap-2">
            <PremiumSelect
              value={timeRange}
              onChange={setTimeRange}
              options={TIME_RANGE_OPTIONS}
            />
            <button
              onClick={() => setShowLegend(!showLegend)}
              className="text-[11px] border border-border/40 rounded-lg px-2.5 py-1.5 bg-background text-foreground hover:bg-muted/40 transition-colors"
            >
              {showLegend ? 'Hide' : 'Show'}
            </button>
          </div>
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
                <LineChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/10 pointer-events-none" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    className="text-[10px] text-muted-foreground/60 pointer-events-none"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    className="text-[10px] text-muted-foreground/60 pointer-events-none"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }: any) => {
                      if (!active || !payload || payload.length === 0) return null

                      return (
                        <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
                          <p className="text-[11px] font-medium text-foreground mb-2">{label}</p>
                          {payload.map((entry: any, index: number) => {
                            const key = entry.dataKey as string
                            const label = SERIES_LABELS[key] || entry.dataKey
                            return (
                              <div key={index} className="flex items-center justify-between gap-4 text-[10px]">
                                <div className="flex items-center gap-1.5">
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-muted-foreground">{label}</span>
                                </div>
                                <span className="font-medium text-foreground">{entry.value}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    }}
                  />
                  {showLegend && (
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
                      iconSize={6}
                      verticalAlign="bottom"
                      height={28}
                    />
                  )}
                  <Line 
                    type="monotone" 
                    dataKey="conversations" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 2 }}
                    name="Conversations"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="appointments" 
                    stroke="#22c55e" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 2 }}
                    name="Appointments"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="paymentRequests" 
                    stroke="#f59e0b" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#f59e0b', strokeWidth: 2 }}
                    name="Payment Requests"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="completedJobs" 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2 }}
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
