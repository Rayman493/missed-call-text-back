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
  { value: '7d' as TimeRange, label: '7 Days' },
  { value: '30d' as TimeRange, label: '30 Days' },
  { value: '90d' as TimeRange, label: '90 Days' },
  { value: '1y' as TimeRange, label: 'Year' },
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

  return (
    <Card className="h-full border-border/30 shadow-none">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Customer Engagement</h3>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">Daily customer interactions</p>
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
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 16, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/10" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  className="text-[10px] text-muted-foreground/60"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  className="text-[10px] text-muted-foreground/60"
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '11px'
                  }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                {showLegend && (
                  <Legend 
                    wrapperStyle={{ fontSize: '10px', paddingTop: '12px', color: 'hsl(var(--muted-foreground))' }}
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
        )}
      </div>
    </Card>
  )
}
